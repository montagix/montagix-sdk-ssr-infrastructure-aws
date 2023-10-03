import { getFunctions, renderMediaOnLambda } from '@remotion/lambda/client';
import { Handler } from 'aws-lambda';
import { COMP_NAME, SITE_ID } from '../../config';

const region = 'us-east-1';

export const main: Handler = async (event: any) => {
  try {
    const body = event.body ?? event?.Records?.[0]?.body;
    const inputProps = typeof body === 'string' ? JSON.parse(body) : body;

    const [first] = await getFunctions({
      compatibleOnly: true,
      region,
    });

    const result = await renderMediaOnLambda({
      region: region,
      functionName: first.functionName,
      serveUrl: SITE_ID,
      composition: COMP_NAME,
      inputProps: inputProps,
      codec: 'h264',
      imageFormat: 'jpeg',
      maxRetries: 1,
      privacy: 'private',
    });

    const { renderId, bucketName } = result;

    return {
      statusCode: 200,
      body: JSON.stringify({
        renderId,
        bucketName,
        result,
      }),
    };
  } catch (err) {
    console.log('Error', err);
    return {
      statusCode: 500,
      body: JSON.stringify({
        message: err,
      }),
    };
  }
};
