import { Injectable } from '@nestjs/common';
import aws from 'aws-sdk';
import * as fs from 'fs';

interface IUploadFile {
  fileStream: fs.ReadStream | Buffer | string | Uint8Array<ArrayBufferLike>;
  path: string;
  fileName: string;
  contentType: string;
}

@Injectable()
export class UploadOne {
  s3 = new aws.S3({
    region: process.env.MINIO_REGION,
    accessKeyId: process.env.MINIO_ACCESS_KEY,
    secretAccessKey: process.env.MINIO_SECRET_KEY,
    endpoint: process.env.MINIO_URL,
    s3ForcePathStyle: true,
  });

  async uploadFile({ fileStream, path, fileName, contentType }: IUploadFile) {
    const bucket = 'editaisimd';
    const res = await this.s3
      .upload({
        Bucket: bucket,
        Key: `${path}/${fileName}`,
        Body: fileStream,
        ContentType: contentType,
      })
      .promise();
    return res;
  }
}
