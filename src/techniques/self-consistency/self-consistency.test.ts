import { describe, it, expect, vi } from "vitest";
import { runSelfConsistency } from "./index.js";
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

describe("Self-Consistency technique", () => {
  it("returns the majority answer across samples", async () => {
    const provider = mockProvider([
      "Let me think... Answer: Paris",
      "The capital is... Answer: Paris",
      "I believe... Answer: London",
      "Clearly... Answer: Paris",
      "My answer is... Answer: Berlin",
    ]);

    const result = await runSelfConsistency({
      task: "What is the capital of France?",
      provider,
      samples: 5,
      temperature: 0.8,
    });

    expect(result.answer).toBe("Paris");
    expect(result.votes["Paris"]).toBe(3);
    expect(result.llmCalls).toBe(5);
    expect(result.success).toBe(true);
  });

  it("handles a tie by picking the first-seen answer", async () => {
    const provider = mockProvider([
      "Answer: A",
      "Answer: B",
      "Answer: A",
      "Answer: B",
    ]);

    const result = await runSelfConsistency({
      task: "Pick A or B",
      provider,
      samples: 4,
    });

    // A was seen first and both have 2 votes
    expect(result.answer).toBe("A");
  });

  it("falls back to last line if no 'Answer:' prefix found", async () => {
    const provider = mockProvider([
      "Step 1: think.\nStep 2: conclude.\n42",
      "Step 1: reason.\n42",
      "The answer must be 42",
    ]);

    const result = await runSelfConsistency({
      task: "Ultimate question",
      provider,
      samples: 3,
    });

    expect(result.answer).toBe("42");
  });

  it("records one trajectory step per chain", async () => {
    const provider = mockProvider(["Answer: X", "Answer: X"]);

    const result = await runSelfConsistency({
      task: "test",
      provider,
      samples: 2,
    });

    expect(result.trajectory.length).toBe(2);
    expect(result.chains.length).toBe(2);
  });
});
