/**
 * Multi-Agent Debate.
 *
 * N LLM instances independently answer the task, then exchange responses
 * and update their positions over multiple debate rounds. A final judge
 * (or majority vote) synthesizes the consensus answer.
 *
 * Paper: "Improving Factuality and Reasoning in Language Models through
 * Multiagent Debate"
 * Du et al., 2023 (arXiv:2305.14325, MIT / ICML 2024)
 */

import type { LLMProvider } from "../../providers/provider.js";
import type { BaseRunOptions, RunResult, Technique, TrajectoryStep } from "../../types/technique.js";
import { getLogger } from "../../utils/logger.js";
import {
  debateInitialPrompt,
  debateJudgePrompt,
  debateRoundPrompt,
  now,
} from "../../utils/prompts.js";

export interface MultiAgentDebateOptions extends BaseRunOptions {
  provider: LLMProvider;
  /**
   * Optional per-agent providers. If provided, agents[i] uses providers[i]
   * (wraps back around if fewer providers than agents). Defaults to using
   * the same provider for all agents.
   */
  agentProviders?: LLMProvider[];
  /** Number of agent instances. Default: 3 */
  numAgents?: number;
  /** Number of debate rounds after the initial answer. Default: 2 */
  rounds?: number;
  /** How to aggregate the final answer. Default: "judge" */
  aggregation?: "judge" | "majority";
}

export interface MultiAgentDebateResult extends RunResult {
  agentAnswers: string[][];  // [round][agentIndex]
  finalAnswers: string[];    // last round's answers
}

export class MultiAgentDebateTechnique
  implements Technique<MultiAgentDebateOptions, MultiAgentDebateResult>
{
  readonly name = "multi-agent-debate";

  async run(options: MultiAgentDebateOptions): Promise<MultiAgentDebateResult> {
    const {
      task,
      provider,
      agentProviders,
      numAgents = 3,
      rounds = 2,
      aggregation = "judge",
      systemPrompt,
      signal,
    } = options;

    const logger = getLogger({
      level: "info",
      pretty: true,
      prefix: "Debate",
    });
    logger.info(`Starting debate: ${numAgents} agents, ${rounds} rounds. Task: ${task}`);

    const start = Date.now();
    const trajectory: TrajectoryStep[] = [];
    let llmCalls = 0;
    let stepIndex = 0;

    /** Get the provider for a given agent index. */
    const getProvider = (agentIndex: number): LLMProvider => {
      if (agentProviders && agentProviders.length > 0) {
        return agentProviders[agentIndex % agentProviders.length];
      }
      return provider;
    };

    // ---- Round 0: Initial independent answers ----
    logger.info("Round 0: initial answers");
    const allRoundAnswers: string[][] = [];

    const round0Answers = await Promise.all(
      Array.from({ length: numAgents }, async (_, agentId) => {
        const prompt = debateInitialPrompt(task, agentId);
        const messages = [
          ...(systemPrompt
            ? [{ role: "system" as const, content: systemPrompt }]
            : []),
          { role: "user" as const, content: prompt },
        ];
        const result = await getProvider(agentId).complete(messages, {
          temperature: 0.4,
          signal,
        });
        llmCalls++;
        return result.content.trim();
      }),
    );

    allRoundAnswers.push(round0Answers);

    for (let agentId = 0; agentId < numAgents; agentId++) {
      trajectory.push({
        index: stepIndex++,
        type: "debate",
        content: round0Answers[agentId],
        timestamp: now(),
        metadata: { round: 0, agentId },
      });
      logger.step("debate", stepIndex - 1, round0Answers[agentId], {
        round: 0,
        agent: agentId,
      });
    }

    // ---- Debate rounds ----
    let currentAnswers = round0Answers;

    for (let round = 1; round <= rounds; round++) {
      if (signal?.aborted) break;

      logger.info(`Round ${round} / ${rounds}`);

      const nextAnswers = await Promise.all(
        Array.from({ length: numAgents }, async (_, agentId) => {
          const otherAnswers = currentAnswers.filter((_, i) => i !== agentId);
          const prompt = debateRoundPrompt(
            task,
            agentId,
            currentAnswers[agentId],
            otherAnswers,
          );
          const messages = [
            ...(systemPrompt
              ? [{ role: "system" as const, content: systemPrompt }]
              : []),
            { role: "user" as const, content: prompt },
          ];
          const result = await getProvider(agentId).complete(messages, {
            temperature: 0.3,
            signal,
          });
          llmCalls++;
          return result.content.trim();
        }),
      );

      allRoundAnswers.push(nextAnswers);
      currentAnswers = nextAnswers;

      for (let agentId = 0; agentId < numAgents; agentId++) {
        trajectory.push({
          index: stepIndex++,
          type: "debate",
          content: nextAnswers[agentId],
          timestamp: now(),
          metadata: { round, agentId },
        });
        logger.step("debate", stepIndex - 1, nextAnswers[agentId], {
          round,
          agent: agentId,
        });
      }
    }

    // ---- Aggregation ----
    let finalAnswer: string;

    if (aggregation === "majority") {
      finalAnswer = majorityVote(currentAnswers);
      logger.info(`Majority vote winner: "${finalAnswer}"`);
    } else {
      // Judge aggregation
      logger.info("Running judge aggregation…");
      const judgePrompt = debateJudgePrompt(task, currentAnswers);
      const judgeResult = await provider.complete(
        [{ role: "user", content: judgePrompt }],
        { temperature: 0, signal },
      );
      llmCalls++;
      finalAnswer = judgeResult.content.trim();

      trajectory.push({
        index: stepIndex++,
        type: "thought",
        content: `[JUDGE] ${finalAnswer}`,
        timestamp: now(),
        metadata: { stage: "judge" },
      });
      logger.step("thought", stepIndex - 1, `[JUDGE] ${finalAnswer}`);
    }

    return {
      technique: this.name,
      answer: finalAnswer,
      trajectory,
      llmCalls,
      durationMs: Date.now() - start,
      success: true,
      agentAnswers: allRoundAnswers,
      finalAnswers: currentAnswers,
      metadata: { numAgents, rounds, aggregation },
    };
  }
}

function majorityVote(answers: string[]): string {
  const counts: Record<string, number> = {};
  for (const a of answers) {
    counts[a] = (counts[a] ?? 0) + 1;
  }
  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];
}

export async function runMultiAgentDebate(
  options: MultiAgentDebateOptions,
): Promise<MultiAgentDebateResult> {
  return new MultiAgentDebateTechnique().run(options);
}
