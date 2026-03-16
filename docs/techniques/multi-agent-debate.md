# Multi-Agent Debate

**Paper:** "Improving Factuality and Reasoning in Language Models through Multiagent Debate"
Du et al., 2023 — [arXiv:2305.14325](https://arxiv.org/abs/2305.14325) (MIT / ICML 2024)

---

## What it is

Multiple LLM instances (agents) independently answer a question, then read each
other's responses and update their positions across several debate rounds. A
final judge (or majority vote) synthesises the consensus answer.

The "society of minds" dynamic: agents challenge each other's reasoning,
correct factual errors, and converge on a more accurate answer than any single
agent would produce alone.

```
Round 0  Agent 1: Paris    Agent 2: Paris    Agent 3: Lyon
              │                  │                  │
          ◄───┴──────────────────┘──────────────────┘
Round 1  Agent 1: Paris    Agent 2: Paris    Agent 3: Paris (corrected)
              │
          Judge / majority vote
              │
          Final: "The capital of France is Paris."
```

---

## When to use it

- **Factual questions** where hallucination risk is high
- **Mathematical reasoning** that benefits from peer checking
- **Controversial or nuanced topics** where multiple perspectives add value
- Scenarios where you want **redundancy** to catch errors a single model would miss

---

## Usage

### Library

```typescript
import { runMultiAgentDebate, AnthropicProvider } from '../agent-harness/src/index.js'

const result = await runMultiAgentDebate({
  task: 'What year was the Eiffel Tower completed, and how tall is it?',
  provider: new AnthropicProvider('claude-opus-4-5'),
  numAgents: 3,
  rounds: 2,
  aggregation: 'judge',
})

console.log(result.answer)          // judge-synthesised answer
console.log(result.agentAnswers)    // [[round0_a0, round0_a1, round0_a2], [round1_...]]
```

### Heterogeneous agents (different providers per agent)

```typescript
const result = await runMultiAgentDebate({
  task: '...',
  provider: new AnthropicProvider('claude-opus-4-5'),  // used for judge
  agentProviders: [
    new AnthropicProvider('claude-haiku-3-5'),
    new OpenAIProvider('gpt-4o'),
    new AnthropicProvider('claude-sonnet-4-5'),
  ],
  numAgents: 3,
  rounds: 1,
  aggregation: 'judge',
})
```

### CLI

```bash
harness run multi-agent-debate \
  --task "Is Pluto a planet? Justify your answer." \
  --num-agents 4 \
  --rounds 2 \
  --aggregation judge
```

---

## Options

| Option | Type | Default | Description |
|---|---|---|---|
| `task` | `string` | required | Question or task |
| `provider` | `LLMProvider` | required | Default provider (and judge) |
| `agentProviders` | `LLMProvider[]` | — | Per-agent provider overrides |
| `numAgents` | `number` | `3` | Number of agent instances |
| `rounds` | `number` | `2` | Debate rounds after initial answers |
| `aggregation` | `"judge" \| "majority"` | `"judge"` | Aggregation method |

---

## Result

```typescript
interface MultiAgentDebateResult extends RunResult {
  agentAnswers: string[][]  // [round][agentIndex]
  finalAnswers: string[]    // last round's per-agent answers (pre-aggregation)
}
```

---

## LLM call count

- Round 0: `numAgents` calls
- Each debate round: `numAgents` calls
- Judge aggregation: 1 call (skipped if `aggregation: "majority"`)

Total: `numAgents × (1 + rounds)` + 1 (judge) calls.

---

## Implementation notes

- All agents in each round are called **in parallel** (via `Promise.all`).
- With `aggregation: "majority"`, the judge call is skipped entirely — the
  winning answer from the final round is selected by plurality vote.
- Agent providers wrap around if `agentProviders.length < numAgents` — useful
  for alternating between two models.
- Debate steps appear in the trajectory with `type: "debate"` and include
  `metadata.round` and `metadata.agentId`.
