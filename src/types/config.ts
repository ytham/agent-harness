/**
 * HarnessConfig — the typed configuration object loaded from
 * harness.config.ts (or harness.config.json) in the host repo root.
 */

import type { LLMProvider } from "../providers/provider.js";
import type { Tool } from "./tool.js";

export interface ReactConfig {
  /** Maximum think→act→observe iterations before giving up. Default: 10 */
  maxIterations?: number;
}

export interface ReflexionConfig {
  /** Maximum number of retry trials. Default: 3 */
  maxTrials?: number;
  /** Number of past reflections to keep in context. Default: 5 */
  memoryWindow?: number;
}

export interface TreeOfThoughtsConfig {
  /** Number of candidate thoughts generated at each node. Default: 3 */
  branching?: number;
  /** Search strategy. Default: "bfs" */
  strategy?: "bfs" | "dfs";
  /** Maximum tree depth. Default: 4 */
  maxDepth?: number;
  /** Minimum LLM score (0–1) for a node to be expanded. Default: 0.5 */
  scoreThreshold?: number;
}

export interface SelfConsistencyConfig {
  /** Number of independent solutions to sample. Default: 5 */
  samples?: number;
  /** Sampling temperature. Default: 0.8 */
  temperature?: number;
}

export interface CritiqueLoopConfig {
  /** Maximum generate→critique→revise rounds. Default: 3 */
  maxRounds?: number;
  /** Criteria the judge evaluates. Default: ["correctness","completeness","clarity"] */
  criteria?: string[];
}

export interface PlanAndSolveConfig {
  /** Ask for a detailed step plan (PS+ variant). Default: true */
  detailedPlan?: boolean;
}

export interface SkeletonOfThoughtConfig {
  /** Maximum outline points to generate. Default: 8 */
  maxPoints?: number;
  /** Expand points in parallel. Default: true */
  parallelExpansion?: boolean;
}

export interface MultiAgentDebateConfig {
  /** Number of independent agent instances. Default: 3 */
  numAgents?: number;
  /** Number of debate rounds after the initial answer. Default: 2 */
  rounds?: number;
  /** How to aggregate final answers. Default: "judge" */
  aggregation?: "judge" | "majority";
}

export interface LoggingConfig {
  level?: "silent" | "info" | "debug";
  pretty?: boolean;
}

export interface HarnessConfig {
  /**
   * LLM provider to use.
   * - "anthropic" — Anthropic Claude (requires ANTHROPIC_API_KEY env var)
   * - "openai"    — OpenAI GPT (requires OPENAI_API_KEY env var)
   * - "ollama"    — Local Ollama (requires OLLAMA_BASE_URL, default http://localhost:11434)
   * - LLMProvider — custom provider instance
   */
  provider: "anthropic" | "openai" | "ollama" | LLMProvider;

  /** Model identifier, e.g. "claude-opus-4-5", "gpt-4o", "llama3". */
  model: string;

  /** Optional base URL override (Ollama, proxies, etc.). */
  baseURL?: string;

  /** Tools available to agents during execution. */
  tools?: Tool[];

  /** Per-technique configuration overrides. */
  techniques?: {
    react?: ReactConfig;
    reflexion?: ReflexionConfig;
    treeOfThoughts?: TreeOfThoughtsConfig;
    selfConsistency?: SelfConsistencyConfig;
    critiqueLoop?: CritiqueLoopConfig;
    planAndSolve?: PlanAndSolveConfig;
    skeletonOfThought?: SkeletonOfThoughtConfig;
    multiAgentDebate?: MultiAgentDebateConfig;
  };

  logging?: LoggingConfig;
}
