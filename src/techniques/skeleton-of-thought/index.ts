/**
 * Skeleton-of-Thought (SoT).
 *
 * Two-stage technique for structured answers:
 * 1. The LLM generates a brief skeleton (numbered outline).
 * 2. Each point is expanded in parallel via independent completions.
 *    The results are concatenated in order.
 *
 * Benefits: dramatically reduces latency vs. sequential generation for
 * structured/list-type questions; can also improve quality.
 *
 * Paper: "Skeleton-of-Thought: Large Language Models Can Do Parallel Decoding"
 * Ning et al., 2023 (arXiv:2307.15337, ICLR 2024)
 */

import type { LLMProvider } from "../../providers/provider.js";
import type { BaseRunOptions, RunResult, Technique, TrajectoryStep } from "../../types/technique.js";
import { getLogger } from "../../utils/logger.js";
import { skeletonExpandPrompt, skeletonPrompt, now } from "../../utils/prompts.js";

export interface SkeletonOfThoughtOptions extends BaseRunOptions {
  provider: LLMProvider;
  /** Maximum outline points to generate. Default: 8 */
  maxPoints?: number;
  /** Expand points in parallel. Set false to expand sequentially. Default: true */
  parallelExpansion?: boolean;
}

export interface SkeletonOfThoughtResult extends RunResult {
  skeleton: string[];
  expansions: string[];
}

export class SkeletonOfThoughtTechnique
  implements Technique<SkeletonOfThoughtOptions, SkeletonOfThoughtResult>
{
  readonly name = "skeleton-of-thought";

  async run(options: SkeletonOfThoughtOptions): Promise<SkeletonOfThoughtResult> {
    const {
      task,
      provider,
      maxPoints = 8,
      parallelExpansion = true,
      systemPrompt,
      signal,
    } = options;

    const logger = getLogger({ level: "info", pretty: true, prefix: "SoT" });
    logger.info(`Generating skeleton for: ${task}`);

    const start = Date.now();
    const trajectory: TrajectoryStep[] = [];
    let llmCalls = 0;
    let stepIndex = 0;

    // ---- Stage 1: Generate skeleton ----
    const skeletonMessages = [
      ...(systemPrompt
        ? [{ role: "system" as const, content: systemPrompt }]
        : []),
      { role: "user" as const, content: skeletonPrompt(task, maxPoints) },
    ];

    const skeletonResult = await provider.complete(skeletonMessages, {
      temperature: 0.3,
      signal,
    });
    llmCalls++;

    const skeleton = parseSkeletonPoints(skeletonResult.content);
    logger.info(`Skeleton: ${skeleton.length} points`);

    trajectory.push({
      index: stepIndex++,
      type: "plan",
      content: skeleton.map((p, i) => `${i + 1}. ${p}`).join("\n"),
      timestamp: now(),
      metadata: { stage: "skeleton" },
    });

    // ---- Stage 2: Expand each point ----
    const expandPoint = async (
      point: string,
      pointIndex: number,
    ): Promise<string> => {
      if (signal?.aborted) return "";
      const prompt = skeletonExpandPrompt(task, point, pointIndex, skeleton.length);
      const result = await provider.complete(
        [{ role: "user", content: prompt }],
        { temperature: 0.4, signal },
      );
      llmCalls++;
      return result.content.trim();
    };

    let expansions: string[];

    if (parallelExpansion) {
      logger.info("Expanding points in parallel…");
      expansions = await Promise.all(
        skeleton.map((point, i) => expandPoint(point, i)),
      );
    } else {
      logger.info("Expanding points sequentially…");
      expansions = [];
      for (let i = 0; i < skeleton.length; i++) {
        expansions.push(await expandPoint(skeleton[i], i));
      }
    }

    for (let i = 0; i < skeleton.length; i++) {
      trajectory.push({
        index: stepIndex++,
        type: "thought",
        content: `[Point ${i + 1}: ${skeleton[i]}]\n${expansions[i]}`,
        timestamp: now(),
        metadata: { stage: "expansion", pointIndex: i },
      });
      logger.step("thought", stepIndex - 1, `Point ${i + 1}: ${expansions[i]}`);
    }

    // Assemble full answer
    const answer = skeleton
      .map((point, i) => `**${point}**\n\n${expansions[i]}`)
      .join("\n\n");

    return {
      technique: this.name,
      answer,
      trajectory,
      llmCalls,
      durationMs: Date.now() - start,
      success: skeleton.length > 0,
      skeleton,
      expansions,
      metadata: { parallelExpansion, pointCount: skeleton.length },
    };
  }
}

function parseSkeletonPoints(raw: string): string[] {
  return raw
    .split("\n")
    .map((l) => l.replace(/^\d+\.\s*/, "").trim())
    .filter((l) => l.length > 0);
}

export async function runSkeletonOfThought(
  options: SkeletonOfThoughtOptions,
): Promise<SkeletonOfThoughtResult> {
  return new SkeletonOfThoughtTechnique().run(options);
}
