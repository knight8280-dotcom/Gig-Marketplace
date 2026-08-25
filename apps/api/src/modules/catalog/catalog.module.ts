import { Module } from '@nestjs/common';
import { CatalogAdminController, CatalogController } from './catalog.controller';
import { CatalogRepository } from './catalog.repository';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [AuthModule],
  controllers: [CatalogController, CatalogAdminController],
  providers: [CatalogRepository],
  exports: [CatalogRepository],
})
export class CatalogModule {}
