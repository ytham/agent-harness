# Self-Consistency / Majority Voting

**Paper:** "Self-Consistency Improves Chain of Thought Reasoning in Language Models"
Wang et al., 2022 — [arXiv:2203.11171](https://arxiv.org/abs/2203.11171) (ICLR 2023)

---

## What it is

Self-consistency is a **decoding strategy** that samples N independent
chain-of-thought completions from the LLM at temperature > 0, extracts the final
answer from each, and returns the answer that appears most frequently
(marginalising over diverse reasoning paths).

No additional model, training, or tools are required. It is the simplest
technique in the harness yet delivers substantial gains: +17.9% on GSM8K,
+11% on SVAMP in the original paper.

```
Task ──► Chain 1 ──► Answer: Paris   ┐
     ──► Chain 2 ──► Answer: Paris   ├── majority vote ──► Paris
     ──► Chain 3 ──► Answer: London  │
     ──► Chain 4 ──► Answer: Paris   ┘
```

---

## When to use it

- **Arithmetic and mathematical reasoning**
- **Multiple-choice and factual questions** with a discrete answer space
- Any task where **reliability** matters more than speed
- Quick quality boost without any prompt engineering

---

## Usage

### Library

```typescript
import { runSelfConsistency, AnthropicProvider } from '../agent-harness/src/index.js'

const result = await runSelfConsistency({
  task: 'Janet's ducks lay 16 eggs per day. She eats 3 for breakfast and sells the rest at $2 each. How much does she earn per day?',
  provider: new AnthropicProvider('claude-opus-4-5'),
  samples: 7,
  temperature: 0.8,
})

console.log(result.answer)          // majority answer
console.log(result.votes)           // { "26": 5, "28": 2 }
console.log(result.chains.length)   // 7
```

### CLI

```bash
harness run self-consistency --task "What is 17 * 23?" --samples 9
```

---

## Options

| Option | Type | Default | Description |
|---|---|---|---|
| `task` | `string` | required | Question or task |
| `provider` | `LLMProvider` | required | LLM provider |
| `samples` | `number` | `5` | Number of independent chains to sample |
| `temperature` | `number` | `0.8` | Sampling temperature (>0 for diversity) |
| `systemPrompt` | `string` | — | Optional system prompt |

---

## Result

```typescript
interface SelfConsistencyResult extends RunResult {
  votes: Record<string, number>  // answer → vote count
  chains: string[]               // all raw completions
}
```

---

## Implementation notes

- All N chains are sampled **in parallel** (via `Promise.all`) — latency is
  determined by the single slowest call, not the sum.
- Answer extraction: looks for an `"Answer: ..."` line in each chain; falls back
  to the last non-empty line.
- Tie-breaking: the answer seen first in the iteration order wins ties.
- **Cost**: N × the cost of one completion. Choose `samples` based on your
  cost/accuracy trade-off.
