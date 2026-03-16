/**
 * Critique Loop (LLM-as-Judge).
 *
 * Generate → Critique → Revise, iterating up to maxRounds times.
 * A judge LLM evaluates the current response against configurable criteria,
 * then the generator revises based on the critique.
 *
 * Related work:
 * - Constitutional AI (Bai et al., 2022)
 * - MT-Bench / Chatbot Arena (Zheng et al., 2023)
 * - Self-Refine (Madaan et al., arXiv:2303.17651)
 */

import type { LLMProvider } from "../../providers/provider.js";
import type { BaseRunOptions, RunResult, Technique, TrajectoryStep } from "../../types/technique.js";
import { getLogger } from "../../utils/logger.js";
import {
  critiqueEvaluatePrompt,
  critiqueGeneratePrompt,
  critiqueRevisePrompt,
  now,
} from "../../utils/prompts.js";

export interface CritiqueLoopOptions extends BaseRunOptions {
  provider: LLMProvider;
  /**
   * Optional separate judge provider. If not provided, the same provider
   * is used for both generation and critique.
   */
  judgeProvider?: LLMProvider;
  /** Maximum generate→critique→revise rounds. Default: 3 */
  maxRounds?: number;
  /** Criteria the judge evaluates against. */
  criteria?: string[];
  /**
   * Score threshold (1–10) above which revision stops early.
   * Default: 8
   */
  satisfactionThreshold?: number;
}

export interface CritiqueLoopResult extends RunResult {
  rounds: {
    response: string;
    critique: string;
    score: number;
  }[];
}

const DEFAULT_CRITERIA = ["correctness", "completeness", "clarity"];

export class CritiqueLoopTechnique
  implements Technique<CritiqueLoopOptions, CritiqueLoopResult>
{
  readonly name = "critique-loop";

  async run(options: CritiqueLoopOptions): Promise<CritiqueLoopResult> {
    const {
      task,
      provider,
      judgeProvider = provider,
      maxRounds = 3,
      criteria = DEFAULT_CRITERIA,
      satisfactionThreshold = 8,
      systemPrompt,
      signal,
    } = options;

    const logger = getLogger({
      level: "info",
      pretty: true,
      prefix: "CritiqueLoop",
    });
    logger.info(`Starting (max ${maxRounds} rounds): ${task}`);

    const start = Date.now();
    const trajectory: TrajectoryStep[] = [];
    const rounds: CritiqueLoopResult["rounds"] = [];
    let llmCalls = 0;
    let stepIndex = 0;

    // Initial generation
    const genMessages = [
      ...(systemPrompt ? [{ role: "system" as const, content: systemPrompt }] : []),
      { role: "user" as const, content: critiqueGeneratePrompt(task) },
    ];

    const initial = await provider.complete(genMessages, {
      temperature: 0.3,
      signal,
    });
    llmCalls++;
    let currentResponse = initial.content.trim();

    trajectory.push({
      index: stepIndex++,
      type: "thought",
      content: currentResponse,
      timestamp: now(),
      metadata: { round: 0, stage: "generate" },
    });
    logger.step("thought", stepIndex - 1, currentResponse);

    for (let round = 0; round < maxRounds; round++) {
      if (signal?.aborted) break;

      // Critique
      const critiquePrompt = critiqueEvaluatePrompt(
        task,
        currentResponse,
        criteria,
      );
      const critiqueResult = await judgeProvider.complete(
        [{ role: "user", content: critiquePrompt }],
        { temperature: 0, signal },
      );
      llmCalls++;
      const critique = critiqueResult.content.trim();
      const score = extractScore(critique);

      trajectory.push({
        index: stepIndex++,
        type: "critique",
        content: critique,
        timestamp: now(),
        metadata: { round, score },
      });
      logger.step("critique", stepIndex - 1, critique, { score });

      rounds.push({ response: currentResponse, critique, score });

      if (score >= satisfactionThreshold) {
        logger.info(
          `Score ${score} >= threshold ${satisfactionThreshold}. Stopping early.`,
        );
        break;
      }

      if (round === maxRounds - 1) break; // no revision after last critique

      // Revise
      const revisePrompt = critiqueRevisePrompt(task, currentResponse, critique);
      const reviseResult = await provider.complete(
        [
          ...(systemPrompt
            ? [{ role: "system" as const, content: systemPrompt }]
            : []),
          { role: "user" as const, content: revisePrompt },
        ],
        { temperature: 0.3, signal },
      );
      llmCalls++;
      currentResponse = reviseResult.content.trim();

      trajectory.push({
        index: stepIndex++,
        type: "thought",
        content: currentResponse,
        timestamp: now(),
        metadata: { round, stage: "revise" },
      });
      logger.step("thought", stepIndex - 1, currentResponse, { round });
    }

    const finalScore = rounds[rounds.length - 1]?.score ?? 0;

    return {
      technique: this.name,
      answer: currentResponse,
      trajectory,
      llmCalls,
      durationMs: Date.now() - start,
      success: true,
      rounds,
      metadata: { finalScore, rounds: rounds.length },
    };
  }
}

function extractScore(critique: string): number {
  const match = /Score:\s*(\d+)/i.exec(critique);
  if (match) {
    const n = parseInt(match[1], 10);
    return isNaN(n) ? 0 : Math.min(10, Math.max(0, n));
  }
  return 0;
}

export async function runCritiqueLoop(
  options: CritiqueLoopOptions,
): Promise<CritiqueLoopResult> {
  return new CritiqueLoopTechnique().run(options);
}
