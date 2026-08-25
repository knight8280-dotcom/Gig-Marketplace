import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import { IsIn, IsUUID } from 'class-validator';
import { CurrentUser, RequestUser, RequirePermissions } from '../../common/auth.decorators';
import { DomainError } from '../../common/errors';
import { FileKind, FilesService } from './files.service';

class AttachPhotoDto {
  @IsUUID()
  file_id!: string;
}

class ProfilePhotoDto {
  @IsUUID()
  file_id!: string;

  @IsIn(['customer', 'worker'])
  profile!: 'customer' | 'worker';
}

const UPLOAD_LIMIT = { default: { limit: 30, ttl: 60 * 60 * 1000 } };

@Controller()
export class FilesController {
  constructor(private readonly files: FilesService) {}

  /** Multipart upload; content validated by magic bytes server-side. */
  @Throttle(UPLOAD_LIMIT)
  @Post('files')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 11 * 1024 * 1024 } }))
  async upload(
    @CurrentUser() user: RequestUser,
    @UploadedFile() file: { buffer: Buffer } | undefined,
    @Query('kind') kind?: string,
  ) {
    if (!file?.buffer) throw DomainError.validation('Attach a file in the "file" field');
    const validKinds: FileKind[] = ['JOB_PHOTO', 'PROFILE_PHOTO'];
    if (!kind || !validKinds.includes(kind as FileKind)) {
      throw DomainError.validation(`kind must be one of: ${validKinds.join(', ')}`);
    }
    const row = await this.files.upload(user, kind as FileKind, file.buffer);
    return { id: row.id, kind: row.kind, content_type: row.content_type, byte_size: row.byte_size };
  }

  @Get('files/:id/content')
  async content(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Res() res: Response,
  ) {
    const file = await this.files.findById(id);
    if (!file) throw DomainError.notFound('File not found');
    await this.files.assertCanView(user, file);
    const data = await this.files.content(file);
    res.setHeader('content-type', file.content_type);
    res.setHeader('cache-control', 'private, max-age=3600');
    res.send(data);
  }

  @RequirePermissions('job:create')
  @HttpCode(201)
  @Post('jobs/:id/photos')
  async attach(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) jobId: string,
    @Body() dto: AttachPhotoDto,
  ) {
    await this.files.attachToJob(user, jobId, dto.file_id);
    return { photo_file_ids: await this.files.listJobPhotoIds(jobId) };
  }

  @HttpCode(200)
  @Post('me/profile-photo')
  async profilePhoto(@CurrentUser() user: RequestUser, @Body() dto: ProfilePhotoDto) {
    await this.files.setProfilePhoto(user, dto.file_id, dto.profile);
    return { photo_file_id: dto.file_id };
  }
}
