/**
 * Tree of Thoughts — BFS/DFS search over LLM-generated reasoning steps.
 */

import type { LLMProvider } from "../../providers/provider.js";
import type { TrajectoryStep } from "../../types/technique.js";
import {
  totEvaluatePrompt,
  totFinalAnswerPrompt,
  totGenerateThoughtsPrompt,
  now,
} from "../../utils/prompts.js";
import type { Logger } from "../../utils/logger.js";

export interface SearchOptions {
  task: string;
  provider: LLMProvider;
  branching: number;
  strategy: "bfs" | "dfs";
  maxDepth: number;
  scoreThreshold: number;
  logger: Logger;
  signal?: AbortSignal;
}

export interface SearchResult {
  answer: string;
  bestPath: string[];
  trajectory: TrajectoryStep[];
  llmCalls: number;
  success: boolean;
}

interface ThoughtNode {
  thought: string;
  score: number;
  path: string[];
  depth: number;
}

export async function search(options: SearchOptions): Promise<SearchResult> {
  const {
    task,
    provider,
    branching,
    strategy,
    maxDepth,
    scoreThreshold,
    logger,
    signal,
  } = options;

  const trajectory: TrajectoryStep[] = [];
  let llmCalls = 0;
  let stepIndex = 0;

  // BFS queue or DFS stack (both use the same array; BFS shifts, DFS pops)
  const frontier: ThoughtNode[] = [
    { thought: "", score: 1.0, path: [], depth: 0 },
  ];

  let bestNode: ThoughtNode | null = null;

  while (frontier.length > 0) {
    if (signal?.aborted) break;

    const current =
      strategy === "bfs" ? frontier.shift()! : frontier.pop()!;

    if (current.depth >= maxDepth) continue;

    // Generate candidate thoughts from current node
    const genPrompt = totGenerateThoughtsPrompt(
      task,
      current.path,
      branching,
    );
    const genResult = await provider.complete(
      [{ role: "user", content: genPrompt }],
      { temperature: 0.7, signal },
    );
    llmCalls++;

    const thoughts = parseThoughtList(genResult.content, branching);

    for (const thought of thoughts) {
      if (signal?.aborted) break;

      // Evaluate the thought
      const evalPrompt = totEvaluatePrompt(task, current.path, thought);
      const evalResult = await provider.complete(
        [{ role: "user", content: evalPrompt }],
        { temperature: 0, signal },
      );
      llmCalls++;

      const score = parseScore(evalResult.content);
      const newPath = [...current.path, thought];

      const node: ThoughtNode = {
        thought,
        score,
        path: newPath,
        depth: current.depth + 1,
      };

      trajectory.push({
        index: stepIndex++,
        type: "thought",
        content: thought,
        timestamp: now(),
        metadata: { depth: node.depth, score },
      });
      logger.step("thought", stepIndex - 1, thought, { score, depth: node.depth });

      if (score >= scoreThreshold) {
        if (!bestNode || score > bestNode.score) {
          bestNode = node;
        }
        frontier.push(node);
      }
    }
  }

  if (!bestNode) {
    return {
      answer: "",
      bestPath: [],
      trajectory,
      llmCalls,
      success: false,
    };
  }

  // Generate final answer from the best path
  const finalPrompt = totFinalAnswerPrompt(task, bestNode.path);
  const finalResult = await provider.complete(
    [{ role: "user", content: finalPrompt }],
    { temperature: 0, signal },
  );
  llmCalls++;

  const answer = finalResult.content.trim();

  trajectory.push({
    index: stepIndex++,
    type: "thought",
    content: `[FINAL] ${answer}`,
    timestamp: now(),
    metadata: { bestPath: bestNode.path },
  });

  logger.info(`Tree search complete. Best path depth: ${bestNode.path.length}`);

  return {
    answer,
    bestPath: bestNode.path,
    trajectory,
    llmCalls,
    success: true,
  };
}

/** Parse a numbered list of thoughts from raw LLM output. */
function parseThoughtList(raw: string, max: number): string[] {
  const lines = raw
    .split("\n")
    .map((l) => l.replace(/^\d+\.\s*/, "").trim())
    .filter((l) => l.length > 0);
  return lines.slice(0, max);
}

/** Parse a float score from a raw LLM response. */
function parseScore(raw: string): number {
  const match = /[\d.]+/.exec(raw.trim());
  if (!match) return 0;
  const val = parseFloat(match[0]);
  return isNaN(val) ? 0 : Math.min(1, Math.max(0, val));
}
