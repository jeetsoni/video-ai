import { jest } from "@jest/globals";

const mockSend = jest.fn() as jest.Mock<(...args: any[]) => any>;
const mockGetSignedUrl = jest.fn() as jest.Mock<(...args: any[]) => any>;

jest.unstable_mockModule("@aws-sdk/client-s3", () => ({
  S3Client: jest.fn().mockImplementation(() => ({
    send: mockSend,
  })),
  PutObjectCommand: jest.fn().mockImplementation((input: unknown) => ({ input, _type: "PutObject" })),
  GetObjectCommand: jest.fn().mockImplementation((input: unknown) => ({ input, _type: "GetObject" })),
  HeadBucketCommand: jest.fn().mockImplementation((input: unknown) => ({ input, _type: "HeadBucket" })),
  CreateBucketCommand: jest.fn().mockImplementation((input: unknown) => ({ input, _type: "CreateBucket" })),
}));

jest.unstable_mockModule("@aws-sdk/s3-request-presigner", () => ({
  getSignedUrl: (...args: unknown[]) => mockGetSignedUrl(...args),
}));

const { MinioObjectStore } = await import("./minio-object-store.js");
const { PipelineError } = await import(
  "@/pipeline/domain/errors/pipeline-errors.js"
);

const config = {
  endpoint: "http://localhost:9000",
  region: "us-east-1",
  bucket: "test-bucket",
  accessKeyId: "minioadmin",
  secretAccessKey: "minioadmin",
  forcePathStyle: true,
};

describe("MinioObjectStore", () => {
  let store: InstanceType<typeof MinioObjectStore>;

  beforeEach(() => {
    jest.clearAllMocks();
    store = new MinioObjectStore(config);
  });

  describe("upload", () => {
    it("should upload data and return the key on success", async () => {
      mockSend.mockResolvedValueOnce({}); // HeadBucket
      mockSend.mockResolvedValueOnce({}); // PutObject

      const result = await store.upload({
        key: "audio/test.mp3",
        data: Buffer.from("audio-data"),
        contentType: "audio/mpeg",
      });

      expect(result.isSuccess).toBe(true);
      expect(result.getValue()).toBe("audio/test.mp3");
      expect(mockSend).toHaveBeenCalledTimes(2);
    });

    it("should return a PipelineError on upload failure", async () => {
      mockSend.mockResolvedValueOnce({}); // HeadBucket
      mockSend.mockRejectedValueOnce(new Error("Connection refused")); // PutObject

      const result = await store.upload({
        key: "audio/test.mp3",
        data: Buffer.from("audio-data"),
        contentType: "audio/mpeg",
      });

      expect(result.isFailure).toBe(true);
      const error = result.getError();
      expect(error).toBeInstanceOf(PipelineError);
      expect(error.code).toBe("rendering_failed");
      expect(error.message).toContain("Storage upload failed");
      expect(error.message).toContain("Connection refused");
    });

    it("should handle non-Error thrown values", async () => {
      mockSend.mockResolvedValueOnce({}); // HeadBucket
      mockSend.mockRejectedValueOnce("string error");

      const result = await store.upload({
        key: "audio/test.mp3",
        data: Buffer.from("data"),
        contentType: "audio/mpeg",
      });

      expect(result.isFailure).toBe(true);
      expect(result.getError().message).toContain("Unknown upload error");
    });
  });

  describe("getSignedUrl", () => {
    it("should return a signed URL on success", async () => {
      mockGetSignedUrl.mockResolvedValueOnce(
        "https://localhost:9000/test-bucket/video/out.mp4?signed=abc"
      );

      const result = await store.getSignedUrl("video/out.mp4");

      expect(result.isSuccess).toBe(true);
      expect(result.getValue()).toBe(
        "https://localhost:9000/test-bucket/video/out.mp4?signed=abc"
      );
      expect(mockGetSignedUrl).toHaveBeenCalledTimes(1);
    });

    it("should return a PipelineError on signed URL failure", async () => {
      mockGetSignedUrl.mockRejectedValueOnce(new Error("Access denied"));

      const result = await store.getSignedUrl("video/out.mp4");

      expect(result.isFailure).toBe(true);
      const error = result.getError();
      expect(error).toBeInstanceOf(PipelineError);
      expect(error.code).toBe("rendering_failed");
      expect(error.message).toContain("Storage getSignedUrl failed");
      expect(error.message).toContain("Access denied");
    });

    it("should handle non-Error thrown values", async () => {
      mockGetSignedUrl.mockRejectedValueOnce(42);

      const result = await store.getSignedUrl("video/out.mp4");

      expect(result.isFailure).toBe(true);
      expect(result.getError().message).toContain("Unknown signed URL error");
    });
  });
});
