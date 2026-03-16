/**
 * LLMProvider — the core abstraction all provider implementations must satisfy.
 *
 * Keeping this interface minimal (message completion + optional tool-calling)
 * means the harness never depends on any specific SDK at the type level.
 */

import type { Tool } from "../types/tool.js";

/** A single message in the conversation. */
export interface Message {
  role: "system" | "user" | "assistant";
  content: string;
}

/** A tool-call request emitted by the LLM. */
export interface ToolCall {
  id: string;
  name: string;
  input: Record<string, unknown>;
}

/** The result of a single LLM completion call. */
export interface CompletionResult {
  /** Text content of the assistant's response (may be empty if tool calls present). */
  content: string;
  /** Tool calls requested by the LLM, if any. */
  toolCalls: ToolCall[];
  /** Whether the model indicated it is done (stop reason). */
  done: boolean;
  /** Raw token usage, if available from the provider. */
  usage?: {
    inputTokens: number;
    outputTokens: number;
  };
}

/** Options for a single completion call. */
export interface CompletionOptions {
  /** Sampling temperature (0 = deterministic). */
  temperature?: number;
  /** Maximum tokens to generate. */
  maxTokens?: number;
  /** Tools the LLM may call. */
  tools?: Tool[];
  /** Abort signal. */
  signal?: AbortSignal;
}

/**
 * LLMProvider interface.
 * Implement this to add a new provider (custom API, proxy, mock, etc.).
 */
export interface LLMProvider {
  /** Identifier shown in logs. */
  readonly name: string;
  /** Model being used. */
  readonly model: string;

  /**
   * Send a list of messages and receive a completion.
   * The provider is responsible for converting the harness Message format
   * to whatever the underlying SDK expects.
   */
  complete(
    messages: Message[],
    options?: CompletionOptions,
  ): Promise<CompletionResult>;
}
