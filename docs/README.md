# Agent Harness

A TypeScript library and CLI that implements **8 first-class agentic techniques** not available out-of-the-box in standard IDE tooling or orchestration packages.

The harness is designed to be **symlinked** into other repositories so that any project can adopt these techniques without taking a framework dependency.

---

## Techniques

| Technique | What it does | Paper |
|---|---|---|
| [`react`](./techniques/react.md) | Think → Act → Observe loop (Karpathy / ReAct) | Yao et al., 2022 |
| [`reflexion`](./techniques/reflexion.md) | Self-reflection on failures; retries with written memory | Shinn et al., 2023 |
| [`tree-of-thoughts`](./techniques/tree-of-thoughts.md) | BFS/DFS search over candidate reasoning steps | Yao et al., 2023 |
| [`self-consistency`](./techniques/self-consistency.md) | Sample N chains, return majority-vote answer | Wang et al., 2022 |
| [`critique-loop`](./techniques/critique-loop.md) | Generate → Critique → Revise (LLM-as-Judge) | Bai et al., 2022 |
| [`plan-and-solve`](./techniques/plan-and-solve.md) | Explicit plan first, then step-by-step execution (PS+) | Wang et al., 2023 |
| [`skeleton-of-thought`](./techniques/skeleton-of-thought.md) | Outline → parallel point expansion (low latency) | Ning et al., 2023 |
| [`multi-agent-debate`](./techniques/multi-agent-debate.md) | N agents debate across rounds, judge synthesises | Du et al., 2023 |

---

## Quick Start

### 1. Install dependencies

```bash
cd agent-harness
npm install
```

### 2. Create a config in your host repo

```bash
# From your host repo root
cp agent-harness/harness.config.example.ts harness.config.ts
# Edit model, provider, tools, etc.
```

### 3. Set your API key

```bash
export ANTHROPIC_API_KEY=sk-ant-...
# or
export OPENAI_API_KEY=sk-...
```

### 4. Run a technique

```bash
# Via CLI (tsx, no build required)
npx tsx agent-harness/src/cli.ts run react --task "Fix the auth bug in src/auth.ts"

# Or after building:
npm run build --prefix agent-harness
./agent-harness/dist/cli.js run react --task "..."
```

### 5. Use as a library

```typescript
import { runReact, AnthropicProvider, createRegistry } from './agent-harness/src/index.js'

const result = await runReact({
  task: 'What files are in this repo?',
  provider: new AnthropicProvider('claude-opus-4-5'),
  registry: createRegistry([/* your tools */]),
  maxIterations: 10,
})

console.log(result.answer)
console.log(result.trajectory) // full step-by-step trace
```

---

## Providers

| Provider | Config value | Env var |
|---|---|---|
| Anthropic Claude | `"anthropic"` | `ANTHROPIC_API_KEY` |
| OpenAI | `"openai"` | `OPENAI_API_KEY` |
| Ollama (local) | `"ollama"` | `OLLAMA_BASE_URL` (default: `http://localhost:11434`) |
| Custom | `LLMProvider` object | — |

---

## Tools

Register tools in `harness.config.ts`:

```typescript
import type { HarnessConfig } from './agent-harness/src/types/config.js'

const config: HarnessConfig = {
  provider: 'anthropic',
  model: 'claude-opus-4-5',
  tools: [
    {
      name: 'read_file',
      description: 'Read a file by path.',
      inputSchema: {
        type: 'object',
        properties: { path: { type: 'string' } },
        required: ['path'],
      },
      handler: async ({ path }) => fs.readFile(path as string, 'utf-8'),
    },
  ],
}

export default config
```

The harness also ships optional **built-in tools** you can import directly:

```typescript
import { readFileTool, writeFileTool, shellTool } from './agent-harness/src/tools/built-ins/index.js'
```

---

## CLI Reference

```
harness list                          List all techniques
harness info <technique>              Show technique description + paper
harness run <technique> [options]     Run a technique

Options for `run`:
  -t, --task <task>          Task description (required)
  -c, --config <path>        Config file path (auto-discovered if omitted)
  -m, --model <model>        Override model from config
  -p, --provider <provider>  Override provider (anthropic|openai|ollama)
  -v, --verbose              Debug logging

Technique-specific options:
  --max-iterations <n>       react: iteration budget
  --max-trials <n>           reflexion: retry budget
  --samples <n>              self-consistency: sample count
  --temperature <n>          sampling temperature
  --branching <n>            tree-of-thoughts: branching factor
  --strategy bfs|dfs         tree-of-thoughts: search strategy
  --max-depth <n>            tree-of-thoughts: max depth
  --max-rounds <n>           critique-loop: rounds
  --num-agents <n>           multi-agent-debate: agent count
  --rounds <n>               multi-agent-debate: debate rounds
  --aggregation judge|majority  multi-agent-debate: aggregation method
  --max-points <n>           skeleton-of-thought: outline points
  --no-parallel              skeleton-of-thought: sequential expansion
```

---

## Testing

```bash
# Unit tests (mocked providers, no API keys required)
npm test

# Watch mode
npm run test:watch

# Live integration tests (requires real API keys)
HARNESS_LIVE_TESTS=1 npm run test:integration
```

---

## Project Structure

```
agent-harness/
├── src/
│   ├── index.ts              # Library entrypoint
│   ├── cli.ts                # CLI entrypoint
│   ├── types/                # Shared TypeScript types
│   ├── providers/            # LLM provider implementations
│   ├── tools/                # ToolRegistry + built-in tools
│   ├── techniques/           # One directory per technique
│   └── utils/                # Logger, prompt templates, config loader
├── tests/integration/        # Live integration tests (opt-in)
├── docs/                     # This documentation
│   └── techniques/           # Per-technique docs
├── harness.config.example.ts # Reference config for host repos
└── .env.example              # Environment variable reference
```

---

## Symlink Integration

See [symlink-guide.md](./symlink-guide.md) for full instructions on wiring this into a host repo.
