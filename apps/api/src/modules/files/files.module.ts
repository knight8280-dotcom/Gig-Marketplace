import { Module } from '@nestjs/common';
import { FilesController } from './files.controller';
import { FilesService } from './files.service';
import { FILE_STORAGE, LocalDiskStorage } from './storage.adapter';

@Module({
  controllers: [FilesController],
  providers: [
    FilesService,
    // Local disk for dev/single-server; S3-compatible adapter replaces this
    // behind the same interface before horizontal scaling (documented).
    { provide: FILE_STORAGE, useClass: LocalDiskStorage },
  ],
  exports: [FilesService],
})
export class FilesModule {}
