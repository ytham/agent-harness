/**
 * harness.config.example.ts
 *
 * Copy this file to harness.config.ts at the root of your host repository
 * and customise it for your project.
 *
 * The harness will automatically discover this file by walking up from CWD.
 */

import type { HarnessConfig } from "./src/types/config.js";

const config: HarnessConfig = {
  // ------------------------------------------------------------------ provider
  // Built-in values: "anthropic" | "openai" | "ollama"
  // Or supply a custom LLMProvider object (see src/providers/provider.ts).
  provider: "anthropic",

  // Model identifier passed directly to the provider SDK.
  model: "claude-opus-4-5",

  // Optional base URL override (useful for Ollama or proxied endpoints).
  // baseURL: "http://localhost:11434",

  // ------------------------------------------------------------------ tools
  // Register tools that agents can call during execution.
  // Each tool must have a unique name, a description, a JSON-Schema input
  // definition, and an async handler.
  tools: [
    // {
    //   name: "read_file",
    //   description: "Read the contents of a file at the given path.",
    //   inputSchema: {
    //     type: "object",
    //     properties: {
    //       path: { type: "string", description: "Relative file path" },
    //     },
    //     required: ["path"],
    //   },
    //   handler: async ({ path }) => {
    //     const fs = await import("fs/promises");
    //     return fs.readFile(path, "utf-8");
    //   },
    // },
  ],

  // ---------------------------------------------------------------- techniques
  // Per-technique defaults. All fields are optional; the harness provides
  // sensible defaults when omitted.
  techniques: {
    react: {
      maxIterations: 10,
    },
    reflexion: {
      maxTrials: 3,
      memoryWindow: 5,
    },
    treeOfThoughts: {
      branching: 3,
      strategy: "bfs",
      maxDepth: 4,
      scoreThreshold: 0.7,
    },
    selfConsistency: {
      samples: 5,
      temperature: 0.8,
    },
    critiqueLoop: {
      maxRounds: 3,
      criteria: ["correctness", "completeness", "clarity"],
    },
    planAndSolve: {
      detailedPlan: true,
    },
    skeletonOfThought: {
      maxPoints: 8,
      parallelExpansion: true,
    },
    multiAgentDebate: {
      numAgents: 3,
      rounds: 2,
      aggregation: "judge",
    },
  },

  // ----------------------------------------------------------------- logging
  logging: {
    level: "info", // "silent" | "info" | "debug"
    pretty: true,
  },
};

export default config;
