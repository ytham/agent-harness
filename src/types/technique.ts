/**
 * Technique interface and shared run types.
 *
 * Every agentic technique in the harness implements the Technique interface so
 * that they can be composed, swapped, and invoked uniformly by the CLI and by
 * host-repo code.
 */

/** A single step in an agent's execution trajectory. */
export interface TrajectoryStep {
  /** Step index (0-based). */
  index: number;
  /** Type of step. */
  type: "thought" | "action" | "observation" | "reflection" | "plan" | "critique" | "debate";
  /** Text content of the step. */
  content: string;
  /** ISO timestamp. */
  timestamp: string;
  /** Optional metadata (e.g. tool name, score). */
  metadata?: Record<string, unknown>;
}

/** The result returned by every technique's `run` method. */
export interface RunResult {
  /** Final answer / output produced by the technique. */
  answer: string;
  /** Full execution trajectory for inspection / logging. */
  trajectory: TrajectoryStep[];
  /** Name of the technique that produced this result. */
  technique: string;
  /** Total number of LLM calls made. */
  llmCalls: number;
  /** Wall-clock duration in milliseconds. */
  durationMs: number;
  /** Whether the run was considered successful. */
  success: boolean;
  /** Optional error message if success is false. */
  error?: string;
  /** Arbitrary extra data specific to the technique. */
  metadata?: Record<string, unknown>;
}

/** Base options accepted by every technique. */
export interface BaseRunOptions {
  /** The task / question / instruction for the agent. */
  task: string;
  /** Optional system prompt override. */
  systemPrompt?: string;
  /** Optional abort signal to cancel a run in progress. */
  signal?: AbortSignal;
}

/**
 * Core Technique interface.
 * TOptions extends BaseRunOptions; TResult defaults to RunResult.
 */
export interface Technique<
  TOptions extends BaseRunOptions = BaseRunOptions,
  TResult extends RunResult = RunResult,
> {
  readonly name: string;
  run(options: TOptions): Promise<TResult>;
}
