import { createReadStream, createWriteStream } from 'fs';
import { S3 } from 'aws-sdk';

export async function downloadFromS3(
  s3: S3,
  bucket: string,
  key: string,
  filename: string
) {
  const fileStream = createWriteStream(filename);

  return new Promise((resolve, reject) => {
    const s3Stream = s3
      .getObject({ Bucket: bucket, Key: key })
      .createReadStream();

    s3Stream
      .on('error', reject)
      .pipe(fileStream)
      .on('finish', resolve)
      .on('error', reject);
  });
}

export async function uploadToS3(
  s3: S3,
  bucket: string,
  filename: string,
  key: string
) {
  return s3
    .upload({
      Bucket: bucket,
      Key: key,
      Body: createReadStream(filename),
    })
    .promise();
}

export async function deleteFromS3(s3: S3, bucket: string, key: string) {
  return s3.deleteObject({ Bucket: bucket, Key: key }).promise();
}

export function getKeyFromS3Url(url: string) {
  const match = url.match(/amazonaws\.com\/(.+)$/);
  return match ? match[1] : '';
}
