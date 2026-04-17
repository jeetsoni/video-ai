import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  CreateBucketCommand,
  HeadBucketCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type { ObjectStore } from "@/pipeline/application/interfaces/object-store.js";
import { Result } from "@/shared/domain/result.js";
import { PipelineError } from "@/pipeline/domain/errors/pipeline-errors.js";

export interface MinioObjectStoreConfig {
  endpoint: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  forcePathStyle: boolean;
}

export class MinioObjectStore implements ObjectStore {
  private readonly client: S3Client;
  private readonly bucket: string;
  private readonly signedUrlExpiry: number;
  private bucketEnsured = false;

  constructor(config: MinioObjectStoreConfig, signedUrlExpiry = 3600) {
    this.bucket = config.bucket;
    this.signedUrlExpiry = signedUrlExpiry;
    this.client = new S3Client({
      endpoint: config.endpoint,
      region: config.region,
      forcePathStyle: config.forcePathStyle,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
    });
  }

  private async ensureBucket(): Promise<void> {
    if (this.bucketEnsured) return;
    try {
      await this.client.send(new HeadBucketCommand({ Bucket: this.bucket }));
    } catch {
      await this.client.send(new CreateBucketCommand({ Bucket: this.bucket }));
      console.log(`[minio] Created bucket: ${this.bucket}`);
    }
    this.bucketEnsured = true;
  }

  async upload(params: {
    key: string;
    data: Buffer | ReadableStream;
    contentType: string;
  }): Promise<Result<string, PipelineError>> {
    try {
      await this.ensureBucket();

      const command = new PutObjectCommand({
        Bucket: this.bucket,
        Key: params.key,
        Body: params.data,
        ContentType: params.contentType,
      });

      await this.client.send(command);

      return Result.ok(params.key);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unknown upload error";
      return Result.fail(
        new PipelineError(
          `Storage upload failed: ${message}`,
          "rendering_failed"
        )
      );
    }
  }

  async getSignedUrl(key: string): Promise<Result<string, PipelineError>> {
    try {
      const command = new GetObjectCommand({
        Bucket: this.bucket,
        Key: key,
      });

      const url = await getSignedUrl(this.client, command, {
        expiresIn: this.signedUrlExpiry,
      });

      return Result.ok(url);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unknown signed URL error";
      return Result.fail(
        new PipelineError(
          `Storage getSignedUrl failed: ${message}`,
          "rendering_failed"
        )
      );
    }
  }
}
