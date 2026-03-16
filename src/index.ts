/**
 * @agent-harness/core — public library entrypoint.
 *
 * Import the techniques, providers, and utilities you need:
 *
 *   import { runReact, runReflexion, AnthropicProvider } from './agent-harness/src/index.js'
 */

// ------------------------------------------------------------------ Types
export type {
  Tool,
  ToolResult,
  JSONSchema,
  Technique,
  BaseRunOptions,
  RunResult,
  TrajectoryStep,
  HarnessConfig,
  ReactConfig,
  ReflexionConfig,
  TreeOfThoughtsConfig,
  SelfConsistencyConfig,
  CritiqueLoopConfig,
  PlanAndSolveConfig,
  SkeletonOfThoughtConfig,
  MultiAgentDebateConfig,
  LoggingConfig,
} from "./types/index.js";

// ------------------------------------------------------------------ Providers
export {
  AnthropicProvider,
  OpenAIProvider,
  OllamaProvider,
  resolveProvider,
} from "./providers/index.js";
export type {
  LLMProvider,
  Message,
  CompletionResult,
  CompletionOptions,
  ToolCall,
} from "./providers/provider.js";

// ------------------------------------------------------------------ Tools
export { ToolRegistry, createRegistry } from "./tools/registry.js";
export {
  readFileTool,
  writeFileTool,
  shellTool,
  builtInTools,
} from "./tools/built-ins/index.js";

// ------------------------------------------------------------------ Techniques
export { ReactTechnique, runReact } from "./techniques/react/index.js";
export type { ReactOptions } from "./techniques/react/index.js";

export {
  ReflexionTechnique,
  runReflexion,
} from "./techniques/reflexion/index.js";
export type { ReflexionOptions } from "./techniques/reflexion/index.js";

export {
  TreeOfThoughtsTechnique,
  runTreeOfThoughts,
} from "./techniques/tree-of-thoughts/index.js";
export type {
  TreeOfThoughtsOptions,
  TreeOfThoughtsResult,
} from "./techniques/tree-of-thoughts/index.js";

export {
  SelfConsistencyTechnique,
  runSelfConsistency,
} from "./techniques/self-consistency/index.js";
export type {
  SelfConsistencyOptions,
  SelfConsistencyResult,
} from "./techniques/self-consistency/index.js";

export {
  CritiqueLoopTechnique,
  runCritiqueLoop,
} from "./techniques/critique-loop/index.js";
export type {
  CritiqueLoopOptions,
  CritiqueLoopResult,
} from "./techniques/critique-loop/index.js";

export {
  PlanAndSolveTechnique,
  runPlanAndSolve,
} from "./techniques/plan-and-solve/index.js";
export type {
  PlanAndSolveOptions,
  PlanAndSolveResult,
} from "./techniques/plan-and-solve/index.js";

export {
  SkeletonOfThoughtTechnique,
  runSkeletonOfThought,
} from "./techniques/skeleton-of-thought/index.js";
export type {
  SkeletonOfThoughtOptions,
  SkeletonOfThoughtResult,
} from "./techniques/skeleton-of-thought/index.js";

export {
  MultiAgentDebateTechnique,
  runMultiAgentDebate,
} from "./techniques/multi-agent-debate/index.js";
export type {
  MultiAgentDebateOptions,
  MultiAgentDebateResult,
} from "./techniques/multi-agent-debate/index.js";

// ------------------------------------------------------------------ Utilities
export { Logger, getLogger } from "./utils/logger.js";
export type { LogLevel, LoggerOptions } from "./utils/logger.js";
export { loadConfig } from "./utils/config-loader.js";
