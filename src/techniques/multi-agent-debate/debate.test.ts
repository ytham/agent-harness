import { describe, it, expect, vi } from "vitest";
import { runMultiAgentDebate } from "./index.js";
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

describe("MultiAgentDebate technique", () => {
  it("runs initial round and one debate round then judges", async () => {
    // 3 agents × round 0 = 3 calls
    // 3 agents × round 1 = 3 calls
    // 1 judge = 1 call → total 7
    const provider = mockProvider([
      "Agent 1 initial: Paris",   // round 0, agent 0
      "Agent 2 initial: Paris",   // round 0, agent 1
      "Agent 3 initial: London",  // round 0, agent 2
      "Agent 1 revised: Paris",   // round 1, agent 0
      "Agent 2 revised: Paris",   // round 1, agent 1
      "Agent 3 revised: Paris",   // round 1, agent 2
      "The capital of France is Paris.", // judge
    ]);

    const result = await runMultiAgentDebate({
      task: "What is the capital of France?",
      provider,
      numAgents: 3,
      rounds: 1,
      aggregation: "judge",
    });

    expect(result.success).toBe(true);
    expect(result.answer).toBe("The capital of France is Paris.");
    expect(result.llmCalls).toBe(7);
    expect(result.agentAnswers.length).toBe(2); // round 0 + round 1
  });

  it("uses majority vote aggregation", async () => {
    const provider = mockProvider([
      "Paris",   // agent 0
      "Paris",   // agent 1
      "London",  // agent 2
      // no judge call
    ]);

    const result = await runMultiAgentDebate({
      task: "Capital of France?",
      provider,
      numAgents: 3,
      rounds: 0,
      aggregation: "majority",
    });

    expect(result.answer).toBe("Paris");
    expect(result.llmCalls).toBe(3); // no judge call
  });

  it("uses per-agent providers when supplied", async () => {
    const provider0 = mockProvider(["Agent A says X", "A revised X"]);
    const provider1 = mockProvider(["Agent B says Y", "B revised Y"]);
    const judgeProvider = mockProvider(["Judge says X"]);

    // We need a base provider for the judge
    const baseProvider = mockProvider(["Judge says X"]);

    const result = await runMultiAgentDebate({
      task: "Pick X or Y",
      provider: baseProvider,
      agentProviders: [provider0, provider1],
      numAgents: 2,
      rounds: 1,
      aggregation: "judge",
    });

    expect(result.success).toBe(true);
    // provider0 and provider1 should each have been called
    expect((provider0.complete as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThan(0);
    expect((provider1.complete as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThan(0);
    void judgeProvider;
  });

  it("records debate trajectory steps for each agent in each round", async () => {
    const provider = mockProvider([
      "A0", "A1",      // round 0
      "A0r", "A1r",    // round 1
      "Final",         // judge
    ]);

    const result = await runMultiAgentDebate({
      task: "Test",
      provider,
      numAgents: 2,
      rounds: 1,
      aggregation: "judge",
    });

    const debateSteps = result.trajectory.filter((s) => s.type === "debate");
    expect(debateSteps.length).toBe(4); // 2 agents × 2 rounds
  });
});
