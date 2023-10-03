import { Handler } from 'aws-lambda';
import { exec } from 'child_process';
import { S3 } from 'aws-sdk';
import { tmpdir } from 'os';
import { join } from 'path';
import {
  deleteFromS3,
  downloadFromS3,
  getKeyFromS3Url,
  uploadToS3,
} from '../../utils/s3.utils';

const s3 = new S3();

export const main: Handler = async (event) => {
  console.log({ event });
  const parsedBody =
    typeof event.body === 'string'
      ? JSON.parse(event.body ?? '{}')
      : event.body;

  const { s3Url, type } = parsedBody;

  const bucket = process.env.SOURCE_BUCKET_NAME!;
  const key = getKeyFromS3Url(s3Url);

  const outputFilename = getOutputFilename(key, type);
  const temporaryInputFilename = join(tmpdir(), key);
  const temporaryOutputFilename = join(tmpdir(), outputFilename);

  try {
    // Download the file from S3
    await downloadFromS3(s3, bucket, key, temporaryInputFilename);

    // Depending on the file type, transcode the file
    switch (type) {
      case 'audio':
        await transcodeAudio(temporaryInputFilename, temporaryOutputFilename);
        break;
      case 'video':
        await transcodeVideo(
          temporaryInputFilename,
          temporaryOutputFilename,
          parsedBody
        );
        break;
      case 'image':
        await transcodeImage(
          temporaryInputFilename,
          temporaryOutputFilename,
          parsedBody
        );
        break;
      default:
        throw new Error('Unsupported file type');
    }

    // Upload the transcoded file back to S3
    const outputFile = await uploadToS3(
      s3,
      bucket,
      temporaryOutputFilename,
      outputFilename
    );

    // Remove the original file from S3
    await deleteFromS3(s3, bucket, key);

    return {
      statusCode: 200,
      body: JSON.stringify({
        location: outputFile.Location,
        key: outputFile.Key,
      }),
    };
  } catch (error) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Failed to transcode the file' }),
    };
  }
};

async function transcodeAudio(input: string, output: string) {
  const args = [
    '-i',
    input,
    '-c:a',
    'libmp3lame',
    '-q:a',
    '2',
    '-b:a',
    '192k',
    '-ar',
    '44100',
    '-ac',
    '2',
    '-threads',
    '0',
    output,
  ];

  await execFFmpeg(args);

  return output;
}

async function transcodeVideo(
  input: string,
  output: string,
  body: Record<string, any>
): Promise<string> {
  const { maxWidth, maxHeight } = body;

  const args = [
    '-i',
    input,
    '-c:v',
    'libx264',
    '-preset',
    'fast',
    '-map_metadata',
    '-1',
    '-vf',
    `scale=${maxWidth}:${maxHeight},fps=30`,
    '-c:a',
    'aac',
    '-b:a',
    '128k',
    '-threads',
    '0',
    output,
  ];

  await execFFmpeg(args);

  return output;
}

async function transcodeImage(
  input: string,
  output: string,
  body: Record<string, any>
): Promise<string> {
  const { maxWidth, maxHeight } = body;

  const args = [
    '-i',
    input,
    '-c:v',
    'libwebp',
    '-lossless',
    '0',
    '-compression_level',
    '6',
    '-preset',
    'icon',
    '-qmin',
    '10',
    '-qmax',
    '50',
    '-vf',
    `scale=${maxWidth}:${maxHeight}`,
    '-threads',
    '0',
    output,
  ];
  await execFFmpeg(args);
  return output;
}

function execFFmpeg(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    exec(
      `${process.env.FFMPEG_PATH} ${args.join(' ')}`,
      (error, stdout, stderr) => {
        if (error) {
          reject(new Error(`FFmpeg error: ${stderr}`));
        } else {
          resolve();
        }
      }
    );
  });
}

function getOutputFilename(key: string, type: string): string {
  const baseFilename = key.split('/').pop()?.split('.').slice(0, -1).join('.');
  switch (type) {
    case 'audio':
      return `${baseFilename}.mp3`;
    case 'video':
      return `${baseFilename}.mp4`;
    case 'image':
      return `${baseFilename}.webp`;
    default:
      throw new Error('Unsupported file type');
  }
}
