import { describe, it, expect, vi } from "vitest";
import { runCritiqueLoop } from "./index.js";
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

describe("CritiqueLoop technique", () => {
  it("returns the initial response when first critique score meets threshold", async () => {
    const provider = mockProvider([
      "A great initial response.",        // generate
      "Score: 9\nIssues:\n- None\nImprovements:\n- None", // critique — above threshold
    ]);

    const result = await runCritiqueLoop({
      task: "Explain something",
      provider,
      maxRounds: 3,
      satisfactionThreshold: 8,
    });

    expect(result.success).toBe(true);
    expect(result.answer).toBe("A great initial response.");
    expect(result.rounds.length).toBe(1);
    expect(result.llmCalls).toBe(2); // generate + critique
  });

  it("revises the response when score is below threshold", async () => {
    const provider = mockProvider([
      "Initial (weak) response.",                              // generate
      "Score: 4\nIssues:\n- Vague\nImprovements:\n- Be specific", // critique round 1
      "Improved response with specifics.",                     // revise round 1
      "Score: 9\nIssues:\n- None\nImprovements:\n- None",     // critique round 2 — above threshold
    ]);

    const result = await runCritiqueLoop({
      task: "Explain something",
      provider,
      maxRounds: 3,
      satisfactionThreshold: 8,
    });

    expect(result.answer).toBe("Improved response with specifics.");
    expect(result.rounds.length).toBe(2);
    expect(result.llmCalls).toBe(4);
  });

  it("stops after maxRounds even if score never reaches threshold", async () => {
    const provider = mockProvider([
      "Response 1",
      "Score: 3\nIssues:\n- bad\nImprovements:\n- fix",
      "Response 2",
      "Score: 5\nIssues:\n- still bad\nImprovements:\n- fix more",
    ]);

    const result = await runCritiqueLoop({
      task: "Task",
      provider,
      maxRounds: 2,
      satisfactionThreshold: 9,
    });

    expect(result.rounds.length).toBe(2);
    expect(result.success).toBe(true);
  });

  it("records critique steps in trajectory", async () => {
    const provider = mockProvider([
      "Answer",
      "Score: 10\nIssues:\n- None",
    ]);

    const result = await runCritiqueLoop({
      task: "Test",
      provider,
      maxRounds: 1,
    });

    const critiqueSteps = result.trajectory.filter((s) => s.type === "critique");
    expect(critiqueSteps.length).toBe(1);
    expect(critiqueSteps[0].metadata?.score).toBe(10);
  });
});
