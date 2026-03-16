/**
 * Self-Consistency / Majority Voting.
 *
 * Samples N independent chain-of-thought solutions from the LLM at temperature
 * > 0, extracts the final answer from each, and returns the answer that appears
 * most frequently (marginalizing over reasoning paths).
 *
 * Paper: "Self-Consistency Improves Chain of Thought Reasoning in Language Models"
 * Wang et al., 2022 (arXiv:2203.11171, ICLR 2023)
 */

import type { LLMProvider } from "../../providers/provider.js";
import type { BaseRunOptions, RunResult, Technique, TrajectoryStep } from "../../types/technique.js";
import { getLogger } from "../../utils/logger.js";
import { selfConsistencyPrompt, now } from "../../utils/prompts.js";

export interface SelfConsistencyOptions extends BaseRunOptions {
  provider: LLMProvider;
  /** Number of independent solutions to sample. Default: 5 */
  samples?: number;
  /** Sampling temperature. Default: 0.8 */
  temperature?: number;
}

export interface SelfConsistencyResult extends RunResult {
  /** All sampled answers with their vote counts. */
  votes: Record<string, number>;
  /** All raw chain-of-thought completions. */
  chains: string[];
}

export class SelfConsistencyTechnique
  implements Technique<SelfConsistencyOptions, SelfConsistencyResult>
{
  readonly name = "self-consistency";

  async run(options: SelfConsistencyOptions): Promise<SelfConsistencyResult> {
    const {
      task,
      provider,
      samples = 5,
      temperature = 0.8,
      systemPrompt,
      signal,
    } = options;

    const logger = getLogger({
      level: "info",
      pretty: true,
      prefix: "SelfConsistency",
    });
    logger.info(`Sampling ${samples} chains for: ${task}`);

    const start = Date.now();
    const trajectory: TrajectoryStep[] = [];
    const chains: string[] = [];
    const answerVotes: Record<string, number> = {};

    const messages = [
      ...(systemPrompt ? [{ role: "system" as const, content: systemPrompt }] : []),
      { role: "user" as const, content: selfConsistencyPrompt(task) },
    ];

    // Sample N completions in parallel
    const completionPromises = Array.from({ length: samples }, (_, i) =>
      provider
        .complete(messages, { temperature, signal })
        .then((r) => ({ index: i, content: r.content })),
    );

    const completions = await Promise.all(completionPromises);

    for (const { index, content } of completions) {
      chains.push(content);

      const answer = extractAnswer(content);
      answerVotes[answer] = (answerVotes[answer] ?? 0) + 1;

      trajectory.push({
        index,
        type: "thought",
        content: `[Chain ${index + 1}] ${content}`,
        timestamp: now(),
        metadata: { extractedAnswer: answer },
      });

      logger.step("thought", index, `Chain ${index + 1} → answer: "${answer}"`);
    }

    const winnerAnswer = majorityVote(answerVotes);
    logger.info(
      `Majority answer: "${winnerAnswer}" (${answerVotes[winnerAnswer]} / ${samples} votes)`,
    );

    return {
      technique: this.name,
      answer: winnerAnswer,
      trajectory,
      llmCalls: samples,
      durationMs: Date.now() - start,
      success: true,
      votes: answerVotes,
      chains,
      metadata: { samples, temperature },
    };
  }
}

/** Extract the "Answer: ..." portion from a chain-of-thought response. */
function extractAnswer(raw: string): string {
  const match = /Answer:\s*([\s\S]+)/i.exec(raw);
  if (match) return match[1].trim().split("\n")[0].trim();
  // Fall back: last non-empty line
  const lines = raw.split("\n").map((l) => l.trim()).filter(Boolean);
  return lines[lines.length - 1] ?? raw.trim();
}

/** Return the answer with the highest vote count. Ties broken by first seen. */
function majorityVote(votes: Record<string, number>): string {
  let best = "";
  let bestCount = 0;
  for (const [answer, count] of Object.entries(votes)) {
    if (count > bestCount) {
      best = answer;
      bestCount = count;
    }
  }
  return best;
}

export async function runSelfConsistency(
  options: SelfConsistencyOptions,
): Promise<SelfConsistencyResult> {
  return new SelfConsistencyTechnique().run(options);
}
