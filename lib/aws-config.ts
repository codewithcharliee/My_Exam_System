import { S3Client } from "@aws-sdk/client-s3";

export function getBucketConfig() {
  const bucketName = process.env.AWS_BUCKET_NAME;
  if (!bucketName) {
    throw new Error("AWS_BUCKET_NAME must be configured.");
  }

  return {
    bucketName,
    folderPrefix: process.env.AWS_FOLDER_PREFIX ?? ""
  };
}

export function createS3Client() {
  return new S3Client({ forcePathStyle: true });
}
