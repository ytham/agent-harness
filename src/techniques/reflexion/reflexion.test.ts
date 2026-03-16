import { describe, it, expect, vi } from "vitest";
import { runReflexion } from "./index.js";
import { createRegistry } from "../../tools/registry.js";
import type { LLMProvider } from "../../providers/provider.js";

function mockProvider(responses: { content: string }[]): LLMProvider {
  let i = 0;
  return {
    name: "mock",
    model: "mock",
    complete: vi.fn().mockImplementation(async () => {
      const r = responses[i] ?? responses[responses.length - 1];
      i++;
      return { content: r.content, toolCalls: [], done: true };
    }),
  };
}

describe("Reflexion technique", () => {
  it("succeeds on first trial if answer passes evaluator", async () => {
    const provider = mockProvider([{ content: "Answer: Paris" }]);

    const result = await runReflexion({
      task: "What is the capital of France?",
      provider,
      registry: createRegistry(),
      maxTrials: 3,
      evaluator: (answer) => answer.includes("Paris"),
    });

    expect(result.success).toBe(true);
    expect(result.answer).toBe("Paris");
    expect(result.metadata?.trials).toBe(1);
  });

  it("retries after a failed attempt and succeeds on second trial", async () => {
    // Trial 1: wrong answer → reflection → Trial 2: correct answer
    const provider = mockProvider([
      { content: "Answer: London" },   // trial 1 answer
      { content: "I stated London but the correct answer is Paris. Next time I will say Paris." }, // reflection
      { content: "Answer: Paris" },    // trial 2 answer
    ]);

    const result = await runReflexion({
      task: "What is the capital of France?",
      provider,
      registry: createRegistry(),
      maxTrials: 3,
      evaluator: (answer) => answer.includes("Paris"),
    });

    expect(result.success).toBe(true);
    expect(result.metadata?.trials).toBe(2);
    const reflectionSteps = result.trajectory.filter((s) => s.type === "reflection");
    expect(reflectionSteps.length).toBe(1);
  });

  it("fails after exhausting all trials", async () => {
    const provider = mockProvider([
      { content: "Answer: Wrong" },
      { content: "Reflection: I should do better." },
    ]);

    const result = await runReflexion({
      task: "Hard task",
      provider,
      registry: createRegistry(),
      maxTrials: 2,
      evaluator: () => false,
    });

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/failed after/i);
  });

  it("stores reflections in metadata", async () => {
    const provider = mockProvider([
      { content: "Answer: Wrong" },
      { content: "Reflection: I need to reconsider." },
      { content: "Answer: Still wrong" },
    ]);

    const result = await runReflexion({
      task: "Some task",
      provider,
      registry: createRegistry(),
      maxTrials: 2,
      evaluator: () => false,
    });

    const reflections = result.metadata?.reflections as string[];
    expect(Array.isArray(reflections)).toBe(true);
    expect(reflections.length).toBeGreaterThan(0);
  });
});
