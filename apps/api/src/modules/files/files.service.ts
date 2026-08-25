import { Inject, Injectable } from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import { DatabaseService } from '../../database/database.service';
import { DomainError } from '../../common/errors';
import { RequestUser } from '../../common/auth.decorators';
import { FILE_STORAGE, FileStorage } from './storage.adapter';

export type FileKind = 'JOB_PHOTO' | 'PROFILE_PHOTO' | 'MESSAGE_IMAGE' | 'EVIDENCE';

const MAX_BYTES = 10 * 1024 * 1024; // 10 MB

/** Content is validated by magic bytes — extensions and claimed types are never trusted. */
const MAGIC: Array<{ type: string; check: (b: Buffer) => boolean }> = [
  { type: 'image/jpeg', check: (b) => b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { type: 'image/png', check: (b) => b.length > 8 && b.readUInt32BE(0) === 0x89504e47 },
  {
    type: 'image/webp',
    check: (b) => b.length > 12 && b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP',
  },
];

export interface FileRow {
  id: string;
  owner_user_id: string;
  kind: FileKind;
  storage_key: string;
  content_type: string;
  byte_size: number;
  status: string;
}

@Injectable()
export class FilesService {
  constructor(
    private readonly db: DatabaseService,
    @Inject(FILE_STORAGE) private readonly storage: FileStorage,
  ) {}

  async upload(user: RequestUser, kind: FileKind, data: Buffer): Promise<FileRow> {
    if (data.length === 0) throw DomainError.validation('Empty file');
    if (data.length > MAX_BYTES) {
      throw DomainError.validation(`Files are limited to ${MAX_BYTES / 1024 / 1024} MB`);
    }
    const detected = MAGIC.find((m) => m.check(data));
    if (!detected) {
      throw DomainError.validation('Only JPEG, PNG, or WebP images are allowed');
    }

    const storageKey = randomUUID();
    await this.storage.put(storageKey, data);
    const sha256 = createHash('sha256').update(data).digest('hex');
    const { rows } = await this.db.query<FileRow>(
      `INSERT INTO files (owner_user_id, kind, storage_key, content_type, byte_size, sha256)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, owner_user_id, kind, storage_key, content_type, byte_size, status`,
      [user.id, kind, storageKey, detected.type, data.length, sha256],
    );
    return rows[0]!;
  }

  async findById(id: string): Promise<FileRow | null> {
    const { rows } = await this.db.query<FileRow>(
      `SELECT id, owner_user_id, kind, storage_key, content_type, byte_size, status
       FROM files WHERE id = $1 AND status = 'UPLOADED'`,
      [id],
    );
    return rows[0] ?? null;
  }

  /**
   * Access rules per kind:
   *  - owner: always
   *  - JOB_PHOTO attached to a job: any authenticated user while the job is
   *    discoverable, plus the job's customer and assigned workers afterwards
   *  - PROFILE_PHOTO: any authenticated user (public-card imagery)
   *  - everything else: owner only (until messaging/evidence attachments land)
   */
  async assertCanView(user: RequestUser, file: FileRow): Promise<void> {
    if (file.owner_user_id === user.id || user.roles.includes('ADMIN')) return;
    if (file.kind === 'PROFILE_PHOTO') return;
    if (file.kind === 'JOB_PHOTO') {
      const { rows } = await this.db.query(
        `SELECT 1 FROM job_photos jp
         JOIN jobs j ON j.id = jp.job_id
         WHERE jp.file_id = $1
           AND (j.state IN ('POSTED','MATCHING','PARTIALLY_FILLED')
                OR j.customer_user_id = $2
                OR EXISTS (SELECT 1 FROM job_workers a
                           WHERE a.job_id = j.id AND a.worker_user_id = $2))`,
        [file.id, user.id],
      );
      if (rows.length > 0) return;
    }
    // 404 masks existence (anti-IDOR).
    throw DomainError.notFound('File not found');
  }

  async content(file: FileRow): Promise<Buffer> {
    return this.storage.get(file.storage_key);
  }

  // ── Job photo attachments ───────────────────────────────────────────────────

  async attachToJob(user: RequestUser, jobId: string, fileId: string): Promise<void> {
    const { rows: jobs } = await this.db.query<{ customer_user_id: string; state: string }>(
      'SELECT customer_user_id, state FROM jobs WHERE id = $1',
      [jobId],
    );
    const job = jobs[0];
    if (!job || job.customer_user_id !== user.id) throw DomainError.notFound('Job not found');
    if (!['DRAFT', 'PENDING_REVIEW', 'POSTED', 'MATCHING', 'PARTIALLY_FILLED'].includes(job.state)) {
      throw DomainError.conflict('Photos cannot be added at this stage');
    }
    const file = await this.findById(fileId);
    // Only the caller's own JOB_PHOTO uploads can be attached.
    if (!file || file.owner_user_id !== user.id || file.kind !== 'JOB_PHOTO') {
      throw DomainError.notFound('File not found');
    }
    const { rows: count } = await this.db.query<{ n: string }>(
      'SELECT count(*) AS n FROM job_photos WHERE job_id = $1',
      [jobId],
    );
    if (Number(count[0]!.n) >= 8) throw DomainError.validation('Jobs can have at most 8 photos');
    await this.db.query(
      `INSERT INTO job_photos (job_id, file_id, sort_order)
       VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
      [jobId, fileId, Number(count[0]!.n)],
    );
  }

  async listJobPhotoIds(jobId: string): Promise<string[]> {
    const { rows } = await this.db.query<{ file_id: string }>(
      'SELECT file_id FROM job_photos WHERE job_id = $1 ORDER BY sort_order',
      [jobId],
    );
    return rows.map((r) => r.file_id);
  }

  async setProfilePhoto(user: RequestUser, fileId: string, profile: 'customer' | 'worker'): Promise<void> {
    const file = await this.findById(fileId);
    if (!file || file.owner_user_id !== user.id || file.kind !== 'PROFILE_PHOTO') {
      throw DomainError.notFound('File not found');
    }
    const table = profile === 'customer' ? 'customer_profiles' : 'worker_profiles';
    const { rowCount } = await this.db.query(
      `UPDATE ${table} SET photo_file_id = $2, updated_at = now() WHERE user_id = $1`,
      [user.id, fileId],
    );
    if ((rowCount ?? 0) === 0) throw DomainError.notFound(`Create a ${profile} profile first`);
  }
}
