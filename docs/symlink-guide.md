# Symlink Integration Guide

This guide explains how to wire `agent-harness` into any host repository so that
it is available as a local path dependency, requiring zero publishing or version
management.

---

## How it works

You create a **symlink** in your host repo that points to the `agent-harness`
directory wherever it lives on your filesystem (or as a git submodule). The host
repo then has a stable local path (`./agent-harness/`) that always reflects the
current state of the harness.

---

## Step 1 — Create the symlink

### Option A: Filesystem symlink (single machine)

```bash
# From your host repo root:
ln -s /absolute/path/to/agent-harness agent-harness
```

### Option B: Git submodule (shared across machines / teams)

```bash
# Add agent-harness as a submodule (adjust URL to your actual remote)
git submodule add https://github.com/your-org/agent-harness agent-harness

# On a fresh clone:
git submodule update --init --recursive
```

---

## Step 2 — Install harness dependencies

The harness has its own `package.json`. Install its dependencies once:

```bash
npm install --prefix agent-harness
```

---

## Step 3 — Create your config

```bash
cp agent-harness/harness.config.example.ts harness.config.ts
```

Edit `harness.config.ts` at your host repo root:

```typescript
import type { HarnessConfig } from './agent-harness/src/types/config.js'

const config: HarnessConfig = {
  provider: 'anthropic',
  model: 'claude-opus-4-5',
  tools: [
    // register your host-repo-specific tools here
  ],
  techniques: {
    react: { maxIterations: 15 },
  },
}

export default config
```

---

## Step 4 — Set environment variables

```bash
# .env (never commit this)
ANTHROPIC_API_KEY=sk-ant-...
```

If your host repo uses `dotenv`, it will be picked up automatically. Otherwise,
export the variable in your shell before running the harness.

---

## Step 5 — Run a technique

### Via CLI (no build required)

```bash
npx tsx agent-harness/src/cli.ts run react --task "Describe the purpose of this codebase"
```

Add a convenience script to your host repo's `package.json`:

```json
{
  "scripts": {
    "harness": "tsx agent-harness/src/cli.ts"
  }
}
```

Then:

```bash
npm run harness -- run react --task "..."
npm run harness -- list
```

### Via library import

```typescript
// host-repo/src/some-script.ts
import { runReact, AnthropicProvider, createRegistry } from '../agent-harness/src/index.js'
import { readFileTool, shellTool } from '../agent-harness/src/tools/built-ins/index.js'

const result = await runReact({
  task: 'Investigate and fix the failing test in tests/auth.test.ts',
  provider: new AnthropicProvider('claude-opus-4-5'),
  registry: createRegistry([readFileTool, shellTool]),
  maxIterations: 20,
})

console.log(result.answer)
```

---

## TypeScript configuration

If your host repo uses TypeScript, add a path alias for clean imports (optional):

```json
// host-repo/tsconfig.json
{
  "compilerOptions": {
    "paths": {
      "@harness": ["./agent-harness/src/index.ts"],
      "@harness/*": ["./agent-harness/src/*"]
    }
  }
}
```

Then import as:

```typescript
import { runReflexion } from '@harness'
```

---

## Gitignore

Make sure your host repo does not accidentally commit the harness `node_modules`
or `dist` (they live inside the symlinked directory):

```gitignore
# host-repo/.gitignore
agent-harness/node_modules/
agent-harness/dist/
```

If using a git submodule, the symlinked directory itself is tracked, but its
`node_modules` and `dist` are excluded by the harness's own `.gitignore`.

---

## Updating the harness

### Filesystem symlink
The symlink always reflects the latest state — just pull the harness repo.

### Git submodule
```bash
# Update to latest harness commit
git submodule update --remote agent-harness
git add agent-harness
git commit -m "chore: update agent-harness submodule"
```

---

## Multiple host repos using the same harness

Each host repo gets its own `harness.config.ts` with different models, tools, and
technique defaults. The harness itself is shared and unchanged.

```
~/dev/
├── agent-harness/          ← single source of truth
├── project-a/
│   ├── agent-harness -> ../../agent-harness
│   └── harness.config.ts   ← project-a specific tools/model
└── project-b/
    ├── agent-harness -> ../../agent-harness
    └── harness.config.ts   ← project-b specific tools/model
```
