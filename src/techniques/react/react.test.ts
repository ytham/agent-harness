import { describe, it, expect, vi } from "vitest";
import { runReact } from "./index.js";
import { createRegistry } from "../../tools/registry.js";
import type { LLMProvider } from "../../providers/provider.js";

/** Build a mock provider that returns canned responses in sequence. */
function mockProvider(responses: { content: string; toolCalls?: { id: string; name: string; input: Record<string, unknown> }[] }[]): LLMProvider {
  let callIndex = 0;
  return {
    name: "mock",
    model: "mock-model",
    complete: vi.fn().mockImplementation(async () => {
      const r = responses[callIndex] ?? responses[responses.length - 1];
      callIndex++;
      return {
        content: r.content,
        toolCalls: r.toolCalls ?? [],
        done: true,
      };
    }),
  };
}

describe("ReAct technique", () => {
  it("returns the answer from a single-turn completion", async () => {
    const provider = mockProvider([
      {
        content: "Thought: This is straightforward.\nAnswer: 42",
      },
    ]);

    const result = await runReact({
      task: "What is 6 * 7?",
      provider,
      registry: createRegistry(),
    });

    expect(result.success).toBe(true);
    expect(result.answer).toBe("42");
    expect(result.technique).toBe("react");
    expect(result.llmCalls).toBe(1);
  });

  it("executes a tool call and uses the observation", async () => {
    const registry = createRegistry([
      {
        name: "calculator",
        description: "Evaluate a math expression",
        inputSchema: {
          type: "object",
          properties: { expr: { type: "string" } },
          required: ["expr"],
        },
        handler: async ({ expr }) => String(eval(expr as string)),
      },
    ]);

    const provider = mockProvider([
      {
        content: "Thought: I need to calculate.",
        toolCalls: [{ id: "1", name: "calculator", input: { expr: "6 * 7" } }],
      },
      {
        content: "Thought: The calculator returned 42.\nAnswer: 42",
      },
    ]);

    const result = await runReact({ task: "What is 6 * 7?", provider, registry });

    expect(result.success).toBe(true);
    expect(result.answer).toBe("42");
    expect(result.trajectory.some((s) => s.type === "action")).toBe(true);
    expect(result.trajectory.some((s) => s.type === "observation")).toBe(true);
    expect(result.llmCalls).toBe(2);
  });

  it("stops at maxIterations and marks the run as failed", async () => {
    const provider = mockProvider([
      { content: "Thought: Still thinking…" },
    ]);

    const result = await runReact({
      task: "An unsolvable task",
      provider,
      registry: createRegistry(),
      maxIterations: 3,
    });

    expect(result.success).toBe(false);
    expect(result.answer).toBe("");
    expect(result.llmCalls).toBe(3);
    expect(result.error).toMatch(/maximum iterations/i);
  });

  it("respects an abort signal", async () => {
    const controller = new AbortController();
    controller.abort();

    const provider = mockProvider([{ content: "Thought: …" }]);

    const result = await runReact({
      task: "Anything",
      provider,
      registry: createRegistry(),
      signal: controller.signal,
    });

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/aborted/i);
    expect(result.llmCalls).toBe(0);
  });

  it("records trajectory steps in order", async () => {
    const registry = createRegistry([
      {
        name: "echo",
        description: "Echo the input",
        inputSchema: {
          type: "object",
          properties: { text: { type: "string" } },
          required: ["text"],
        },
        handler: async ({ text }) => text as string,
      },
    ]);

    const provider = mockProvider([
      {
        content: "Thought: Let me echo.",
        toolCalls: [{ id: "1", name: "echo", input: { text: "hello" } }],
      },
      { content: "Thought: Done.\nAnswer: hello" },
    ]);

    const result = await runReact({ task: "Echo hello", provider, registry });

    const types = result.trajectory.map((s) => s.type);
    expect(types).toContain("thought");
    expect(types).toContain("action");
    expect(types).toContain("observation");
  });
});
