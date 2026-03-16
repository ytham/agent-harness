/**
 * Ollama provider.
 *
 * Calls the Ollama REST API directly (no extra SDK dependency).
 * Reads OLLAMA_BASE_URL from the environment (default: http://localhost:11434).
 *
 * Note: Ollama's tool-calling support varies by model. For models that do not
 * support native tool calls, tool definitions are injected into the system
 * prompt and the response is parsed for JSON tool-call blocks.
 */

import type {
  CompletionOptions,
  CompletionResult,
  LLMProvider,
  Message,
  ToolCall,
} from "./provider.js";
import type { Tool } from "../types/tool.js";

interface OllamaMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

interface OllamaChatResponse {
  message: {
    role: string;
    content: string;
  };
  done: boolean;
  prompt_eval_count?: number;
  eval_count?: number;
}

export class OllamaProvider implements LLMProvider {
  readonly name = "ollama";
  readonly model: string;
  private baseURL: string;

  constructor(model: string, baseURL?: string) {
    this.model = model;
    this.baseURL =
      baseURL ??
      process.env.OLLAMA_BASE_URL ??
      "http://localhost:11434";
  }

  async complete(
    messages: Message[],
    options: CompletionOptions = {},
  ): Promise<CompletionResult> {
    // Inject tool descriptions into system prompt for models without native tool support
    const ollamaMessages: OllamaMessage[] = [...messages];
    if (options.tools && options.tools.length > 0) {
      ollamaMessages[0] = {
        ...ollamaMessages[0],
        content:
          ollamaMessages[0].content +
          "\n\n" +
          buildToolSystemPrompt(options.tools),
      };
    }

    const body = {
      model: this.model,
      messages: ollamaMessages,
      stream: false,
      options: {
        temperature: options.temperature ?? 0,
        num_predict: options.maxTokens ?? 4096,
      },
    };

    const response = await fetch(`${this.baseURL}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: options.signal,
    });

    if (!response.ok) {
      throw new Error(
        `Ollama request failed: ${response.status} ${response.statusText}`,
      );
    }

    const data = (await response.json()) as OllamaChatResponse;
    const rawContent = data.message.content;

    // Attempt to parse tool calls from the response text
    const { text, toolCalls } = parseToolCalls(rawContent);

    return {
      content: text,
      toolCalls,
      done: data.done,
      usage: {
        inputTokens: data.prompt_eval_count ?? 0,
        outputTokens: data.eval_count ?? 0,
      },
    };
  }
}

/** Builds a simple tool-use instruction block for injection into system prompts. */
function buildToolSystemPrompt(tools: Tool[]): string {
  const toolDefs = tools
    .map(
      (t) =>
        `- ${t.name}: ${t.description}\n  Input schema: ${JSON.stringify(t.inputSchema)}`,
    )
    .join("\n");

  return (
    `You have access to the following tools. To call a tool, respond with a JSON block:\n` +
    "```json\n" +
    `{ "tool": "<tool_name>", "input": { ... } }\n` +
    "```\n" +
    `Available tools:\n${toolDefs}`
  );
}

/** Parses JSON tool-call blocks out of a raw response string. */
function parseToolCalls(raw: string): { text: string; toolCalls: ToolCall[] } {
  const toolCalls: ToolCall[] = [];
  const jsonBlockRegex = /```json\s*(\{[\s\S]*?\})\s*```/g;
  let text = raw;
  let idCounter = 0;

  let match: RegExpExecArray | null;
  while ((match = jsonBlockRegex.exec(raw)) !== null) {
    try {
      const parsed = JSON.parse(match[1]) as {
        tool?: string;
        input?: Record<string, unknown>;
      };
      if (parsed.tool) {
        toolCalls.push({
          id: `ollama-${idCounter++}`,
          name: parsed.tool,
          input: parsed.input ?? {},
        });
        text = text.replace(match[0], "").trim();
      }
    } catch {
      // Not a valid tool call block — leave as-is
    }
  }

  return { text, toolCalls };
}
