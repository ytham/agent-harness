/**
 * Plan-and-Solve (PS / PS+).
 *
 * Two-phase prompting: the LLM first decomposes the task into an explicit
 * step-by-step plan, then executes each step sequentially. Reduces the
 * "missing step" and calculation errors found in vanilla CoT.
 *
 * Paper: "Plan-and-Solve Prompting: Improving Zero-Shot Chain-of-Thought
 * Reasoning by Large Language Models"
 * Wang et al., ACL 2023 (arXiv:2305.04091)
 */

import type { LLMProvider } from "../../providers/provider.js";
import type { ToolRegistry } from "../../tools/registry.js";
import { createRegistry } from "../../tools/registry.js";
import type { BaseRunOptions, RunResult, Technique, TrajectoryStep } from "../../types/technique.js";
import { getLogger } from "../../utils/logger.js";
import { planPrompt, planSolvePrompt, now } from "../../utils/prompts.js";
import { runLoop } from "../react/loop.js";

export interface PlanAndSolveOptions extends BaseRunOptions {
  provider: LLMProvider;
  registry?: ToolRegistry;
  /** Use PS+ (detailed plan with rationale per step). Default: true */
  detailedPlan?: boolean;
  /** Max iterations for the execution phase (inner ReAct loop). Default: 12 */
  maxExecutionIterations?: number;
}

export interface PlanAndSolveResult extends RunResult {
  plan: string;
}

export class PlanAndSolveTechnique
  implements Technique<PlanAndSolveOptions, PlanAndSolveResult>
{
  readonly name = "plan-and-solve";

  async run(options: PlanAndSolveOptions): Promise<PlanAndSolveResult> {
    const {
      task,
      provider,
      registry = createRegistry(),
      detailedPlan = true,
      maxExecutionIterations = 12,
      systemPrompt,
      signal,
    } = options;

    const logger = getLogger({
      level: "info",
      pretty: true,
      prefix: "PlanAndSolve",
    });
    logger.info(`Planning: ${task}`);

    const start = Date.now();
    const trajectory: TrajectoryStep[] = [];
    let llmCalls = 0;

    // ---- Phase 1: Plan ----
    const planMessages = [
      ...(systemPrompt
        ? [{ role: "system" as const, content: systemPrompt }]
        : []),
      { role: "user" as const, content: planPrompt(task, detailedPlan) },
    ];

    const planResult = await provider.complete(planMessages, {
      temperature: 0.2,
      signal,
    });
    llmCalls++;
    const plan = planResult.content.trim();

    trajectory.push({
      index: 0,
      type: "plan",
      content: plan,
      timestamp: now(),
    });
    logger.step("plan", 0, plan);

    // ---- Phase 2: Execute ----
    logger.info("Executing plan…");
    const executionTask = planSolvePrompt(task, plan);

    const execResult = await runLoop({
      task: executionTask,
      provider,
      registry,
      maxIterations: maxExecutionIterations,
      systemPrompt,
      logger,
      signal,
    });
    llmCalls += execResult.llmCalls;

    // Offset trajectory indices for execution steps
    const offset = trajectory.length;
    trajectory.push(
      ...execResult.trajectory.map((s) => ({ ...s, index: s.index + offset })),
    );

    return {
      technique: this.name,
      answer: execResult.answer,
      trajectory,
      llmCalls,
      durationMs: Date.now() - start,
      success: execResult.success,
      error: execResult.error,
      plan,
      metadata: { detailedPlan },
    };
  }
}

export async function runPlanAndSolve(
  options: PlanAndSolveOptions,
): Promise<PlanAndSolveResult> {
  return new PlanAndSolveTechnique().run(options);
}
