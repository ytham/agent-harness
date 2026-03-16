# Reflexion — Verbal Reinforcement Learning

**Paper:** "Reflexion: Language Agents with Verbal Reinforcement Learning"
Shinn et al., 2023 — [arXiv:2303.11366](https://arxiv.org/abs/2303.11366) (NeurIPS 2023)

---

## What it is

Reflexion gives an agent the ability to **learn from its own mistakes without
updating model weights**. After each failed attempt the agent reflects on what
went wrong, stores that reflection as natural-language episodic memory, and
prepends it to the context of the next attempt.

```
Attempt 1  ──►  Fail  ──►  Reflect  ──►  Memory
                                              │
Attempt 2  ◄──────────────────────────────────┘
    │
    ▼
 Success / Attempt 3 …
```

The original paper achieved **91% pass@1 on HumanEval** using this technique,
surpassing GPT-4's 80% at the time.

---

## When to use it

- Tasks where the first attempt reliably fails but correction is possible
- Coding and debugging tasks with a runnable test signal
- Any task where an **external evaluation signal** exists (unit tests, validators,
  human feedback score)
- Multi-attempt search / planning problems

---

## Usage

### Library

```typescript
import { runReflexion, AnthropicProvider, createRegistry } from '../agent-harness/src/index.js'
import { shellTool } from '../agent-harness/src/tools/built-ins/index.js'

const result = await runReflexion({
  task: 'Write a Python function that reverses a linked list. It must pass all tests in tests/test_reverse.py.',
  provider: new AnthropicProvider('claude-opus-4-5'),
  registry: createRegistry([shellTool]),
  maxTrials: 4,
  // Custom evaluator: run the tests and check for "passed"
  evaluator: async (answer) => {
    const { exec } = await import('child_process')
    return new Promise((resolve) => {
      exec('python -m pytest tests/test_reverse.py', (err, stdout) => {
        resolve(!err && stdout.includes('passed'))
      })
    })
  },
})
```

### CLI

```bash
harness run reflexion --task "Fix the failing auth tests" --max-trials 5
```

---

## Options

| Option | Type | Default | Description |
|---|---|---|---|
| `task` | `string` | required | Task description |
| `provider` | `LLMProvider` | required | LLM provider |
| `registry` | `ToolRegistry` | empty | Tools |
| `maxTrials` | `number` | `3` | Maximum retry attempts |
| `memoryWindow` | `number` | `5` | Past reflections to keep in context |
| `evaluator` | `(answer, task) => bool` | non-empty check | Success criterion |
| `maxIterationsPerTrial` | `number` | `8` | Inner ReAct loop limit per trial |

---

## Result

In addition to the base `RunResult`, the `metadata` field includes:

```typescript
{
  trials: number       // how many trials were used
  reflections: string[] // the written self-reflections
}
```

Reflection steps appear in the trajectory with `type: "reflection"`.

---

## Implementation notes

- The inner execution loop is a full ReAct loop — tools work exactly as they do
  with `react`.
- The evaluator can be **synchronous or async**; connect it to any external
  signal: test runner output, linter score, user rating, etc.
- Reflections are kept in a sliding window (`memoryWindow`) to prevent the
  context from growing unboundedly across many trials.
