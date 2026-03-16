/**
 * ReAct (Reasoning + Acting) — the Karpathy Loop.
 *
 * The agent iterates through Think → Act → Observe cycles until it arrives
 * at a final answer or exhausts the iteration budget.
 *
 * Paper: "ReAct: Synergizing Reasoning and Acting in Language Models"
 * Yao et al., 2022 (arXiv:2210.03629, ICLR 2023)
 */

import type { LLMProvider } from "../../providers/provider.js";
import type { ToolRegistry } from "../../tools/registry.js";
import { createRegistry } from "../../tools/registry.js";
import type { BaseRunOptions, RunResult, Technique } from "../../types/technique.js";
import { getLogger } from "../../utils/logger.js";
import { now } from "../../utils/prompts.js";
import { runLoop } from "./loop.js";

export interface ReactOptions extends BaseRunOptions {
  provider: LLMProvider;
  /** Tool registry for this run. */
  registry?: ToolRegistry;
  /** Maximum think→act→observe iterations. Default: 10 */
  maxIterations?: number;
}

export class ReactTechnique implements Technique<ReactOptions> {
  readonly name = "react";

  async run(options: ReactOptions): Promise<RunResult> {
    const {
      task,
      provider,
      registry = createRegistry(),
      maxIterations = 10,
      systemPrompt,
      signal,
    } = options;

    const logger = getLogger({ level: "info", pretty: true, prefix: "ReAct" });
    logger.info(`Starting task: ${task}`);

    const start = Date.now();

    const loopResult = await runLoop({
      task,
      provider,
      registry,
      maxIterations,
      systemPrompt,
      logger,
      signal,
    });

    return {
      technique: this.name,
      answer: loopResult.answer,
      trajectory: loopResult.trajectory,
      llmCalls: loopResult.llmCalls,
      durationMs: Date.now() - start,
      success: loopResult.success,
      error: loopResult.error,
    };
  }
}

/** Convenience function for one-off usage without instantiating the class. */
export async function runReact(options: ReactOptions): Promise<RunResult> {
  return new ReactTechnique().run(options);
}

export { now };
