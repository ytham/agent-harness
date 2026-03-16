# ReAct — Reasoning + Acting (The Karpathy Loop)

**Paper:** "ReAct: Synergizing Reasoning and Acting in Language Models"
Yao et al., 2022 — [arXiv:2210.03629](https://arxiv.org/abs/2210.03629) (ICLR 2023)

---

## What it is

ReAct is the foundational agentic loop: the LLM alternates between **thinking**
(producing a chain-of-thought reasoning trace) and **acting** (calling a tool or
taking an action), then **observing** the result before repeating. This continues
until the model emits a final answer or the iteration budget is exhausted.

Andrej Karpathy popularised this pattern as "the LLM agent loop" — the model
runs inside a tight think → act → observe cycle, which is how virtually all
modern agentic systems (AutoGPT, Claude tool use, OpenAI function-calling agents)
operate at their core.

```
┌──────────────────────────────────────────────┐
│  Task                                        │
│    │                                         │
│    ▼                                         │
│  Thought  ──►  Action  ──►  Observation      │
│    ▲                              │          │
│    └──────────────────────────────┘          │
│                                              │
│    ▼ (when done)                             │
│  Answer                                      │
└──────────────────────────────────────────────┘
```

---

## When to use it

- Tasks requiring **external information retrieval** (file read, search, shell)
- **Multi-step reasoning** where intermediate results affect next steps
- Any task where the model needs to interact with its environment

---

## Usage

### Library

```typescript
import { runReact, AnthropicProvider, createRegistry } from '../agent-harness/src/index.js'
import { readFileTool, shellTool } from '../agent-harness/src/tools/built-ins/index.js'

const result = await runReact({
  task: 'What does the function `parseAuth` do in src/auth.ts?',
  provider: new AnthropicProvider('claude-opus-4-5'),
  registry: createRegistry([readFileTool, shellTool]),
  maxIterations: 15,
})

console.log(result.answer)
// Each think/act/observe step is in result.trajectory
```

### CLI

```bash
harness run react --task "Find all TODO comments in the codebase" --max-iterations 20
```

---

## Options

| Option | Type | Default | Description |
|---|---|---|---|
| `task` | `string` | required | Task description |
| `provider` | `LLMProvider` | required | LLM provider instance |
| `registry` | `ToolRegistry` | empty | Tools the agent can call |
| `maxIterations` | `number` | `10` | Max think→act→observe cycles |
| `systemPrompt` | `string` | built-in | Override the system prompt |
| `signal` | `AbortSignal` | — | Cancel a running loop |

---

## Result

```typescript
interface RunResult {
  answer: string           // Final answer
  trajectory: TrajectoryStep[]  // All thought/action/observation steps
  llmCalls: number         // Total LLM completions made
  durationMs: number       // Wall-clock time
  success: boolean         // false if iteration limit hit
  error?: string
}
```

---

## Implementation notes

- Supports **native tool calling** (Anthropic, OpenAI) and **text-based tool
  parsing** for models that don't support structured function calls (Ollama).
- The entire conversation history is kept in the context window — for very long
  runs, consider increasing `maxTokens` on your provider.
- The technique is composable: `reflexion` and `plan-and-solve` both use the
  ReAct loop internally for their execution phase.
