/**
 * Optional built-in tools.
 *
 * These are NOT registered by default — host repos must explicitly add them
 * to their harness.config.ts tools array or pass them to a technique.
 *
 * Usage:
 *   import { readFileTool, writeFileTool, shellTool } from './agent-harness/src/tools/built-ins'
 *   // then add to config.tools
 */

import { readFile, writeFile } from "fs/promises";
import { exec } from "child_process";
import { promisify } from "util";
import type { Tool } from "../../types/tool.js";

const execAsync = promisify(exec);

export const readFileTool: Tool = {
  name: "read_file",
  description: "Read the text contents of a file at the given path.",
  inputSchema: {
    type: "object",
    properties: {
      path: {
        type: "string",
        description: "Path to the file to read (relative to CWD or absolute).",
      },
    },
    required: ["path"],
  },
  handler: async ({ path }) => {
    return readFile(path as string, "utf-8");
  },
};

export const writeFileTool: Tool = {
  name: "write_file",
  description: "Write text content to a file at the given path.",
  inputSchema: {
    type: "object",
    properties: {
      path: {
        type: "string",
        description: "Path to write the file to.",
      },
      content: {
        type: "string",
        description: "Text content to write.",
      },
    },
    required: ["path", "content"],
  },
  handler: async ({ path, content }) => {
    await writeFile(path as string, content as string, "utf-8");
    return `File written: ${path as string}`;
  },
};

export const shellTool: Tool = {
  name: "shell",
  description:
    "Run a shell command and return its stdout. Use with caution — commands run in the current working directory.",
  inputSchema: {
    type: "object",
    properties: {
      command: {
        type: "string",
        description: "Shell command to execute.",
      },
    },
    required: ["command"],
  },
  handler: async ({ command }) => {
    const { stdout, stderr } = await execAsync(command as string, {
      timeout: 30_000,
    });
    return stderr ? `STDOUT:\n${stdout}\nSTDERR:\n${stderr}` : stdout;
  },
};

export const builtInTools: Tool[] = [readFileTool, writeFileTool, shellTool];
