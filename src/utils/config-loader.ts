/**
 * Config loader — discovers and loads harness.config.ts (or .json) by walking
 * up from the given start directory (defaults to CWD).
 */

import { readFile, access } from "fs/promises";
import { join, dirname } from "path";
import { pathToFileURL } from "url";
import type { HarnessConfig } from "../types/config.js";

const CONFIG_FILENAMES = [
  "harness.config.ts",
  "harness.config.js",
  "harness.config.json",
];

/**
 * Walk up from startDir looking for a harness config file.
 * Returns the resolved config or throws if none is found.
 */
export async function loadConfig(startDir?: string): Promise<HarnessConfig> {
  const base = startDir ?? process.cwd();
  const configPath = await findConfigFile(base);

  if (!configPath) {
    throw new Error(
      `Could not find a harness config file (harness.config.ts/js/json) ` +
        `starting from: ${base}\n` +
        `Run: cp agent-harness/harness.config.example.ts harness.config.ts`,
    );
  }

  if (configPath.endsWith(".json")) {
    const raw = await readFile(configPath, "utf-8");
    return JSON.parse(raw) as HarnessConfig;
  }

  // Dynamic import for .ts/.js — requires tsx or ts-node in PATH
  const url = pathToFileURL(configPath).href;
  const mod = (await import(url)) as { default?: HarnessConfig } | HarnessConfig;
  const config = "default" in mod ? (mod as { default: HarnessConfig }).default : (mod as HarnessConfig);

  if (!config) {
    throw new Error(
      `Config file at ${configPath} did not export a default HarnessConfig object.`,
    );
  }

  return config;
}

async function findConfigFile(startDir: string): Promise<string | null> {
  let current = startDir;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    for (const name of CONFIG_FILENAMES) {
      const candidate = join(current, name);
      if (await exists(candidate)) {
        return candidate;
      }
    }

    const parent = dirname(current);
    if (parent === current) break; // reached filesystem root
    current = parent;
  }

  return null;
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}
