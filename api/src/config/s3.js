// api/src/config/s3.js
// This file sets up the S3 client.
// In development it points to LocalStack.
// In production you remove the endpoint and it points to real AWS.

const { S3Client } = require('@aws-sdk/client-s3');

const isLocal = process.env.NODE_ENV === 'development';

const s3Client = new S3Client({
  region: process.env.AWS_REGION || 'us-east-1',

  // Only set custom endpoint in development (LocalStack)
  ...(isLocal && {
    endpoint: process.env.LOCALSTACK_ENDPOINT,
    forcePathStyle: true,   // REQUIRED for LocalStack — do not remove
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID || 'test',
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || 'test',
    },
    requestChecksumCalculation: "WHEN_REQUIRED",
  }),
});

const BUCKET_NAME = process.env.S3_BUCKET_NAME || 'builder-mvp-bucket';

module.exports = { s3Client, BUCKET_NAME };