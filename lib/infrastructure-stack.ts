import * as apiGateway from '@aws-cdk/aws-apigatewayv2-alpha';
import * as apiGatewayIntegrations from '@aws-cdk/aws-apigatewayv2-integrations-alpha';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import { Architecture, LayerVersion } from 'aws-cdk-lib/aws-lambda';
import * as cdk from 'aws-cdk-lib';
import * as path from 'path';
import * as IAM from 'aws-cdk-lib/aws-iam';
import { ManagedPolicy, Role, ServicePrincipal } from 'aws-cdk-lib/aws-iam';
import * as s3 from 'aws-cdk-lib/aws-s3';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';

export class InfrastructureStack extends cdk.Stack {
  constructor(scope: cdk.App, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // Create s3 buckets
    const sourceBucket = this.createSourceBucket();

    // Attach policites
    this.createS3BucketPolicy(sourceBucket);

    // Create Lambda roles
    const renderFunctionLambdaRole = this.createRenderFunctionLambdaRole();
    const apiIntegrationRole = this.createApiIntegrationRole();

    // Create layers
    const ffmpegLayer = this.createFFmpegLayer();

    // Create Lambda functions
    const corsOptionsHandlerFunction =
      this.createCorsOptionsHandlerFunction(apiIntegrationRole);
    const renderFunction = this.createRenderFunction(renderFunctionLambdaRole);
    const transcodeFunction = this.createTranscodeFunction(
      ffmpegLayer,
      sourceBucket
    );
    const createSignedUrlFunction = this.createSignedUrlFunction(sourceBucket);

    // Create the HTTP API
    const httpApi = this.createHttpApi();

    // Add routes to the API
    this.addRenderRouteToApi(httpApi, renderFunction);
    this.addTranscodeRouteToApi(httpApi, transcodeFunction);
    this.addCreateSignedUrlRouteToApi(httpApi, createSignedUrlFunction);
    this.addCorsRouteToApi(httpApi, corsOptionsHandlerFunction);

    // Output the region and API URL
    this.createOutputs(httpApi);
  }

  private createSourceBucket(): s3.Bucket {
    return new s3.Bucket(this, 'SourceBucket', {
      publicReadAccess: true,
      cors: [
        {
          allowedMethods: [
            s3.HttpMethods.GET,
            s3.HttpMethods.PUT,
            s3.HttpMethods.DELETE,
          ],
          allowedOrigins: ['*'],
          allowedHeaders: ['*'],
        },
      ],
    });
  }

  private createS3BucketPolicy(bucket: s3.Bucket) {
    return new s3.CfnBucketPolicy(this, 'sourceBucketPolicy', {
      bucket: bucket.bucketName,
      policyDocument: {
        Version: '2012-10-17',
        Statement: [
          {
            Sid: 'PublicReadGetObject',
            Effect: 'Allow',
            Principal: '*',
            Action: ['s3:GetObject'],
            Resource: [bucket.bucketArn + '/*'],
          },
        ],
      },
    });
  }

  private createRenderFunctionLambdaRole(): Role {
    return new Role(this, 'remotionSQSLambdaRole', {
      roleName: 'remotionSQSLambdaRole',
      assumedBy: new ServicePrincipal('lambda.amazonaws.com'),
      managedPolicies: [
        ManagedPolicy.fromAwsManagedPolicyName(
          'service-role/AWSLambdaBasicExecutionRole'
        ),
        ManagedPolicy.fromManagedPolicyName(
          this,
          'remotion-executionrole-policy',
          'remotion-executionrole-policy'
        ),
      ],
    });
  }

  private createApiIntegrationRole(): Role {
    return new IAM.Role(this, 'api-integration-role', {
      assumedBy: new IAM.ServicePrincipal('lambda.amazonaws.com'),
      managedPolicies: [
        ManagedPolicy.fromAwsManagedPolicyName(
          'service-role/AWSLambdaBasicExecutionRole'
        ),
      ],
    });
  }

  private createFFmpegLayer() {
    return new lambda.LayerVersion(this, 'ffmpegLayer', {
      code: lambda.Code.fromAsset(
        path.join(__dirname, '/../src/layers/ffmpeg.zip')
      ),
      license: 'GPLv3',
      compatibleRuntimes: [lambda.Runtime.NODEJS_18_X],
      description: 'Layer containing the FFmpeg library',
    });
  }

