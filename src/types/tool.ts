/**
 * Tool and ToolRegistry types.
 *
 * A Tool is a named, typed callable that an agent can invoke during execution.
 * Host repos define tools and register them with the harness; each technique
 * builds tool-use prompts from the registry automatically.
 */

/** JSON Schema subset used for tool input definitions. */
export interface JSONSchema {
  type: "object";
  properties: Record<
    string,
    {
      type: string;
      description?: string;
      enum?: string[];
      items?: { type: string };
    }
  >;
  required?: string[];
  additionalProperties?: boolean;
}

/** A single tool definition. */
export interface Tool {
  /** Unique name used in LLM tool-call requests. */
  name: string;
  /** Human-readable description shown to the LLM. */
  description: string;
  /** JSON Schema describing the tool's input object. */
  inputSchema: JSONSchema;
  /**
   * Async handler invoked when the agent calls this tool.
   * Must return a string (the tool's output / observation).
   */
  handler: (input: Record<string, unknown>) => Promise<string>;
}

/** Result returned by a tool invocation. */
export interface ToolResult {
  toolName: string;
  input: Record<string, unknown>;
  output: string;
  error?: string;
}
