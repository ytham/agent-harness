import { describe, it, expect, vi } from "vitest";
import { runPlanAndSolve } from "./index.js";
import { createRegistry } from "../../tools/registry.js";
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

describe("PlanAndSolve technique", () => {
  it("produces a plan then executes it to return a final answer", async () => {
    const provider = mockProvider([
      // Phase 1: plan
      "1. Identify the numbers\n2. Multiply them\n3. Return the result",
      // Phase 2: execution (ReAct loop)
      "Thought: Following the plan, 6 * 7 = 42.\nAnswer: 42",
    ]);

    const result = await runPlanAndSolve({
      task: "What is 6 * 7?",
      provider,
      registry: createRegistry(),
    });

    expect(result.success).toBe(true);
    expect(result.answer).toBe("42");
    expect(result.plan).toContain("Multiply");
    expect(result.technique).toBe("plan-and-solve");
  });

  it("records a plan step at the start of the trajectory", async () => {
    const provider = mockProvider([
      "1. Step A\n2. Step B",
      "Thought: Done.\nAnswer: result",
    ]);

    const result = await runPlanAndSolve({
      task: "Test task",
      provider,
      registry: createRegistry(),
    });

    const planSteps = result.trajectory.filter((s) => s.type === "plan");
    expect(planSteps.length).toBe(1);
    expect(planSteps[0].content).toContain("Step A");
  });

  it("marks failure if execution loop exhausts iterations", async () => {
    const provider = mockProvider([
      "1. Step one",
      "Thought: hmm…", // repeated — never produces Answer
    ]);

    const result = await runPlanAndSolve({
      task: "Impossible",
      provider,
      registry: createRegistry(),
      maxExecutionIterations: 2,
    });

    expect(result.success).toBe(false);
    expect(result.plan).toBeTruthy();
  });

  it("uses detailed plan when detailedPlan=true", async () => {
    const mockComplete = vi.fn().mockResolvedValue({
      content: "Detailed plan step 1\nDetailed plan step 2",
      toolCalls: [],
      done: true,
    });
    const provider: LLMProvider = { name: "mock", model: "mock", complete: mockComplete };

    // Second call for execution
    mockComplete.mockResolvedValueOnce({
      content: "Detailed plan step 1\nDetailed plan step 2",
      toolCalls: [],
      done: true,
    });
    mockComplete.mockResolvedValueOnce({
      content: "Answer: done",
      toolCalls: [],
      done: true,
    });

    const result = await runPlanAndSolve({
      task: "A detailed task",
      provider,
      registry: createRegistry(),
      detailedPlan: true,
    });

    // The first call should have included "detailed" instructions
    const firstCallArgs = mockComplete.mock.calls[0];
    const userMsg = (firstCallArgs as unknown[])[0] as { role: string; content: string }[];
    const userContent = userMsg.find((m) => m.role === "user")?.content ?? "";
    expect(userContent).toMatch(/detailed|rationale|step/i);
    expect(result.metadata?.detailedPlan).toBe(true);
  });
});
