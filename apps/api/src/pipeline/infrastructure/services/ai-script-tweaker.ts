import { generateText, tool, stepCountIs } from "ai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { z } from "zod";
import type { TweakMessageDto } from "@video-ai/shared";
import type {
  ScriptTweaker,
  ScriptTweakParams,
  ScriptTweakResult,
} from "@/pipeline/application/interfaces/script-tweaker.js";
import type { WebSearchProvider } from "@/pipeline/application/interfaces/web-search-provider.js";
import { Result } from "@/shared/domain/result.js";
import { PipelineError } from "@/pipeline/domain/errors/pipeline-errors.js";

export interface AIScriptTweakerConfig {
  model: string;
  temperature: number;
  maxSteps: number;
}

const DEFAULT_CONFIG: AIScriptTweakerConfig = {
  model: "gemini-3-flash-preview",
  temperature: 0.2,
  maxSteps: 10,
};

const TWEAK_SYSTEM_PROMPT = `You are an expert video script editor. The user is reviewing their video script and wants to make changes through conversation. You receive the user's request and the current script text.

You have three tools:
1. read_script — Returns the current script text. ALWAYS call this first.
2. edit_script — Replaces an exact substring in the script with a new substring.
3. web_search — Searches the web for current facts, statistics, or data. Use this when the user asks for up-to-date information.

## Rules
1. ALWAYS call read_script first to see the current script
2. Make SURGICAL edits — only change what the user asked for
3. oldStr must be an EXACT substring (whitespace-sensitive)
4. DO NOT rewrite large sections — make targeted, minimal edits
5. Preserve the overall scene structure — scene headings and boundaries must remain intact
6. When the user references a specific scene ("scene 3", "the intro"), locate the corresponding section in the script
7. When the user asks for facts, statistics, or current data, use web_search to look up accurate information before editing
8. After making edits, give a SHORT plain-language summary (1-2 sentences max). Describe WHAT changed in the script, not HOW you edited it. Do NOT mention substrings, replacements, or technical details. Good: "Updated the intro to be more energetic and direct." Bad: "Replaced the first paragraph with a new version using oldStr/newStr."

## Workflow
1. Call read_script to see the current script
2. Understand the user's request
3. If the user asks for facts or statistics, call web_search first
4. Identify the relevant section(s) of the script
5. Call edit_script with precise oldStr and newStr for each change
6. Respond with a clear, short summary of what was changed (1-2 sentences, no technical details)`;

/**
 * Apply a single string replacement to script text.
 * Returns the updated script on success, or a descriptive error string.
 */
export function applyEdit(
  script: string,
  oldStr: string,
  newStr: string,
): { ok: true; script: string } | { ok: false; error: string } {
  if (oldStr === newStr) {
    return {
      ok: false,
      error: "oldStr and newStr are identical — nothing to change.",
    };
  }

  const idx = script.indexOf(oldStr);
  if (idx === -1) {
    const lines = script.split("\n");
    const preview = lines.slice(0, 10).join("\n");
    return {
      ok: false,
      error: `oldStr not found in script. Make sure it matches exactly (whitespace matters). First 10 lines:\n${preview}\n\n...and ${lines.length - 10} more lines`,
    };
  }

  const secondIdx = script.indexOf(oldStr, idx + 1);
  if (secondIdx !== -1) {
    return {
      ok: false,
      error: `oldStr matches multiple locations (at index ${idx} and ${secondIdx}). Include more surrounding context to make it unique.`,
    };
  }

  return {
    ok: true,
    script: script.slice(0, idx) + newStr + script.slice(idx + oldStr.length),
  };
}

/**
 * Create read_script and edit_script tools that operate on a shared script string.
 */
function createScriptEditorTools(
  getScript: () => string,
  setScript: (script: string) => void,
) {
  return {
    read_script: tool({
      description:
        "Read the current script text. ALWAYS call this first before making edits.",
      inputSchema: z.object({}),
      execute: async () => ({ script: getScript() }),
    }),
    edit_script: tool({
      description:
        "Replace an exact substring in the script. oldStr must match exactly (whitespace-sensitive). Returns success or an error message to help you retry.",
      inputSchema: z.object({
        oldStr: z.string().describe("The exact substring to find and replace"),
        newStr: z.string().describe("The replacement string"),
      }),
      execute: async ({
        oldStr,
        newStr,
      }: {
        oldStr: string;
        newStr: string;
      }) => {
        const result = applyEdit(getScript(), oldStr, newStr);
        if (result.ok) {
          setScript(result.script);
          return { success: true, message: "Edit applied successfully." };
        }
        return { success: false, message: result.error };
      },
    }),
  };
}

/**
 * Create a web_search tool that delegates to the provided search provider.
 */
function createWebSearchTool(searchProvider: WebSearchProvider) {
  return {
    web_search: tool({
      description:
        "Search the web for current facts, statistics, or data. Use when the user asks for up-to-date information that should be included in the script.",
      inputSchema: z.object({
        query: z.string().describe("The search query"),
      }),
      execute: async ({ query }: { query: string }) => {
        try {
          const results = await searchProvider.search(query);
          if (results.length === 0) {
            return {
              success: false,
              message: "No results found for the query.",
            };
          }
          const snippets = results.map(
            (r) => `[${r.title}](${r.url})\n${r.snippet}`,
          );
          return { success: true, results: snippets.join("\n\n") };
        } catch {
          return {
            success: false,
            message: "Web search failed. Proceed without external data.",
          };
        }
      },
    }),
  };
}

/**
 * Map chat history DTOs to AI SDK message format for conversational context.
 */
function mapChatHistoryToMessages(
  chatHistory: TweakMessageDto[],
): Array<{ role: "user" | "assistant"; content: string }> {
  return chatHistory.map((msg) => ({
    role: msg.role,
    content: msg.content,
  }));
}

export class AIScriptTweaker implements ScriptTweaker {
  private readonly config: AIScriptTweakerConfig;
  private readonly searchProvider: WebSearchProvider;

  constructor(
    searchProvider: WebSearchProvider,
    config?: Partial<AIScriptTweakerConfig>,
  ) {
    this.searchProvider = searchProvider;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  async tweakScript(
    params: ScriptTweakParams,
  ): Promise<Result<ScriptTweakResult, PipelineError>> {
    const google = createGoogleGenerativeAI({
      apiKey: process.env["GEMINI_API_KEY"] ?? "",
    });

    let currentScript = params.currentScript;
    const originalScript = params.currentScript;

    const editorTools = createScriptEditorTools(
      () => currentScript,
      (script) => {
        currentScript = script;
      },
    );

    const searchTools = createWebSearchTool(this.searchProvider);

    const tools = {
      ...editorTools,
      ...searchTools,
    };

    const priorMessages = mapChatHistoryToMessages(params.chatHistory);

    try {
      const result = await generateText({
        model: google(this.config.model),
        system: TWEAK_SYSTEM_PROMPT,
        messages: [...priorMessages, { role: "user", content: params.message }],
        temperature: this.config.temperature,
        tools,
        stopWhen: stepCountIs(this.config.maxSteps),
      });

      if (currentScript === originalScript) {
        return Result.fail(
          PipelineError.scriptGenerationFailed(
            "Tweak did not make any changes to the script",
          ),
        );
      }

      const explanation =
        result.text || "Script was updated based on your request";

      return Result.ok({ tweakedScript: currentScript, explanation });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unknown tweak error";
      return Result.fail(
        PipelineError.scriptGenerationFailed(`Script tweak failed: ${message}`),
      );
    }
  }
}
