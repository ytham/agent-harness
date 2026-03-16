/**
 * Provider factory — resolves a HarnessConfig provider setting to a concrete
 * LLMProvider instance.
 */

import type { HarnessConfig } from "../types/config.js";
import type { LLMProvider } from "./provider.js";
import { AnthropicProvider } from "./anthropic.js";
import { OpenAIProvider } from "./openai.js";
import { OllamaProvider } from "./ollama.js";

export { AnthropicProvider } from "./anthropic.js";
export { OpenAIProvider } from "./openai.js";
export { OllamaProvider } from "./ollama.js";
export type { LLMProvider, Message, CompletionResult, CompletionOptions, ToolCall } from "./provider.js";

export function resolveProvider(config: HarnessConfig): LLMProvider {
  if (typeof config.provider === "object") {
    return config.provider;
  }

  switch (config.provider) {
    case "anthropic":
      return new AnthropicProvider(config.model, undefined, config.baseURL);
    case "openai":
      return new OpenAIProvider(config.model, undefined, config.baseURL);
    case "ollama":
      return new OllamaProvider(config.model, config.baseURL);
    default: {
      const _exhaustive: never = config.provider;
      throw new Error(`Unknown provider: ${String(_exhaustive)}`);
    }
  }
}
