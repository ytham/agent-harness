#!/usr/bin/env node
/**
 * agent-harness CLI
 *
 * Usage:
 *   harness run <technique> --task "..." [--config path] [--model ...] [--verbose]
 *   harness list
 *   harness info <technique>
 *
 * Examples:
 *   harness run react --task "Fix the bug in auth.ts"
 *   harness run reflexion --task "Write a sorting algorithm" --max-trials 5
 *   harness run self-consistency --task "What is 17 * 23?" --samples 7
 *   harness list
 */

import { Command, Option } from "commander";
import { loadConfig } from "./utils/config-loader.js";
import { resolveProvider } from "./providers/index.js";
import { createRegistry } from "./tools/registry.js";
import { runReact } from "./techniques/react/index.js";
import { runReflexion } from "./techniques/reflexion/index.js";
import { runTreeOfThoughts } from "./techniques/tree-of-thoughts/index.js";
import { runSelfConsistency } from "./techniques/self-consistency/index.js";
import { runCritiqueLoop } from "./techniques/critique-loop/index.js";
import { runPlanAndSolve } from "./techniques/plan-and-solve/index.js";
import { runSkeletonOfThought } from "./techniques/skeleton-of-thought/index.js";
import { runMultiAgentDebate } from "./techniques/multi-agent-debate/index.js";
import type { HarnessConfig } from "./types/config.js";
import type { RunResult } from "./types/technique.js";

// ---- Technique registry (name → metadata) --------------------------------

const TECHNIQUES: Record<
  string,
  { description: string; paper: string }
> = {
  react: {
    description: "Reasoning + Acting loop (Karpathy / ReAct). Think → Act → Observe cycles.",
    paper: "Yao et al., 2022 (arXiv:2210.03629)",
  },
  reflexion: {
    description: "Self-reflection loop. Retries failed attempts with written lessons-learned.",
    paper: "Shinn et al., 2023 (arXiv:2303.11366)",
  },
  "tree-of-thoughts": {
    description: "BFS/DFS search over candidate reasoning steps with LLM scoring.",
    paper: "Yao et al., 2023 (arXiv:2305.10601)",
  },
  "self-consistency": {
    description: "Sample N chains-of-thought, return the majority-vote answer.",
    paper: "Wang et al., 2022 (arXiv:2203.11171)",
  },
  "critique-loop": {
    description: "Generate → Critique → Revise loop (LLM-as-Judge).",
    paper: "Bai et al., 2022 (Constitutional AI) + Madaan et al., 2023 (Self-Refine)",
  },
  "plan-and-solve": {
    description: "Two-phase: explicit plan first, then step-by-step execution (PS+).",
    paper: "Wang et al., ACL 2023 (arXiv:2305.04091)",
  },
  "skeleton-of-thought": {
    description: "Outline first, then expand all points in parallel for low latency.",
    paper: "Ning et al., 2023 (arXiv:2307.15337)",
  },
  "multi-agent-debate": {
    description: "N agents debate across multiple rounds, converging to a consensus.",
    paper: "Du et al., 2023 (arXiv:2305.14325)",
  },
};

// ---- Main CLI setup -------------------------------------------------------

const program = new Command();

program
  .name("harness")
  .description("Agent Harness — run agentic techniques from the command line")
  .version("0.1.0");

// ---- `list` command -------------------------------------------------------

program
  .command("list")
  .description("List all available techniques")
  .action(() => {
    console.log("\nAvailable techniques:\n");
    for (const [name, meta] of Object.entries(TECHNIQUES)) {
      console.log(`  ${name.padEnd(24)} ${meta.description}`);
    }
    console.log();
  });

// ---- `info` command -------------------------------------------------------

program
  .command("info <technique>")
  .description("Show detailed information about a technique")
  .action((technique: string) => {
    const meta = TECHNIQUES[technique];
    if (!meta) {
      console.error(`Unknown technique: "${technique}". Run "harness list" to see available techniques.`);
      process.exit(1);
    }
    console.log(`\nTechnique: ${technique}`);
    console.log(`Description: ${meta.description}`);
    console.log(`Paper: ${meta.paper}`);
    console.log();
  });

// ---- `run` command --------------------------------------------------------