  private createTranscodeFunction(
    ffmpegLayer: LayerVersion,
    bucket: s3.Bucket
  ) {
    const fn = new NodejsFunction(this, 'transcode-function', {
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'main',
      entry: path.join(__dirname, '../src/lambdas/transcode/index.ts'),
      layers: [ffmpegLayer],
      timeout: cdk.Duration.minutes(5),
      architecture: Architecture.ARM_64,
      memorySize: 2048,
      environment: {
        FFMPEG_PATH: '/opt/ffmpeg',
        SOURCE_BUCKET_NAME: bucket.bucketName,
      },
    });

    bucket.grantReadWrite(fn);

    return fn;
  }

  private createCorsOptionsHandlerFunction(role: IAM.Role): NodejsFunction {
    return new NodejsFunction(this, 'cors-options-handler-function', {
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'main',
      entry: path.join(
        __dirname,
        '../src/lambdas/cors-options-handler/index.ts'
      ),
      role: role,
    });
  }

  private createRenderFunction(role: Role): NodejsFunction {
    return new NodejsFunction(this, 'render-function', {
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'main',
      entry: path.join(__dirname, '../src/lambdas/render-video/index.ts'),
      role: role,
      bundling: {
        nodeModules: ['remotion', '@remotion/lambda'],
      },
    });
  }

  private createSignedUrlFunction(bucket: s3.Bucket): lambda.Function {
    const fn = new NodejsFunction(this, 'create-signed-url-function', {
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'main',
      entry: path.join(__dirname, '../src/lambdas/create-signed-url/index.ts'),
      environment: {
        BUCKET_NAME: bucket.bucketName,
      },
    });
    bucket.grantReadWrite(fn);
    return fn;
  }

  private createHttpApi(): apiGateway.HttpApi {
    return new apiGateway.HttpApi(this, 'api', {
      apiName: 'remotion-api',
      corsPreflight: {
        allowOrigins: ['*'],
        allowHeaders: ['*'],
        allowMethods: [apiGateway.CorsHttpMethod.ANY],
      },
    });
  }

  private addRenderRouteToApi(
    httpApi: apiGateway.HttpApi,
    fn: lambda.Function
  ) {
    httpApi.addRoutes({
      integration: new apiGatewayIntegrations.HttpLambdaIntegration(
        'RenderFunctionIntegration',
        fn
      ),
      methods: [apiGateway.HttpMethod.POST],
      path: '/render',
    });
  }

  private addTranscodeRouteToApi(
    httpApi: apiGateway.HttpApi,
    fn: lambda.Function
  ) {
    httpApi.addRoutes({
      integration: new apiGatewayIntegrations.HttpLambdaIntegration(
        'TranscodeFunctionIntegration',
        fn
      ),
      methods: [apiGateway.HttpMethod.POST],
      path: '/transcode',
    });
  }

  private addCreateSignedUrlRouteToApi(
    httpApi: apiGateway.HttpApi,
    fn: lambda.Function
  ) {
    httpApi.addRoutes({
      integration: new apiGatewayIntegrations.HttpLambdaIntegration(
        'CreateSignedUrlFunctionIntegration',
        fn
      ),
      methods: [apiGateway.HttpMethod.POST],
      path: '/signed-url',
    });
  }

  private addCorsRouteToApi(
    httpApi: apiGateway.HttpApi,
    corsOptionsHandlerFunction: lambda.Function
  ) {
    httpApi.addRoutes({
      integration: new apiGatewayIntegrations.HttpLambdaIntegration(
        'CorsOptionsIntegration',
        corsOptionsHandlerFunction
      ),
      methods: [apiGateway.HttpMethod.OPTIONS],
      path: '/{any+}',
    });
  }

  private createOutputs(httpApi: apiGateway.HttpApi) {
    new cdk.CfnOutput(this, 'region', { value: cdk.Stack.of(this).region });
    new cdk.CfnOutput(this, 'apiUrl', { value: httpApi.url! });
  }
}
