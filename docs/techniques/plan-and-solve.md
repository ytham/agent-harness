# Plan-and-Solve (PS+)

**Paper:** "Plan-and-Solve Prompting: Improving Zero-Shot Chain-of-Thought Reasoning by Large Language Models"
Wang et al., ACL 2023 — [arXiv:2305.04091](https://arxiv.org/abs/2305.04091)

---

## What it is

Plan-and-Solve is a two-phase prompting pattern that reduces the "missing step"
and arithmetic errors found in vanilla chain-of-thought:

1. **Plan phase** — the LLM decomposes the task into an explicit numbered list of
   subtasks, with optional rationale per step (PS+ variant).
2. **Execute phase** — the plan is fed back as context and each step is executed
   sequentially via a ReAct loop (with tool access).

```
Task ──► Plan (numbered steps)
              │
              ▼
         Execute Step 1 ──► Execute Step 2 ──► … ──► Answer
```

---

## When to use it

- **Multi-step reasoning** where a naive prompt skips necessary steps
- **Mathematical word problems** (PS+ explicitly prompts calculation accuracy)
- **Agentic coding tasks** that benefit from up-front decomposition
- Any task where you want the model to "think before it acts"

---

## Usage

### Library

```typescript
import { runPlanAndSolve, AnthropicProvider, createRegistry } from '../agent-harness/src/index.js'
import { readFileTool, shellTool } from '../agent-harness/src/tools/built-ins/index.js'

const result = await runPlanAndSolve({
  task: 'Migrate the database schema in db/schema.sql to support multi-tenancy.',
  provider: new AnthropicProvider('claude-opus-4-5'),
  registry: createRegistry([readFileTool, shellTool]),
  detailedPlan: true,   // PS+ variant: rationale per step
})

console.log(result.plan)    // the generated plan
console.log(result.answer)  // execution result
```

### CLI

```bash
harness run plan-and-solve \
  --task "Refactor the auth module to use JWT instead of sessions"
```

---

## Options

| Option | Type | Default | Description |
|---|---|---|---|
| `task` | `string` | required | Task description |
| `provider` | `LLMProvider` | required | LLM provider |
| `registry` | `ToolRegistry` | empty | Tools for the execution phase |
| `detailedPlan` | `boolean` | `true` | PS+ mode: include rationale per step |
| `maxExecutionIterations` | `number` | `12` | Iteration budget for the execution loop |

---

## Result

```typescript
interface PlanAndSolveResult extends RunResult {
  plan: string   // the generated plan (Phase 1 output)
}
```

The trajectory begins with a `type: "plan"` step, followed by the execution
loop's `thought` / `action` / `observation` steps.

---

## Implementation notes

- The **execution phase is a full ReAct loop** — all registered tools are
  available and work exactly as in the `react` technique.
- The plan is injected into the execution task prompt, not just the system
  prompt — this ensures the model sees it at the start of every reasoning step.
- For very long plans, consider setting `maxExecutionIterations` higher than
  the default (12) to give the model enough budget to complete all steps.
