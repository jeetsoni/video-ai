import { generateText, tool, stepCountIs } from "ai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { z } from "zod";
import type { TweakMessageDto } from "@video-ai/shared";
import type { CodeTweaker, CodeTweakParams, CodeTweakResult } from "@/pipeline/application/interfaces/code-tweaker.js";
import { Result } from "@/shared/domain/result.js";
import { PipelineError } from "@/pipeline/domain/errors/pipeline-errors.js";

export interface AICodeTweakerConfig {
  model: string;
  temperature: number;
  maxSteps: number;
}

const DEFAULT_CONFIG: AICodeTweakerConfig = {
  model: "gemini-3-flash-preview",
  temperature: 0.2,
  maxSteps: 10,
};

const TWEAK_SYSTEM_PROMPT = `You are an expert Remotion/React animation tweaker. The user is viewing their video preview and wants to make changes to the animation code through conversation. You receive the user's request along with optional visual context (a screenshot of the current frame) and temporal context (the current frame number and time in seconds).

You have two tools:
1. read_code — Returns the current animation code. ALWAYS call this first.
2. edit_code — Replaces an exact substring in the code with a new substring.

## Available Globals (do NOT import these - they are already available)
- React (useState, useEffect, useMemo, useCallback)
- AbsoluteFill, Sequence, useCurrentFrame, useVideoConfig, interpolate, spring, Easing
- Audio, staticFile

## Rules
1. ALWAYS call read_code first to see the current code
2. Make SURGICAL edits — only change what the user asked for
3. oldStr must be an EXACT substring (whitespace-sensitive)
4. DO NOT rewrite large sections — make targeted, minimal edits
5. Preserve the overall code structure — the Main function must always exist
6. When the user references a visual element ("that text", "the background"), use the screenshot and timeline position to identify the relevant code section
7. When the user mentions a specific time or moment, use the frame/time context to locate the corresponding Sequence or interpolation range
8. After making edits, briefly explain what you changed and why

## Workflow
1. Call read_code to see the current code
2. Understand the user's request in context of the screenshot and timeline position
3. Identify the relevant code section(s)
4. Call edit_code with precise oldStr and newStr for each change
5. If edit_code fails, read the error and retry with corrected oldStr
6. Respond with a clear summary of what was changed`;

/**
 * Apply a single string replacement to code.
 * Returns the updated code on success, or a descriptive error string.
 */
function applyEdit(
  code: string,
  oldStr: string,
  newStr: string,
): { ok: true; code: string } | { ok: false; error: string } {
  if (oldStr === newStr) {
    return { ok: false, error: "oldStr and newStr are identical — nothing to change." };
  }

  const idx = code.indexOf(oldStr);
  if (idx === -1) {
    const lines = code.split("\n");
    const preview = lines.slice(0, 10).join("\n");
    return {
      ok: false,
      error: `oldStr not found in code. Make sure it matches exactly (whitespace matters). First 10 lines:\n${preview}\n\n...and ${lines.length - 10} more lines`,
    };
  }

  const secondIdx = code.indexOf(oldStr, idx + 1);
  if (secondIdx !== -1) {
    return {
      ok: false,
      error: `oldStr matches multiple locations (at index ${idx} and ${secondIdx}). Include more surrounding context to make it unique.`,
    };
  }

  return { ok: true, code: code.slice(0, idx) + newStr + code.slice(idx + oldStr.length) };
}

/**
 * Create read_code and edit_code tools that operate on a shared code string.
 */
function createCodeEditorTools(
  getCode: () => string,
  setCode: (code: string) => void,
) {
  return {
    read_code: tool({
      description: "Read the current animation code. ALWAYS call this first before making edits.",
      inputSchema: z.object({}),
      execute: async () => ({ code: getCode() }),
    }),
    edit_code: tool({
      description:
        "Replace an exact substring in the animation code. oldStr must match exactly (whitespace-sensitive). Returns success or an error message to help you retry.",
      inputSchema: z.object({
        oldStr: z.string().describe("The exact substring to find and replace"),
        newStr: z.string().describe("The replacement string"),
      }),
      execute: async ({ oldStr, newStr }: { oldStr: string; newStr: string }) => {
        const result = applyEdit(getCode(), oldStr, newStr);
        if (result.ok) {
          setCode(result.code);
          return { success: true, message: "Edit applied successfully." };
        }
        return { success: false, message: result.error };
      },
    }),
  };
}


