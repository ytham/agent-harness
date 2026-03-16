/**
 * Shared prompt templates used across techniques.
 *
 * Keeping templates here (rather than inlined) makes them easy to override
 * and prevents duplication across technique implementations.
 */

import type { Tool } from "../types/tool.js";
import type { TrajectoryStep } from "../types/technique.js";

/** Build a tool-use section for system prompts. */
export function toolsSystemBlock(tools: Tool[]): string {
  if (tools.length === 0) return "";

  const toolList = tools
    .map(
      (t) =>
        `- **${t.name}**: ${t.description}\n  Input: ${JSON.stringify(t.inputSchema)}`,
    )
    .join("\n");

  return `\n\n## Available Tools\nYou can call tools by emitting a JSON block with this structure:\n\`\`\`json\n{ "tool": "<name>", "input": { ... } }\n\`\`\`\n\nTools:\n${toolList}`;
}

/** Format a trajectory as a readable string for inclusion in prompts. */
export function formatTrajectory(steps: TrajectoryStep[]): string {
  return steps
    .map((s) => `[${s.type.toUpperCase()} ${s.index}]\n${s.content}`)
    .join("\n\n");
}

/** Create a step timestamp string. */
export function now(): string {
  return new Date().toISOString();
}

// ------------------------------------------------------------------ ReAct

export const REACT_SYSTEM = `You are a helpful AI agent. You solve tasks by thinking step by step, using available tools when needed, and observing the results before proceeding.

Format your responses as:
Thought: <your reasoning about what to do next>
Action: <tool name> | <JSON input> (omit if no tool needed)
Answer: <final answer when you are done>

Only emit "Answer:" when you are fully confident the task is complete.`;

// ------------------------------------------------------------------ Reflexion

export const REFLEXION_SYSTEM = `You are a helpful AI agent that learns from past mistakes. Before each attempt you will be shown reflections from previous failed attempts. Use them to avoid repeating errors.`;

export function reflexionReflectPrompt(
  task: string,
  trajectory: TrajectoryStep[],
  feedback: string,
): string {
  return `You attempted the following task and did not succeed.

Task: ${task}

Your trajectory:
${formatTrajectory(trajectory)}

Feedback / failure signal: ${feedback}

Write a concise self-reflection (2–4 sentences) identifying:
1. What went wrong
2. What you should do differently next time

Reflection:`;
}

// ------------------------------------------------------------------ Tree of Thoughts

export function totGenerateThoughtsPrompt(
  task: string,
  currentPath: string[],
  n: number,
): string {
  const pathStr =
    currentPath.length > 0
      ? `\nReasoning so far:\n${currentPath.map((p, i) => `Step ${i + 1}: ${p}`).join("\n")}`
      : "";

  return `Task: ${task}${pathStr}

Generate ${n} distinct next reasoning steps that could advance toward the solution. Each step should explore a different approach or direction. Output as a numbered list, one step per line.`;
}

export function totEvaluatePrompt(
  task: string,
  path: string[],
  thought: string,
): string {
  const pathStr =
    path.length > 0
      ? `\nPrevious steps:\n${path.map((p, i) => `Step ${i + 1}: ${p}`).join("\n")}`
      : "";

  return `Task: ${task}${pathStr}

Proposed next step: ${thought}

Rate how promising this step is for solving the task on a scale from 0.0 to 1.0, where:
- 1.0 = highly promising, likely leads to solution
- 0.5 = uncertain, worth exploring
- 0.0 = wrong direction, dead end

Respond with only a number between 0.0 and 1.0.`;
}

export function totFinalAnswerPrompt(task: string, path: string[]): string {
  return `Task: ${task}

Reasoning path:
${path.map((p, i) => `Step ${i + 1}: ${p}`).join("\n")}

Based on this reasoning, provide the final answer to the task.`;
}

// ------------------------------------------------------------------ Self-Consistency

export function selfConsistencyPrompt(task: string): string {
  return `${task}

Think step by step and provide your final answer clearly at the end, prefixed with "Answer:".`;
}

// ------------------------------------------------------------------ Critique Loop

export function critiqueGeneratePrompt(task: string): string {
  return `${task}`;
}

export function critiqueEvaluatePrompt(
  task: string,
  response: string,
  criteria: string[],
): string {
  const criteriaList = criteria.map((c) => `- ${c}`).join("\n");

  return `You are evaluating a response to the following task.

Task: ${task}

Response:
${response}

Evaluate the response against these criteria:
${criteriaList}

For each criterion, note whether it is met and any specific issues. Then provide an overall score from 1–10 and a concise list of improvements needed.

Format:
Score: <1-10>
Issues:
- <issue 1>
- <issue 2>
Improvements:
- <improvement 1>`;
}

export function critiqueRevisePrompt(
  task: string,
  response: string,
  critique: string,
): string {
  return `Task: ${task}

Previous response:
${response}

Critique:
${critique}

Please revise the response to address the issues identified in the critique. Provide only the revised response, no meta-commentary.`;
}

// ------------------------------------------------------------------ Plan and Solve

export function planPrompt(task: string, detailed: boolean): string {
  return detailed
    ? `Task: ${task}

Create a detailed, step-by-step plan to solve this task. For each step:
1. State what needs to be done
2. Explain why it is necessary
3. Note any prerequisites

Format as a numbered list. Be specific and thorough.`
    : `Task: ${task}

Create a clear step-by-step plan to solve this task. Format as a numbered list.`;
}

export function planSolvePrompt(task: string, plan: string): string {
  return `Task: ${task}

Plan:
${plan}

Execute the plan step by step. Show your work for each step, then provide the final answer.`;
}

// ------------------------------------------------------------------ Skeleton of Thought

export function skeletonPrompt(task: string, maxPoints: number): string {
  return `Task: ${task}

Generate a skeleton outline of the answer with at most ${maxPoints} key points. Output only a numbered list of brief point titles, nothing else.`;
}

export function skeletonExpandPrompt(
  task: string,
  point: string,
  pointIndex: number,
  totalPoints: number,
): string {
  return `You are expanding point ${pointIndex + 1} of ${totalPoints} in an answer to this task:

Task: ${task}

Point to expand: ${point}

Write a thorough, self-contained paragraph expanding this point. Do not include meta-commentary about the structure.`;
}

// ------------------------------------------------------------------ Multi-Agent Debate

export function debateInitialPrompt(task: string, agentId: number): string {
  return `You are Agent ${agentId + 1}. Answer the following task independently and thoroughly.

Task: ${task}

Provide your complete answer.`;
}

export function debateRoundPrompt(
  task: string,
  agentId: number,
  ownAnswer: string,
  otherAnswers: string[],
): string {
  const othersText = otherAnswers
    .map((a, i) => `Agent ${i + 1} (other):\n${a}`)
    .join("\n\n");

  return `You are Agent ${agentId + 1}. The task is:

Task: ${task}

Your previous answer:
${ownAnswer}

Other agents' answers:
${othersText}

Review the other agents' answers critically. If they raise valid points you missed, or if they have errors you can correct, update your answer accordingly. Provide your revised answer.`;
}

export function debateJudgePrompt(task: string, answers: string[]): string {
  const answersText = answers
    .map((a, i) => `Agent ${i + 1}:\n${a}`)
    .join("\n\n---\n\n");

  return `You are a neutral judge. The following agents have debated the answer to this task:

Task: ${task}

Agent answers after debate:
${answersText}

Synthesize the best aspects of each answer into a single definitive response. Resolve any disagreements using your best judgment.`;
}
