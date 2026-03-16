# Critique Loop (LLM-as-Judge)

**Related work:**
- Constitutional AI — Bai et al., 2022 (Anthropic)
- Self-Refine — Madaan et al., 2023 — [arXiv:2303.17651](https://arxiv.org/abs/2303.17651)
- MT-Bench — Zheng et al., 2023 — [arXiv:2306.05685](https://arxiv.org/abs/2306.05685)

---

## What it is

The critique loop implements an iterative **Generate → Critique → Revise**
pattern. A generator LLM produces an initial response; a judge LLM evaluates it
against configurable criteria and returns a score plus written feedback; the
generator revises based on that feedback. This repeats for up to `maxRounds`
iterations or until the score exceeds a satisfaction threshold.

```
Task ──► Generate ──► Critique ──► Score ≥ threshold? ──► Done
                 ◄── Revise   ◄──  No
```

---

## When to use it

- **Code generation** — the judge checks for bugs, style, and completeness
- **Writing tasks** — the judge evaluates clarity, accuracy, and tone
- **Any task with explicit quality criteria** you can describe in natural language
- Building **preference data** for RLHF training (use the scores as labels)

---

## Usage

### Library

```typescript
import { runCritiqueLoop, AnthropicProvider } from '../agent-harness/src/index.js'

const result = await runCritiqueLoop({
  task: 'Write a function in TypeScript that validates an email address.',
  provider: new AnthropicProvider('claude-opus-4-5'),
  maxRounds: 3,
  criteria: [
    'correctness — does it correctly reject invalid emails?',
    'edge cases — handles empty string, missing @, multiple dots',
    'TypeScript types — properly typed input and return',
  ],
  satisfactionThreshold: 8,
})

console.log(result.answer)         // final revised code
console.log(result.rounds)         // [{ response, critique, score }, ...]
```

### Separate judge provider

```typescript
const result = await runCritiqueLoop({
  task: '...',
  provider: new AnthropicProvider('claude-haiku-3-5'),   // fast generator
  judgeProvider: new AnthropicProvider('claude-opus-4-5'), // high-quality judge
  maxRounds: 2,
})
```

### CLI

```bash
harness run critique-loop \
  --task "Write a binary search implementation" \
  --max-rounds 4
```

---

## Options

| Option | Type | Default | Description |
|---|---|---|---|
| `task` | `string` | required | Task description |
| `provider` | `LLMProvider` | required | Generator LLM |
| `judgeProvider` | `LLMProvider` | same as provider | Optional separate judge |
| `maxRounds` | `number` | `3` | Max generate→critique→revise rounds |
| `criteria` | `string[]` | correctness, completeness, clarity | Evaluation criteria |
| `satisfactionThreshold` | `number` | `8` | Score (1–10) to stop early |

---

## Result

```typescript
interface CritiqueLoopResult extends RunResult {
  rounds: {
    response: string
    critique: string
    score: number     // 1–10
  }[]
}
```

---

## Implementation notes

- Critique steps appear in the trajectory with `type: "critique"` and include
  the numeric score in `metadata.score`.
- The generator and judge can be **different providers** — e.g. a cheap fast
  model generates, an expensive capable model critiques.
- `satisfactionThreshold` defaults to 8 (out of 10) — lower it to be less
  demanding, raise it for higher quality at the cost of more rounds.
