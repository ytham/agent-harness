# Tree of Thoughts

**Paper:** "Tree of Thoughts: Deliberate Problem Solving with Large Language Models"
Yao et al., 2023 — [arXiv:2305.10601](https://arxiv.org/abs/2305.10601) (NeurIPS 2023)

---

## What it is

Tree of Thoughts (ToT) generalises chain-of-thought reasoning into a **tree
search** over intermediate reasoning steps. At each node the LLM generates N
candidate "thoughts" (next reasoning steps), a scoring prompt rates each for
promise, and the search proceeds via BFS or DFS — backtracking from dead ends.

This enables **deliberate lookahead** that is impossible in a single linear
chain. The original paper solved 74% of Game of 24 tasks vs. 4% with standard
CoT.

```
          Task
         /    \    \
       T1     T2    T3       ← branching=3
      / \      |
    T1a  T1b  T2a             ← depth=2
         |
       Answer
```

---

## When to use it

- **Hard reasoning tasks** where a wrong early step leads to an unrecoverable path
- Mathematical or logical puzzles requiring exploration
- Creative tasks where multiple approaches should be evaluated
- Any problem benefiting from **systematic search** over solution paths

---

## Usage

### Library

```typescript
import { runTreeOfThoughts, AnthropicProvider } from '../agent-harness/src/index.js'

const result = await runTreeOfThoughts({
  task: 'Use the numbers 4, 7, 8, 14 with basic arithmetic to reach 24.',
  provider: new AnthropicProvider('claude-opus-4-5'),
  branching: 4,
  strategy: 'bfs',
  maxDepth: 3,
  scoreThreshold: 0.6,
})

console.log(result.answer)
console.log('Winning path:', result.bestPath)
```

### CLI

```bash
harness run tree-of-thoughts \
  --task "Solve the following logic puzzle: ..." \
  --branching 3 \
  --strategy dfs \
  --max-depth 4
```

---

## Options

| Option | Type | Default | Description |
|---|---|---|---|
| `task` | `string` | required | Problem to solve |
| `provider` | `LLMProvider` | required | LLM provider |
| `branching` | `number` | `3` | Candidate thoughts per node |
| `strategy` | `"bfs" \| "dfs"` | `"bfs"` | Search algorithm |
| `maxDepth` | `number` | `4` | Maximum tree depth |
| `scoreThreshold` | `number` | `0.5` | Min score (0–1) to expand a node |

---

## Result

```typescript
interface TreeOfThoughtsResult extends RunResult {
  bestPath: string[]  // The winning sequence of thoughts
}
```

---

## LLM calls

Each node in the tree requires:
- **1 generation call** to produce N candidate thoughts
- **N evaluation calls** to score each thought

For `branching=3`, `maxDepth=3`, worst-case calls ≈ 3³ × 2 = 54 (BFS).
DFS with early termination is typically much cheaper.

---

## Implementation notes

- Scoring uses a 0–1 float prompt — responses are parsed with a regex; malformed
  scores default to 0 (node pruned).
- The search terminates as soon as `maxDepth` is reached for all frontier nodes.
  The final answer is generated from the highest-scoring complete path.
- For tasks without a clear scoring signal, lower `scoreThreshold` (e.g. 0.3) to
  explore more broadly; raise it to prune aggressively.
