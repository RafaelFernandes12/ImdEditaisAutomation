import { Injectable } from '@nestjs/common';
import { S3Client } from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import * as fs from 'fs';

interface IUploadFile {
  fileStream: fs.ReadStream | Buffer | string | Uint8Array<ArrayBufferLike>;
  path: string;
  fileName: string;
  contentType: string;
}

@Injectable()
export class UploadOne {
  s3 = new S3Client({
    region: process.env.MINIO_REGION,
    credentials: {
      accessKeyId: process.env.MINIO_ACCESS_KEY!,
      secretAccessKey: process.env.MINIO_SECRET_KEY!,
    },
    endpoint: process.env.MINIO_URL,
    forcePathStyle: true,
  });

  async uploadFile({ fileStream, path, fileName, contentType }: IUploadFile) {
    const bucket = 'editaisimd';
    const upload = new Upload({
      client: this.s3,
      params: {
        Bucket: bucket,
        Key: `${path}/${fileName}`,
        Body: fileStream,
        ContentType: contentType,
      },
    });
    return upload.done();
  }
}
