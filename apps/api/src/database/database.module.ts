import { Global, Module } from '@nestjs/common';
import { CONFIG, loadConfig } from '../config/config';
import { DatabaseService } from './database.service';

@Global()
@Module({
  providers: [{ provide: CONFIG, useFactory: loadConfig }, DatabaseService],
  exports: [CONFIG, DatabaseService],
})
export class DatabaseModule {}
