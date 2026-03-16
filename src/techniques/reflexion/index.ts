/**
 * Reflexion — verbal reinforcement learning via self-reflection.
 *
 * The agent attempts the task; on failure it reflects on the trajectory,
 * stores the reflection as episodic memory, and retries with that memory
 * prepended as context. No weight updates required.
 *
 * Paper: "Reflexion: Language Agents with Verbal Reinforcement Learning"
 * Shinn et al., 2023 (arXiv:2303.11366, NeurIPS 2023)
 */

import type { LLMProvider } from "../../providers/provider.js";
import type { ToolRegistry } from "../../tools/registry.js";
import { createRegistry } from "../../tools/registry.js";
import type { BaseRunOptions, RunResult, Technique, TrajectoryStep } from "../../types/technique.js";
import { getLogger } from "../../utils/logger.js";
import { REFLEXION_SYSTEM, now } from "../../utils/prompts.js";
import { runLoop } from "../react/loop.js";
import { buildMemoryBlock, generateReflection } from "./reflect.js";

export interface ReflexionOptions extends BaseRunOptions {
  provider: LLMProvider;
  registry?: ToolRegistry;
  /** Maximum number of retry trials. Default: 3 */
  maxTrials?: number;
  /** Number of past reflections to keep in context. Default: 5 */
  memoryWindow?: number;
  /**
   * External evaluator: returns true if the answer is acceptable.
   * Defaults to checking for a non-empty answer.
   */
  evaluator?: (answer: string, task: string) => boolean | Promise<boolean>;
  /** Maximum iterations per inner ReAct loop. Default: 8 */
  maxIterationsPerTrial?: number;
}

export class ReflexionTechnique implements Technique<ReflexionOptions> {
  readonly name = "reflexion";

  async run(options: ReflexionOptions): Promise<RunResult> {
    const {
      task,
      provider,
      registry = createRegistry(),
      maxTrials = 3,
      memoryWindow = 5,
      evaluator = defaultEvaluator,
      maxIterationsPerTrial = 8,
      signal,
    } = options;

    const logger = getLogger({ level: "info", pretty: true, prefix: "Reflexion" });
    logger.info(`Starting task (max ${maxTrials} trials): ${task}`);

    const start = Date.now();
    const allTrajectory: TrajectoryStep[] = [];
    const reflections: string[] = [];
    let totalLlmCalls = 0;

    for (let trial = 0; trial < maxTrials; trial++) {
      if (signal?.aborted) break;

      logger.info(`Trial ${trial + 1} / ${maxTrials}`);

      const memoryBlock = buildMemoryBlock(reflections, memoryWindow);
      const taskWithMemory = memoryBlock + task;
      const systemPrompt = REFLEXION_SYSTEM;

      const loopResult = await runLoop({
        task: taskWithMemory,
        provider,
        registry,
        maxIterations: maxIterationsPerTrial,
        systemPrompt,
        logger,
        signal,
      });
      totalLlmCalls += loopResult.llmCalls;
      allTrajectory.push(...loopResult.trajectory);

      const success = await evaluator(loopResult.answer, task);

      if (success) {
        logger.info(`Succeeded on trial ${trial + 1}.`);
        return {
          technique: this.name,
          answer: loopResult.answer,
          trajectory: allTrajectory,
          llmCalls: totalLlmCalls,
          durationMs: Date.now() - start,
          success: true,
          metadata: { trials: trial + 1, reflections },
        };
      }

      // Generate reflection for next trial
      if (trial < maxTrials - 1) {
        logger.info(`Trial ${trial + 1} failed — generating reflection.`);
        const feedback = loopResult.error ?? "The answer was deemed incorrect or incomplete.";
        const reflection = await generateReflection(
          task,
          loopResult.trajectory,
          feedback,
          provider,
        );
        totalLlmCalls++;
        reflections.push(reflection);

        allTrajectory.push({
          index: allTrajectory.length,
          type: "reflection",
          content: reflection,
          timestamp: now(),
          metadata: { trial },
        });

        logger.step("reflection", allTrajectory.length - 1, reflection);
      }
    }

    return {
      technique: this.name,
      answer: "",
      trajectory: allTrajectory,
      llmCalls: totalLlmCalls,
      durationMs: Date.now() - start,
      success: false,
      error: `Failed after ${maxTrials} trial(s).`,
      metadata: { trials: maxTrials, reflections },
    };
  }
}

function defaultEvaluator(answer: string): boolean {
  return answer.trim().length > 0;
}

export async function runReflexion(options: ReflexionOptions): Promise<RunResult> {
  return new ReflexionTechnique().run(options);
}