/**
 * Strip the data URI prefix from a base64 PNG string if present.
 */
function stripBase64Prefix(base64: string): string {
  const prefix = "data:image/png;base64,";
  if (base64.startsWith(prefix)) {
    return base64.slice(prefix.length);
  }
  return base64;
}

/**
 * Build the user message content parts for the tweak request.
 * Includes text prompt with optional frame/time context, plus optional screenshot image.
 */
function buildUserMessageContent(params: CodeTweakParams): Array<{ type: "text"; text: string } | { type: "image"; image: string; mimeType: "image/png" }> {
  const parts: Array<{ type: "text"; text: string } | { type: "image"; image: string; mimeType: "image/png" }> = [];

  let textPrompt = params.message;

  if (params.currentFrame !== undefined || params.currentTimeSeconds !== undefined) {
    const contextParts: string[] = [];
    if (params.currentFrame !== undefined) {
      contextParts.push(`frame ${params.currentFrame}`);
    }
    if (params.currentTimeSeconds !== undefined) {
      contextParts.push(`${params.currentTimeSeconds.toFixed(2)}s into the video`);
    }
    textPrompt += `\n\n[The user is currently viewing ${contextParts.join(", ")}]`;
  }

  parts.push({ type: "text", text: textPrompt });

  if (params.screenshot) {
    parts.push({
      type: "image",
      image: stripBase64Prefix(params.screenshot),
      mimeType: "image/png",
    });
  }

  return parts;
}

/**
 * Map chat history DTOs to AI SDK message format for conversational context.
 * Only includes the most recent messages (already sliced by the caller).
 */
function mapChatHistoryToMessages(chatHistory: TweakMessageDto[]): Array<{ role: "user" | "assistant"; content: string }> {
  return chatHistory.map((msg) => ({
    role: msg.role,
    content: msg.content,
  }));
}

export class AICodeTweaker implements CodeTweaker {
  private readonly config: AICodeTweakerConfig;

  constructor(config?: Partial<AICodeTweakerConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  async tweakCode(params: CodeTweakParams): Promise<Result<CodeTweakResult, PipelineError>> {
    const google = createGoogleGenerativeAI({
      apiKey: process.env["GEMINI_API_KEY"] ?? "",
    });

    // Mutable code reference that tools will read/write
    let currentCode = params.currentCode;
    const originalCode = params.currentCode;

    const tools = createCodeEditorTools(
      () => currentCode,
      (code) => { currentCode = code; },
    );

    // Build conversational context from chat history
    const priorMessages = mapChatHistoryToMessages(params.chatHistory);

    // Build the current user message with visual/temporal context
    const userContent = buildUserMessageContent(params);

    try {
      const result = await generateText({
        model: google(this.config.model),
        system: TWEAK_SYSTEM_PROMPT,
        messages: [
          ...priorMessages,
          { role: "user", content: userContent },
        ],
        temperature: this.config.temperature,
        tools,
        stopWhen: stepCountIs(this.config.maxSteps),
      });

      // Check if code was actually modified
      if (currentCode === originalCode) {
        return Result.fail(
          PipelineError.codeGenerationFailed(
            "Tweak did not make any changes to the code",
          ),
        );
      }

      // Validate the tweaked code still has required structure
      if (!currentCode.includes("Main")) {
        return Result.fail(
          PipelineError.codeGenerationFailed(
            "Tweak broke the code structure — Main function is missing",
          ),
        );
      }

      const explanation = result.text || "Code was updated based on your request";

      return Result.ok({ tweakedCode: currentCode, explanation });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown tweak error";
      return Result.fail(
        PipelineError.codeGenerationFailed(`Tweak failed: ${message}`),
      );
    }
  }
}
