import { describe, it, expect, vi } from "vitest";
import { runTreeOfThoughts } from "./index.js";
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

describe("Tree of Thoughts technique", () => {
  it("generates thoughts, scores them, and returns a final answer", async () => {
    // Call order with branching=3, maxDepth=1, scoreThreshold=0.5:
    //   1. generate thoughts for root (depth 0)
    //   2. score approach A  → 0.9  (added to frontier at depth 1)
    //   3. score approach B  → 0.3  (below threshold, pruned)
    //   4. score approach C  → 0.8  (added to frontier at depth 1)
    //   Depth-1 nodes are dequeued but skipped (depth >= maxDepth) before generation.
    //   5. final answer from best path
    const provider = mockProvider([
      { content: "1. Try approach A\n2. Try approach B\n3. Try approach C" }, // 1: gen root
      { content: "0.9" },  // 2: score A
      { content: "0.3" },  // 3: score B
      { content: "0.8" },  // 4: score C
      { content: "The final answer is X." }, // 5: final answer
    ]);

    const result = await runTreeOfThoughts({
      task: "Solve a hard puzzle",
      provider,
      branching: 3,
      strategy: "bfs",
      maxDepth: 1,
      scoreThreshold: 0.5,
    });

    expect(result.success).toBe(true);
    expect(result.answer).toBe("The final answer is X.");
    expect(result.bestPath.length).toBeGreaterThan(0);
    expect(result.technique).toBe("tree-of-thoughts");
  });

  it("returns failure when no thought exceeds the score threshold", async () => {
    const provider = mockProvider([
      { content: "1. Approach A\n2. Approach B" },
      { content: "0.1" }, // score for A — below threshold
      { content: "0.2" }, // score for B — below threshold
      { content: "Fallback answer" }, // final answer (not reached)
    ]);

    const result = await runTreeOfThoughts({
      task: "Impossible task",
      provider,
      branching: 2,
      strategy: "bfs",
      maxDepth: 2,
      scoreThreshold: 0.9,
    });

    expect(result.success).toBe(false);
    expect(result.answer).toBe("");
  });

  it("records thought steps in the trajectory", async () => {
    const provider = mockProvider([
      { content: "1. Step one\n2. Step two" },
      { content: "0.8" },
      { content: "0.7" },
      { content: "Final answer." },
    ]);

    const result = await runTreeOfThoughts({
      task: "Test",
      provider,
      branching: 2,
      maxDepth: 1,
      scoreThreshold: 0.5,
    });

    const thoughts = result.trajectory.filter((s) => s.type === "thought");
    expect(thoughts.length).toBeGreaterThan(0);
  });
});
