import { Injectable } from '@nestjs/common';
import * as aws from 'aws-sdk';
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
    region: process.env.S3_REGION,
    accessKeyId: process.env.S3_KEY,
    secretAccessKey: process.env.S3_SECRET,
  });

  async uploadFile({ fileStream, path, fileName, contentType }: IUploadFile) {
    const bucket = 'editaisimd';
    const res = await this.s3
      .upload({
        Bucket: bucket,
        Key: `${path}/${fileName}`,
        Body: fileStream,
        ACL: 'public-read',
        ContentType: contentType,
      })
      .promise();
    return res.Location;
  }
}
