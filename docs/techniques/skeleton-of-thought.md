# Skeleton-of-Thought

**Paper:** "Skeleton-of-Thought: Large Language Models Can Do Parallel Decoding"
Ning et al., 2023 — [arXiv:2307.15337](https://arxiv.org/abs/2307.15337) (ICLR 2024)

---

## What it is

Skeleton-of-Thought (SoT) is a **two-stage parallel generation** technique:

1. **Skeleton** — the LLM generates a brief numbered outline of the answer.
2. **Expansion** — each outline point is independently expanded in parallel via
   batched API calls. The expanded sections are concatenated in order.

The key innovation is **parallelism**: instead of generating the entire answer
sequentially (token by token), each point is expanded independently. End-to-end
latency is determined by the slowest single expansion, not their sum.

```
Task ──► Skeleton: [Point 1, Point 2, Point 3]
              │
         ┌────┴────┐
         ▼         ▼         ▼
     Expand P1  Expand P2  Expand P3   ← all in parallel
         │         │         │
         └────┬────┘
              ▼
          Concatenate ──► Answer
```

---

## When to use it

- **Structured questions** with multiple distinct sub-topics
- **List-type answers** (how-tos, comparisons, feature overviews)
- Situations where **latency matters** more than deep sequential reasoning
- Knowledge-heavy tasks that don't require tight inter-step dependencies

> Note: SoT is **not** well-suited for tasks requiring sequential reasoning
> where each step depends on the previous one (use ReAct or Plan-and-Solve
> for those).

---

## Usage

### Library

```typescript
import { runSkeletonOfThought, AnthropicProvider } from '../agent-harness/src/index.js'

const result = await runSkeletonOfThought({
  task: 'Explain the key differences between REST and GraphQL APIs.',
  provider: new AnthropicProvider('claude-opus-4-5'),
  maxPoints: 6,
  parallelExpansion: true,
})

console.log(result.skeleton)     // ['REST overview', 'GraphQL overview', ...]
console.log(result.expansions)   // ['REST is ...', 'GraphQL is ...', ...]
console.log(result.answer)       // assembled markdown answer
```

### CLI

```bash
harness run skeleton-of-thought \
  --task "What are the main considerations when designing a microservices architecture?" \
  --max-points 8
```

---

## Options

| Option | Type | Default | Description |
|---|---|---|---|
| `task` | `string` | required | Question or task |
| `provider` | `LLMProvider` | required | LLM provider |
| `maxPoints` | `number` | `8` | Maximum outline points to generate |
| `parallelExpansion` | `boolean` | `true` | Expand in parallel vs. sequentially |

---

## Result

```typescript
interface SkeletonOfThoughtResult extends RunResult {
  skeleton: string[]     // the outline point titles
  expansions: string[]   // one expanded paragraph per point
}
```

---

## Implementation notes

- **LLM call count**: 1 (skeleton) + N (expansions) = N + 1 total.
  With parallel expansion, wall-clock latency ≈ max(single expansion latency).
- The final `answer` is assembled as Markdown with each point title bolded
  followed by its expanded paragraph.
- Set `parallelExpansion: false` for sequential expansion when using a provider
  with aggressive rate limits.
