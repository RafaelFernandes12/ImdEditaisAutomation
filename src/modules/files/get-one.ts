import { Injectable } from '@nestjs/common';
import aws from 'aws-sdk';

@Injectable()
export class GetOne {
  s3 = new aws.S3({
    region: process.env.MINIO_REGION,
    accessKeyId: process.env.MINIO_ACCESS_KEY,
    secretAccessKey: process.env.MINIO_SECRET_KEY,
    endpoint: process.env.MINIO_URL,
    s3ForcePathStyle: true,
  });

  async getOne(key: string) {
    const bucket = 'editaisimd';
    const res = await this.s3
      .getObject({
        Bucket: bucket,
        Key: key,
      })
      .promise();
    return res;
  }
}
