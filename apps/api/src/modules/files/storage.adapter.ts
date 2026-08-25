import { Injectable } from '@nestjs/common';
import { mkdirSync } from 'node:fs';
import { readFile, unlink, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

/**
 * Binary storage abstraction. Local disk is the real dev/single-server
 * implementation; an S3-compatible adapter slots in behind the same interface
 * for multi-instance production (SYSTEM_ARCHITECTURE §12 — ephemeral
 * filesystems require object storage before horizontal scaling).
 */
export interface FileStorage {
  put(key: string, data: Buffer): Promise<void>;
  get(key: string): Promise<Buffer>;
  delete(key: string): Promise<void>;
}

export const FILE_STORAGE = 'FILE_STORAGE';

@Injectable()
export class LocalDiskStorage implements FileStorage {
  private readonly root: string;

  constructor() {
    this.root = resolve(process.env.UPLOADS_DIR ?? join(process.cwd(), 'uploads'));
    mkdirSync(this.root, { recursive: true });
  }

  /** Keys are server-generated UUID-based names — never user input. */
  private pathFor(key: string): string {
    if (!/^[a-z0-9-]+$/.test(key)) throw new Error('Invalid storage key');
    return join(this.root, key);
  }

  async put(key: string, data: Buffer): Promise<void> {
    await writeFile(this.pathFor(key), data);
  }

  async get(key: string): Promise<Buffer> {
    return readFile(this.pathFor(key));
  }

  async delete(key: string): Promise<void> {
    await unlink(this.pathFor(key)).catch(() => undefined);
  }
}
