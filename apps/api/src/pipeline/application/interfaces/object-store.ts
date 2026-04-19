import type { Result } from "@/shared/domain/result.js";
import type { PipelineError } from "@/pipeline/domain/errors/pipeline-errors.js";

export interface ObjectStore {
  upload(params: {
    key: string;
    data: Buffer | ReadableStream;
    contentType: string;
  }): Promise<Result<string, PipelineError>>;
  getSignedUrl(key: string): Promise<Result<string, PipelineError>>;
  getObject(
    key: string,
  ): Promise<
    Result<
      {
        data: ReadableStream | Buffer;
        contentType: string;
        contentLength: number;
      },
      PipelineError
    >
  >;
}