program
  .command("run <technique>")
  .description("Run a technique against a task")
  .requiredOption("-t, --task <task>", "Task description or question")
  .option("-c, --config <path>", "Path to harness.config.ts/json (auto-discovered if omitted)")
  .option("-m, --model <model>", "Override the model from config")
  .option("-v, --verbose", "Enable debug logging", false)
  .addOption(
    new Option("-p, --provider <provider>", "Override provider").choices([
      "anthropic",
      "openai",
      "ollama",
    ]),
  )
  // Per-technique options (parsed selectively)
  .option("--max-iterations <n>", "react: max iterations", parseInt)
  .option("--max-trials <n>", "reflexion: max trials", parseInt)
  .option("--samples <n>", "self-consistency: number of samples", parseInt)
  .option("--temperature <n>", "sampling temperature", parseFloat)
  .option("--branching <n>", "tree-of-thoughts: branching factor", parseInt)
  .option("--strategy <s>", "tree-of-thoughts: bfs or dfs")
  .option("--max-depth <n>", "tree-of-thoughts: max tree depth", parseInt)
  .option("--max-rounds <n>", "critique-loop: max critique rounds", parseInt)
  .option("--num-agents <n>", "multi-agent-debate: number of agents", parseInt)
  .option("--rounds <n>", "multi-agent-debate: debate rounds", parseInt)
  .option("--aggregation <a>", "multi-agent-debate: judge or majority")
  .option("--max-points <n>", "skeleton-of-thought: max outline points", parseInt)
  .option("--no-parallel", "skeleton-of-thought: disable parallel expansion")
  .action(async (technique: string, opts: Record<string, unknown>) => {
    if (!TECHNIQUES[technique]) {
      console.error(
        `Unknown technique: "${technique}". Run "harness list" to see available techniques.`,
      );
      process.exit(1);
    }

    // Load config
    let config: HarnessConfig;
    try {
      config = await loadConfig(
        opts.config ? String(opts.config) : undefined,
      );
    } catch (err) {
      console.error(
        "Failed to load harness config:\n",
        err instanceof Error ? err.message : String(err),
      );
      process.exit(1);
    }

    // Apply CLI overrides
    if (opts.provider) config.provider = opts.provider as "anthropic" | "openai" | "ollama";
    if (opts.model) config.model = String(opts.model);
    if (opts.verbose) config.logging = { ...config.logging, level: "debug" };

    const provider = resolveProvider(config);
    const registry = createRegistry(config.tools ?? []);
    const task = String(opts.task);

    let result: RunResult;

    try {
      switch (technique) {
        case "react":
          result = await runReact({
            task,
            provider,
            registry,
            maxIterations:
              (opts.maxIterations as number | undefined) ??
              config.techniques?.react?.maxIterations,
          });
          break;

        case "reflexion":
          result = await runReflexion({
            task,
            provider,
            registry,
            maxTrials:
              (opts.maxTrials as number | undefined) ??
              config.techniques?.reflexion?.maxTrials,
            memoryWindow: config.techniques?.reflexion?.memoryWindow,
          });
          break;

        case "tree-of-thoughts":
          result = await runTreeOfThoughts({
            task,
            provider,
            branching:
              (opts.branching as number | undefined) ??
              config.techniques?.treeOfThoughts?.branching,
            strategy:
              ((opts.strategy as string | undefined) ??
                config.techniques?.treeOfThoughts?.strategy) as
                | "bfs"
                | "dfs"
                | undefined,
            maxDepth:
              (opts.maxDepth as number | undefined) ??
              config.techniques?.treeOfThoughts?.maxDepth,
            scoreThreshold:
              config.techniques?.treeOfThoughts?.scoreThreshold,
          });
          break;

        case "self-consistency":
          result = await runSelfConsistency({
            task,
            provider,
            samples:
              (opts.samples as number | undefined) ??
              config.techniques?.selfConsistency?.samples,
            temperature:
              (opts.temperature as number | undefined) ??
              config.techniques?.selfConsistency?.temperature,
          });
          break;

        case "critique-loop":
          result = await runCritiqueLoop({
            task,
            provider,
            maxRounds:
              (opts.maxRounds as number | undefined) ??
              config.techniques?.critiqueLoop?.maxRounds,
            criteria: config.techniques?.critiqueLoop?.criteria,
          });
          break;

        case "plan-and-solve":
          result = await runPlanAndSolve({
            task,
            provider,
            registry,
            detailedPlan: config.techniques?.planAndSolve?.detailedPlan,
          });
          break;

        case "skeleton-of-thought":
          result = await runSkeletonOfThought({
            task,
            provider,
            maxPoints:
              (opts.maxPoints as number | undefined) ??
              config.techniques?.skeletonOfThought?.maxPoints,
            parallelExpansion:
              opts.parallel !== false
                ? (config.techniques?.skeletonOfThought?.parallelExpansion ??
                  true)
                : false,
          });
          break;

        case "multi-agent-debate":
          result = await runMultiAgentDebate({
            task,
            provider,
            numAgents:
              (opts.numAgents as number | undefined) ??
              config.techniques?.multiAgentDebate?.numAgents,
            rounds:
              (opts.rounds as number | undefined) ??
              config.techniques?.multiAgentDebate?.rounds,
            aggregation:
              ((opts.aggregation as string | undefined) ??
                config.techniques?.multiAgentDebate?.aggregation) as
                | "judge"
                | "majority"
                | undefined,
          });
          break;

        default:
          console.error(`Unhandled technique: ${technique}`);
          process.exit(1);
      }
    } catch (err) {
      console.error(
        "\nRun failed:\n",
        err instanceof Error ? err.message : String(err),
      );
      process.exit(1);
    }

    printResult(technique, result);
  });

// ---- Result printer -------------------------------------------------------

function printResult(technique: string, result: RunResult): void {
  const statusIcon = result.success ? "✓" : "✗";
  const duration = (result.durationMs / 1000).toFixed(2);

  console.log(`\n${"─".repeat(60)}`);
  console.log(`${statusIcon} ${technique} | ${duration}s | ${result.llmCalls} LLM call(s)`);
  console.log("─".repeat(60));

  if (result.success) {
    console.log("\nAnswer:\n");
    console.log(result.answer);
  } else {
    console.log("\nFailed:", result.error);
  }

  console.log(`\n${"─".repeat(60)}\n`);
}

// ---- Entry point ----------------------------------------------------------

program.parse(process.argv);
