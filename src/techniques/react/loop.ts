/**
 * ReAct core loop — Think → Act → Observe, repeating until the LLM emits
 * an "Answer:" line or the iteration limit is reached.
 */

import type { LLMProvider, Message } from "../../providers/provider.js";
import type { ToolRegistry } from "../../tools/registry.js";
import type { TrajectoryStep } from "../../types/technique.js";
import { REACT_SYSTEM, now } from "../../utils/prompts.js";
import type { Logger } from "../../utils/logger.js";

export interface LoopOptions {
  task: string;
  provider: LLMProvider;
  registry: ToolRegistry;
  maxIterations: number;
  systemPrompt?: string;
  logger: Logger;
  signal?: AbortSignal;
}

export interface LoopResult {
  answer: string;
  trajectory: TrajectoryStep[];
  llmCalls: number;
  success: boolean;
  error?: string;
}

/** Regex patterns for parsing the LLM's structured output. */
const THOUGHT_RE = /^Thought:\s*(.+)/im;
const ACTION_RE = /^Action:\s*(\w+)\s*\|\s*(.+)/im;
const ANSWER_RE = /^Answer:\s*([\s\S]+)/im;

export async function runLoop(options: LoopOptions): Promise<LoopResult> {
  const { task, provider, registry, maxIterations, logger, signal } = options;
  const systemPrompt = options.systemPrompt ?? buildSystemPrompt(registry);

  const messages: Message[] = [
    { role: "system", content: systemPrompt },
    { role: "user", content: task },
  ];

  const trajectory: TrajectoryStep[] = [];
  let llmCalls = 0;
  let stepIndex = 0;

  for (let iteration = 0; iteration < maxIterations; iteration++) {
    if (signal?.aborted) {
      return {
        answer: "",
        trajectory,
        llmCalls,
        success: false,
        error: "Aborted",
      };
    }

    const result = await provider.complete(messages, {
      temperature: 0,
      tools: registry.list(),
      signal,
    });
    llmCalls++;

    const raw = result.content;

    // -- Parse Thought
    const thoughtMatch = THOUGHT_RE.exec(raw);
    if (thoughtMatch) {
      const step: TrajectoryStep = {
        index: stepIndex++,
        type: "thought",
        content: thoughtMatch[1].trim(),
        timestamp: now(),
      };
      trajectory.push(step);
      logger.step("thought", step.index, step.content);
    }

    // -- Check for final Answer
    const answerMatch = ANSWER_RE.exec(raw);
    if (answerMatch) {
      const answer = answerMatch[1].trim();
      trajectory.push({
        index: stepIndex++,
        type: "thought",
        content: `[FINAL] ${answer}`,
        timestamp: now(),
      });
      logger.info(`ReAct completed in ${iteration + 1} iteration(s).`);
      return { answer, trajectory, llmCalls, success: true };
    }

    // -- Handle native tool calls (Anthropic / OpenAI function calling)
    if (result.toolCalls.length > 0) {
      for (const tc of result.toolCalls) {
        const actionStep: TrajectoryStep = {
          index: stepIndex++,
          type: "action",
          content: `${tc.name}(${JSON.stringify(tc.input)})`,
          timestamp: now(),
          metadata: { toolName: tc.name, toolInput: tc.input },
        };
        trajectory.push(actionStep);
        logger.step("action", actionStep.index, actionStep.content);

        const toolResult = await registry.call(tc.name, tc.input);
        const observation = toolResult.error ?? toolResult.output;

        const obsStep: TrajectoryStep = {
          index: stepIndex++,
          type: "observation",
          content: observation,
          timestamp: now(),
          metadata: { toolName: tc.name },
        };
        trajectory.push(obsStep);
        logger.step("observation", obsStep.index, obsStep.content);

        messages.push({ role: "assistant", content: raw });
        messages.push({
          role: "user",
          content: `Observation from ${tc.name}: ${observation}`,
        });
      }
      continue;
    }

    // -- Parse text-based Action (for models without native tool calling)
    const actionMatch = ACTION_RE.exec(raw);
    if (actionMatch) {
      const toolName = actionMatch[1].trim();
      let toolInput: Record<string, unknown> = {};
      try {
        toolInput = JSON.parse(actionMatch[2].trim()) as Record<string, unknown>;
      } catch {
        toolInput = { input: actionMatch[2].trim() };
      }

      const actionStep: TrajectoryStep = {
        index: stepIndex++,
        type: "action",
        content: `${toolName}(${JSON.stringify(toolInput)})`,
        timestamp: now(),
        metadata: { toolName, toolInput },
      };
      trajectory.push(actionStep);
      logger.step("action", actionStep.index, actionStep.content);

      const toolResult = await registry.call(toolName, toolInput);
      const observation = toolResult.error ?? toolResult.output;

      const obsStep: TrajectoryStep = {
        index: stepIndex++,
        type: "observation",
        content: observation,
        timestamp: now(),
        metadata: { toolName },
      };
      trajectory.push(obsStep);
      logger.step("observation", obsStep.index, obsStep.content);

      messages.push({ role: "assistant", content: raw });
      messages.push({
        role: "user",
        content: `Observation: ${observation}\n\nContinue.`,
      });
      continue;
    }

    // -- No action, no answer — treat the whole response as a thought and continue
    messages.push({ role: "assistant", content: raw });
    messages.push({
      role: "user",
      content: "Continue. If you have the final answer, prefix it with 'Answer:'.",
    });
  }

  return {
    answer: "",
    trajectory,
    llmCalls,
    success: false,
    error: `Reached maximum iterations (${maxIterations}) without a final answer.`,
  };
}

function buildSystemPrompt(registry: ToolRegistry): string {
  if (registry.isEmpty()) return REACT_SYSTEM;

  const toolDefs = registry
    .list()
    .map((t) => `- ${t.name}: ${t.description}`)
    .join("\n");

  return `${REACT_SYSTEM}\n\n## Available Tools\n${toolDefs}`;
}
