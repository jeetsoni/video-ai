import type { LucideIcon } from "lucide-react";
import type { PipelineStage } from "@/features/pipeline/types/pipeline.types";
import {
  Sparkles,
  Eye,
  Mic,
  FileText,
  Clock,
  Clapperboard,
  Code,
  Play,
  Film,
  CheckCircle,
} from "lucide-react";

export interface StageDisplayInfo {
  stage: PipelineStage;
  label: string;
  description: string;
  icon: LucideIcon;
}

export const STAGE_DISPLAY_MAP: Record<PipelineStage, StageDisplayInfo> = {
  script_generation: {
    stage: "script_generation",
    label: "Script",
    description: "Generating your script…",
    icon: Sparkles,
  },
  script_review: {
    stage: "script_review",
    label: "Review",
    description: "Awaiting script review…",
    icon: Eye,
  },
  tts_generation: {
    stage: "tts_generation",
    label: "Voiceover",
    description: "Generating voiceover audio…",
    icon: Mic,
  },
  transcription: {
    stage: "transcription",
    label: "Transcription",
    description: "Transcribing audio…",
    icon: FileText,
  },
  timestamp_mapping: {
    stage: "timestamp_mapping",
    label: "Timestamps",
    description: "Mapping word timestamps…",
    icon: Clock,
  },
  direction_generation: {
    stage: "direction_generation",
    label: "Direction",
    description: "Generating scene directions…",
    icon: Clapperboard,
  },
  code_generation: {
    stage: "code_generation",
    label: "Code",
    description: "Generating animation code…",
    icon: Code,
  },
  preview: {
    stage: "preview",
    label: "Preview",
    description: "Animation ready for preview",
    icon: Play,
  },
  rendering: {
    stage: "rendering",
    label: "Rendering",
    description: "Rendering your video…",
    icon: Film,
  },
  done: {
    stage: "done",
    label: "Done",
    description: "Video ready!",
    icon: CheckCircle,
  },
};

export function getStageDisplayInfo(stage: PipelineStage): StageDisplayInfo {
  return STAGE_DISPLAY_MAP[stage];
}
