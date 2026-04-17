import { VideoFormat } from "./video-format.js";

describe("VideoFormat", () => {
  it.each(["reel", "short", "longform"])("accepts valid format '%s'", (fmt) => {
    const result = VideoFormat.create(fmt);
    expect(result.isSuccess).toBe(true);
    expect(result.getValue().value).toBe(fmt);
  });

  it("rejects an invalid format", () => {
    const result = VideoFormat.create("tiktok");
    expect(result.isFailure).toBe(true);
    expect(result.getError().code).toBe("INVALID_VIDEO_FORMAT");
    expect(result.getError().message).toContain("tiktok");
  });

  it("rejects an empty string", () => {
    const result = VideoFormat.create("");
    expect(result.isFailure).toBe(true);
  });

  it("equals another VideoFormat with the same value", () => {
    const a = VideoFormat.create("reel").getValue();
    const b = VideoFormat.create("reel").getValue();
    expect(a.equals(b)).toBe(true);
  });

  it("does not equal a VideoFormat with a different value", () => {
    const a = VideoFormat.create("reel").getValue();
    const b = VideoFormat.create("short").getValue();
    expect(a.equals(b)).toBe(false);
  });

  it("toString returns the format string", () => {
    const fmt = VideoFormat.create("longform").getValue();
    expect(fmt.toString()).toBe("longform");
  });
});
