import type { VoiceEntry } from "@video-ai/shared";
import type { Result } from "@/shared/domain/result.js";

export interface VoiceService {
  listVoices(): Promise<Result<VoiceEntry[], Error>>;
}
