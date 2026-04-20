import { generateText, tool, stepCountIs } from "ai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { z } from "zod";
import type { CodeAutoFixer, CodeFixParams, CodeFixResult } from "@/pipeline/application/interfaces/code-autofixer.js";
import { Result } from "@/shared/domain/result.js";
import { PipelineError } from "@/pipeline/domain/errors/pipeline-errors.js";

export interface AICodeAutoFixerConfig {
  model: string;
  temperature: number;
  maxSteps: number;
}

const DEFAULT_CONFIG: AICodeAutoFixerConfig = {
  model: "gemini-3-flash-preview",
  temperature: 0.1,
  maxSteps: 8,
};

const AUTOFIX_SYSTEM_PROMPT = `You are an expert Remotion/React code debugger. Your task is to fix runtime errors in Remotion animation code using surgical edits.

You have two tools:
1. read_code — Returns the current animation code. ALWAYS call this first.
2. edit_code — Replaces an exact substring in the code with a new substring.

## Available Globals (do NOT import these - they are already available)
- React (useState, useEffect, useMemo, useCallback)
- AbsoluteFill, Sequence, useCurrentFrame, useVideoConfig, interpolate, spring, Easing
- Audio, staticFile

## Common Error Patterns and Fixes

### "interpolateColors is not defined"
This function is NOT available. Replace with manual color interpolation:
\`\`\`javascript
// BAD: interpolateColors(frame, [0, 30], ['#ff0000', '#00ff00'])
// GOOD: Use interpolate for individual RGB channels or use opacity-based transitions
const progress = interpolate(frame, [0, 30], [0, 1], { extrapolateRight: 'clamp' });
// Then blend colors manually or use opacity
\`\`\`

### "measureSpring is not defined"
This function is NOT available. Use spring() directly:
\`\`\`javascript
// BAD: measureSpring({ fps, config })
// GOOD: spring({ frame, fps, config: { damping: 14, stiffness: 180 } })
\`\`\`

### "X is not defined" (general)
The variable/function doesn't exist. Either:
- Remove the usage
- Implement it inline
- Use an available alternative

## Rules
1. ALWAYS call read_code first to see the current code
2. Make the SMALLEST possible fix - only change what's necessary
3. oldStr must be an EXACT substring (whitespace-sensitive)
4. DO NOT rewrite large sections - make surgical edits
5. After fixing, briefly explain what you changed

## Workflow
1. Call read_code to see the code
2. Find the exact line(s) causing the error
3. Call edit_code with the precise oldStr and newStr
4. If edit_code fails, read the error and retry with corrected oldStr
5. Respond with a brief summary of what was fixed`;

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
    // Show context to help AI find the right string
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

export class AICodeAutoFixer implements CodeAutoFixer {
  private readonly config: AICodeAutoFixerConfig;

  constructor(config?: Partial<AICodeAutoFixerConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  async fixCode(params: CodeFixParams): Promise<Result<CodeFixResult, PipelineError>> {
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

    const prompt = `Fix this runtime error in the Remotion animation code:

## Error Type
${params.errorType}

## Error Message
${params.errorMessage}

Start by calling read_code to see the current code, then make surgical edits to fix the error.`;

    try {
      const result = await generateText({
        model: google(this.config.model),
        system: AUTOFIX_SYSTEM_PROMPT,
        prompt,
        temperature: this.config.temperature,
        tools,
        stopWhen: stepCountIs(this.config.maxSteps),
      });

      // Check if code was actually modified
      if (currentCode === originalCode) {
        return Result.fail(
          PipelineError.codeGenerationFailed(
            "Autofix did not make any changes to the code",
          ),
        );
      }

      // Validate the fixed code still has required structure
      if (!currentCode.includes("Main")) {
        return Result.fail(
          PipelineError.codeGenerationFailed(
            "Autofix broke the code structure - Main function is missing",
          ),
        );
      }

      // Extract explanation from the final response
      const explanation = result.text || "Code was surgically fixed";

      return Result.ok({ fixedCode: currentCode, explanation });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown autofix error";
      return Result.fail(
        PipelineError.codeGenerationFailed(`Autofix failed: ${message}`),
      );
    }
  }
}
