import { APIGatewayProxyHandler } from 'aws-lambda';
import { S3 } from 'aws-sdk';

const s3 = new S3();

export const main: APIGatewayProxyHandler = async (event) => {
  const bucketName = process.env.BUCKET_NAME;

  if (!bucketName) {
    return {
      statusCode: 500,
      body: 'BUCKET_NAME environment variable is not set.',
    };
  }

  const parsedBody = JSON.parse(event.body ?? '{}');

  const fileName = parsedBody.fileName;
  const contentType = parsedBody.contentType;

  if (!fileName || !contentType) {
    return {
      statusCode: 500,
      body: 'File Name or Content Type is missing',
    };
  }

  const signedUrl = s3.getSignedUrl('putObject', {
    Bucket: bucketName,
    Key: fileName,
    ContentType: contentType,
    Expires: 3600, // 1 hour
  });

  return {
    statusCode: 200,
    body: JSON.stringify({ signedUrl }),
  };
};
