import { Module } from '@nestjs/common';
import { UploadOne } from './upload-one.js';

@Module({
  exports: [UploadOne],
  providers: [UploadOne],
})
export class FilesModule {}
