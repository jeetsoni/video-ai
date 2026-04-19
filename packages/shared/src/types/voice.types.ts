export interface VoiceEntry {
  voiceId: string;
  name: string;
  description: string;
  previewUrl: string | null;
  gender: "male" | "female" | "unknown";
  featured: boolean;
  category: string | null;
}

export interface ListVoicesResponse {
  voices: VoiceEntry[];
}
