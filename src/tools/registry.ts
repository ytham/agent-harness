/**
 * ToolRegistry — manages tools registered by the host repo.
 *
 * Techniques retrieve tools from the registry when building prompts and
 * dispatch tool calls through it during execution.
 */

import type { Tool, ToolResult } from "../types/tool.js";

export class ToolRegistry {
  private tools: Map<string, Tool> = new Map();

  /** Register a single tool. Throws if a tool with the same name already exists. */
  register(tool: Tool): this {
    if (this.tools.has(tool.name)) {
      throw new Error(
        `Tool "${tool.name}" is already registered. Use replace() to overwrite.`,
      );
    }
    this.tools.set(tool.name, tool);
    return this;
  }

  /** Register multiple tools at once. */
  registerAll(tools: Tool[]): this {
    for (const tool of tools) {
      this.register(tool);
    }
    return this;
  }

  /** Replace an existing tool (or register if it doesn't exist). */
  replace(tool: Tool): this {
    this.tools.set(tool.name, tool);
    return this;
  }

  /** Retrieve a tool by name. Returns undefined if not found. */
  get(name: string): Tool | undefined {
    return this.tools.get(name);
  }

  /** Return all registered tools as an array. */
  list(): Tool[] {
    return Array.from(this.tools.values());
  }

  /** Return true if the registry has no tools. */
  isEmpty(): boolean {
    return this.tools.size === 0;
  }

  /**
   * Execute a tool call by name.
   * Always resolves — errors are captured in the result's `error` field.
   */
  async call(
    name: string,
    input: Record<string, unknown>,
  ): Promise<ToolResult> {
    const tool = this.tools.get(name);

    if (!tool) {
      return {
        toolName: name,
        input,
        output: "",
        error: `Tool "${name}" not found in registry.`,
      };
    }

    try {
      const output = await tool.handler(input);
      return { toolName: name, input, output };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        toolName: name,
        input,
        output: "",
        error: `Tool "${name}" threw an error: ${message}`,
      };
    }
  }
}

/** Create a ToolRegistry pre-loaded with the supplied tools. */
export function createRegistry(tools: Tool[] = []): ToolRegistry {
  return new ToolRegistry().registerAll(tools);
}
