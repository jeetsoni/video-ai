import { jest } from "@jest/globals";
import { ListVoicesUseCase } from "./list-voices.use-case.js";
import { Result } from "@/shared/domain/result.js";
import type { VoiceEntry } from "@video-ai/shared";
import type { VoiceService } from "@/pipeline/application/interfaces/voice-service.js";

function makeVoiceEntry(overrides: Partial<VoiceEntry> = {}): VoiceEntry {
  return {
    voiceId: "v1",
    name: "Test Voice",
    description: "A test voice",
    previewUrl: "https://example.com/preview.mp3",
    gender: "female",
    featured: false,
    category: null,
    ...overrides,
  };
}

describe("ListVoicesUseCase", () => {
  it("returns voices wrapped in ListVoicesResponse on success", async () => {
    const voices = [
      makeVoiceEntry({ voiceId: "v1" }),
      makeVoiceEntry({ voiceId: "v2" }),
    ];
    const voiceService: VoiceService = {
      listVoices: jest
        .fn<VoiceService["listVoices"]>()
        .mockResolvedValue(Result.ok(voices)),
    };
    const useCase = new ListVoicesUseCase(voiceService);

    const result = await useCase.execute();

    expect(result.isSuccess).toBe(true);
    expect(result.getValue()).toEqual({ voices });
  });

  it("propagates failure from voice service", async () => {
    const error = new Error("SDK failure");
    const voiceService: VoiceService = {
      listVoices: jest
        .fn<VoiceService["listVoices"]>()
        .mockResolvedValue(Result.fail(error)),
    };
    const useCase = new ListVoicesUseCase(voiceService);

    const result = await useCase.execute();

    expect(result.isFailure).toBe(true);
    expect(result.getError().message).toBe("SDK failure");
  });
});
