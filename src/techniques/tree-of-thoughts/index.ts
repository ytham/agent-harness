/**
 * Tree of Thoughts (ToT).
 *
 * Casts reasoning as a tree search: at each node the LLM generates N candidate
 * next thoughts, scores them for promise, and expands the best ones via BFS or
 * DFS — enabling deliberate lookahead and backtracking.
 *
 * Paper: "Tree of Thoughts: Deliberate Problem Solving with Large Language Models"
 * Yao et al., 2023 (arXiv:2305.10601, NeurIPS 2023)
 */

import type { LLMProvider } from "../../providers/provider.js";
import type { BaseRunOptions, RunResult, Technique } from "../../types/technique.js";
import { getLogger } from "../../utils/logger.js";
import { search } from "./search.js";

export interface TreeOfThoughtsOptions extends BaseRunOptions {
  provider: LLMProvider;
  /** Candidate thoughts generated at each node. Default: 3 */
  branching?: number;
  /** Search strategy. Default: "bfs" */
  strategy?: "bfs" | "dfs";
  /** Maximum tree depth. Default: 4 */
  maxDepth?: number;
  /** Minimum score for a node to be expanded. Default: 0.5 */
  scoreThreshold?: number;
}

export interface TreeOfThoughtsResult extends RunResult {
  bestPath: string[];
}

export class TreeOfThoughtsTechnique
  implements Technique<TreeOfThoughtsOptions, TreeOfThoughtsResult>
{
  readonly name = "tree-of-thoughts";

  async run(options: TreeOfThoughtsOptions): Promise<TreeOfThoughtsResult> {
    const {
      task,
      provider,
      branching = 3,
      strategy = "bfs",
      maxDepth = 4,
      scoreThreshold = 0.5,
      signal,
    } = options;

    const logger = getLogger({ level: "info", pretty: true, prefix: "ToT" });
    logger.info(`Starting (${strategy.toUpperCase()}, branching=${branching}, depth=${maxDepth}): ${task}`);

    const start = Date.now();

    const searchResult = await search({
      task,
      provider,
      branching,
      strategy,
      maxDepth,
      scoreThreshold,
      logger,
      signal,
    });

    return {
      technique: this.name,
      answer: searchResult.answer,
      trajectory: searchResult.trajectory,
      llmCalls: searchResult.llmCalls,
      durationMs: Date.now() - start,
      success: searchResult.success,
      error: searchResult.success
        ? undefined
        : "No promising thought path found.",
      bestPath: searchResult.bestPath,
      metadata: { strategy, branching, maxDepth },
    };
  }
}

export async function runTreeOfThoughts(
  options: TreeOfThoughtsOptions,
): Promise<TreeOfThoughtsResult> {
  return new TreeOfThoughtsTechnique().run(options);
}
