import { describe, it, expect, vi } from "vitest";
import { runSkeletonOfThought } from "./index.js";
import type { LLMProvider } from "../../providers/provider.js";

function mockProvider(responses: string[]): LLMProvider {
  let i = 0;
  return {
    name: "mock",
    model: "mock",
    complete: vi.fn().mockImplementation(async () => {
      const content = responses[i] ?? responses[responses.length - 1];
      i++;
      return { content, toolCalls: [], done: true };
    }),
  };
}

describe("SkeletonOfThought technique", () => {
  it("generates a skeleton then expands each point", async () => {
    const provider = mockProvider([
      // Stage 1: skeleton
      "1. Introduction\n2. Main body\n3. Conclusion",
      // Stage 2: expansions (3 points)
      "This is the introduction.",
      "This is the main body.",
      "This is the conclusion.",
    ]);

    const result = await runSkeletonOfThought({
      task: "Write an essay outline",
      provider,
      maxPoints: 3,
    });

    expect(result.success).toBe(true);
    expect(result.skeleton).toEqual(["Introduction", "Main body", "Conclusion"]);
    expect(result.expansions.length).toBe(3);
    expect(result.answer).toContain("Introduction");
    expect(result.answer).toContain("Conclusion");
    expect(result.llmCalls).toBe(4); // 1 skeleton + 3 expansions
  });

  it("expands sequentially when parallelExpansion=false", async () => {
    const completeOrder: number[] = [];
    let callCount = 0;

    const provider: LLMProvider = {
      name: "mock",
      model: "mock",
      complete: vi.fn().mockImplementation(async () => {
        const index = callCount++;
        completeOrder.push(index);
        if (index === 0) {
          return {
            content: "1. Point A\n2. Point B",
            toolCalls: [],
            done: true,
          };
        }
        return {
          content: `Expansion for point ${index}`,
          toolCalls: [],
          done: true,
        };
      }),
    };

    const result = await runSkeletonOfThought({
      task: "Test",
      provider,
      parallelExpansion: false,
    });

    // All calls happen in order 0, 1, 2
    expect(completeOrder).toEqual([0, 1, 2]);
    expect(result.expansions.length).toBe(2);
  });

  it("records a plan step for the skeleton", async () => {
    const provider = mockProvider([
      "1. A\n2. B",
      "Expansion A",
      "Expansion B",
    ]);

    const result = await runSkeletonOfThought({ task: "Test", provider });

    const planSteps = result.trajectory.filter((s) => s.type === "plan");
    expect(planSteps.length).toBe(1);
    expect(planSteps[0].content).toContain("A");
  });

  it("returns success=false if skeleton is empty", async () => {
    const provider = mockProvider(["", "irrelevant"]);

    const result = await runSkeletonOfThought({ task: "Empty", provider });

    expect(result.success).toBe(false);
  });
});
