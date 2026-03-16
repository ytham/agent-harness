/**
 * Reflexion self-critique module.
 *
 * After a failed attempt the agent calls the LLM on its own trajectory to
 * produce a written reflection. That reflection is stored as episodic memory
 * and prepended to future attempts.
 */

import type { LLMProvider } from "../../providers/provider.js";
import type { TrajectoryStep } from "../../types/technique.js";
import { reflexionReflectPrompt } from "../../utils/prompts.js";

export async function generateReflection(
  task: string,
  trajectory: TrajectoryStep[],
  feedback: string,
  provider: LLMProvider,
): Promise<string> {
  const prompt = reflexionReflectPrompt(task, trajectory, feedback);
  const result = await provider.complete([
    { role: "user", content: prompt },
  ], { temperature: 0.2 });
  return result.content.trim();
}

/** Build the memory block prepended to each retry attempt. */
export function buildMemoryBlock(reflections: string[], window: number): string {
  if (reflections.length === 0) return "";
  const recent = reflections.slice(-window);
  const numbered = recent
    .map((r, i) => `Reflection ${i + 1}:\n${r}`)
    .join("\n\n");
  return `## Lessons From Previous Attempts\n${numbered}\n\nApply these lessons in your current attempt.\n\n`;
}
