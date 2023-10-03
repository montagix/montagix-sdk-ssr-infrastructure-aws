# Video Editing SDK Infrastructure Deployment

This repository contains the AWS CDK (Cloud Development Kit) stack for deploying the necessary infrastructure for a web-based video editing SDK. This SDK utilizes a custom server and Remotion for rendering videos.

## Prerequisites

Before you proceed, ensure you have the following:

- AWS Account and AWS CLI configured with the necessary credentials.
- Node.js installed (Version 16.x or later).
- AWS CDK installed
- Set up remotion infrastructure (see [Remotion Lambda Setup Documentation](https://www.remotion.dev/docs/lambda/setup)).

## Infrastructure Overview

The AWS infrastructure comprises of:

- S3 Bucket for storing source files.
- Lambda Functions for handling CORS preflight requests, rendering videos, transcoding videos, and creating signed URLs for S3 objects.
- HTTP API for triggering these Lambda Functions.
- IAM Roles and Policies for necessary permissions.
- FFmpeg layer for video transcoding.

## Deployment

1. Clone the repository to your local machine.
2. Navigate to the project directory.
3. Install the necessary node modules:

```bash
npm install 
```

4. Bootstrap AWS CDK (only needed if you haven't done this before in the AWS account):

```bash
cdk bootstrap
```

5. Deploy the CDK Stack:

```bash
cdk deploy
```

Upon successful deployment, the output will provide the AWS region and the API URL.

## Remotion Lambda Setup

To setup Remotion for Lambda, follow the instructions provided on the [Remotion Lambda Setup Documentation](https://www.remotion.dev/docs/lambda/setup).

In this stack, the remotion and @remotion/lambda packages are included in the render-function Lambda, as seen in the createRenderFunction method in InfrastructureStack.ts.

## Usage
The deployed HTTP API has several endpoints:

- POST `/render`: Trigger the render function.
- POST `/transcode`: Trigger the transcode function.
- POST `/signed-url`: Trigger the create signed URL function.
- OPTIONS `/{any+}`: Handle CORS preflight requests.

## Contributing

If you have suggestions, bugs, or feature requests, feel free to open an issue or pull request.