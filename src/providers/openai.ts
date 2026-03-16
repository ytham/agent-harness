/**
 * OpenAI provider.
 *
 * Wraps the openai SDK to implement the LLMProvider interface.
 * Reads OPENAI_API_KEY from the environment automatically.
 */

import OpenAI from "openai";
import type { Tool } from "../types/tool.js";
import type {
  CompletionOptions,
  CompletionResult,
  LLMProvider,
  Message,
  ToolCall,
} from "./provider.js";

export class OpenAIProvider implements LLMProvider {
  readonly name = "openai";
  readonly model: string;
  private client: OpenAI;

  constructor(model: string, apiKey?: string, baseURL?: string) {
    this.model = model;
    this.client = new OpenAI({
      apiKey: apiKey ?? process.env.OPENAI_API_KEY,
      ...(baseURL ? { baseURL } : {}),
    });
  }

  async complete(
    messages: Message[],
    options: CompletionOptions = {},
  ): Promise<CompletionResult> {
    const openaiMessages: OpenAI.Chat.ChatCompletionMessageParam[] = messages.map(
      (m) => ({ role: m.role, content: m.content }),
    );

    const openaiTools = options.tools ? convertTools(options.tools) : undefined;

    const response = await this.client.chat.completions.create({
      model: this.model,
      max_tokens: options.maxTokens ?? 4096,
      temperature: options.temperature ?? 0,
      messages: openaiMessages,
      ...(openaiTools ? { tools: openaiTools } : {}),
    });

    const choice = response.choices[0];
    const message = choice.message;

    const toolCalls: ToolCall[] = (message.tool_calls ?? []).map((tc) => ({
      id: tc.id,
      name: tc.function.name,
      input: JSON.parse(tc.function.arguments) as Record<string, unknown>,
    }));

    return {
      content: message.content ?? "",
      toolCalls,
      done: choice.finish_reason === "stop" || choice.finish_reason === "length",
      usage: response.usage
        ? {
            inputTokens: response.usage.prompt_tokens,
            outputTokens: response.usage.completion_tokens,
          }
        : undefined,
    };
  }
}

function convertTools(tools: Tool[]): OpenAI.Chat.ChatCompletionTool[] {
  return tools.map((t) => ({
    type: "function" as const,
    function: {
      name: t.name,
      description: t.description,
      parameters: t.inputSchema,
    },
  }));
}
