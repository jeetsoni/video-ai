export interface TweakMessageDto {
  id: string;
  jobId: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string; // ISO 8601
}
