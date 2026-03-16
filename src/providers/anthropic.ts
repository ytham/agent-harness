/**
 * Anthropic Claude provider.
 *
 * Wraps @anthropic-ai/sdk to implement the LLMProvider interface.
 * Reads ANTHROPIC_API_KEY from the environment automatically.
 */

import Anthropic from "@anthropic-ai/sdk";
import type { Tool } from "../types/tool.js";
import type {
  CompletionOptions,
  CompletionResult,
  LLMProvider,
  Message,
  ToolCall,
} from "./provider.js";

export class AnthropicProvider implements LLMProvider {
  readonly name = "anthropic";
  readonly model: string;
  private client: Anthropic;

  constructor(model: string, apiKey?: string, baseURL?: string) {
    this.model = model;
    this.client = new Anthropic({
      apiKey: apiKey ?? process.env.ANTHROPIC_API_KEY,
      ...(baseURL ? { baseURL } : {}),
    });
  }

  async complete(
    messages: Message[],
    options: CompletionOptions = {},
  ): Promise<CompletionResult> {
    const systemMessages = messages.filter((m) => m.role === "system");
    const conversationMessages = messages.filter((m) => m.role !== "system");

    const systemPrompt =
      systemMessages.length > 0
        ? systemMessages.map((m) => m.content).join("\n\n")
        : undefined;

    const anthropicMessages: Anthropic.MessageParam[] = conversationMessages.map(
      (m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      }),
    );

    const anthropicTools = options.tools
      ? convertTools(options.tools)
      : undefined;

    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: options.maxTokens ?? 4096,
      temperature: options.temperature ?? 0,
      ...(systemPrompt ? { system: systemPrompt } : {}),
      messages: anthropicMessages,
      ...(anthropicTools ? { tools: anthropicTools } : {}),
    });

    const toolCalls: ToolCall[] = [];
    let textContent = "";

    for (const block of response.content) {
      if (block.type === "text") {
        textContent += block.text;
      } else if (block.type === "tool_use") {
        toolCalls.push({
          id: block.id,
          name: block.name,
          input: block.input as Record<string, unknown>,
        });
      }
    }

    return {
      content: textContent,
      toolCalls,
      done: response.stop_reason === "end_turn" || response.stop_reason === "stop_sequence",
      usage: {
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
      },
    };
  }
}

function convertTools(tools: Tool[]): Anthropic.Tool[] {
  return tools.map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: t.inputSchema as Anthropic.Tool.InputSchema,
  }));
}
