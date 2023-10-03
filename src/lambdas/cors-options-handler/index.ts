import { APIGatewayProxyResultV2 } from 'aws-lambda';

export async function main(): Promise<APIGatewayProxyResultV2> {
  return {
    statusCode: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
      'Access-Control-Allow-Headers': '*',
    },
    body: JSON.stringify({ message: 'CORS preflight successful' }),
  };
}
