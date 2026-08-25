import { Module } from '@nestjs/common';
import { UploadOne } from './upload-one.js';
import { GetOne } from './get-one.js';

@Module({
  exports: [UploadOne, GetOne],
  providers: [UploadOne, GetOne],
})
export class FilesModule {}
