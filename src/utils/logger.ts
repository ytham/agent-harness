/**
 * Structured logger for harness runs.
 *
 * Respects the logging.level and logging.pretty config options.
 * "silent" suppresses all output.
 * "info"   emits high-level step summaries.
 * "debug"  emits full message contents.
 */

export type LogLevel = "silent" | "info" | "debug";

const LEVELS: Record<LogLevel, number> = {
  silent: 0,
  info: 1,
  debug: 2,
};

export interface LoggerOptions {
  level?: LogLevel;
  pretty?: boolean;
  prefix?: string;
}

export class Logger {
  private level: number;
  private pretty: boolean;
  private prefix: string;

  constructor(options: LoggerOptions = {}) {
    this.level = LEVELS[options.level ?? "info"];
    this.pretty = options.pretty ?? true;
    this.prefix = options.prefix ? `[${options.prefix}] ` : "";
  }

  info(message: string, data?: unknown): void {
    if (this.level >= LEVELS.info) {
      this.emit("INFO", message, data);
    }
  }

  debug(message: string, data?: unknown): void {
    if (this.level >= LEVELS.debug) {
      this.emit("DEBUG", message, data);
    }
  }

  error(message: string, data?: unknown): void {
    if (this.level >= LEVELS.info) {
      this.emit("ERROR", message, data, true);
    }
  }

  /** Emit a step log (thought / action / observation / etc.) */
  step(
    type: string,
    index: number,
    content: string,
    metadata?: Record<string, unknown>,
  ): void {
    if (this.level < LEVELS.info) return;

    if (this.pretty) {
      const label = stepLabel(type);
      const truncated =
        content.length > 300 ? content.slice(0, 300) + "…" : content;
      const metaStr =
        metadata && Object.keys(metadata).length > 0
          ? `  ${JSON.stringify(metadata)}`
          : "";
      process.stdout.write(
        `${this.prefix}${label} [${index}] ${truncated}${metaStr}\n`,
      );
    } else {
      process.stdout.write(
        JSON.stringify({ level: "STEP", type, index, content, metadata }) + "\n",
      );
    }
  }

  private emit(
    level: string,
    message: string,
    data?: unknown,
    isError = false,
  ): void {
    const stream = isError ? process.stderr : process.stdout;
    if (this.pretty) {
      const dataStr = data !== undefined ? `  ${JSON.stringify(data)}` : "";
      stream.write(`${this.prefix}${level} ${message}${dataStr}\n`);
    } else {
      stream.write(JSON.stringify({ level, message, data }) + "\n");
    }
  }
}

/** Singleton factory keyed by prefix — avoids creating duplicate loggers. */
const loggers = new Map<string, Logger>();

export function getLogger(options: LoggerOptions = {}): Logger {
  const key = JSON.stringify(options);
  if (!loggers.has(key)) {
    loggers.set(key, new Logger(options));
  }
  return loggers.get(key)!;
}

function stepLabel(type: string): string {
  const labels: Record<string, string> = {
    thought: "🤔 THOUGHT",
    action: "⚡ ACTION ",
    observation: "👁  OBS   ",
    reflection: "🔁 REFLECT",
    plan: "📋 PLAN   ",
    critique: "✏️  CRITIC ",
    debate: "💬 DEBATE ",
  };
  return labels[type] ?? `   ${type.toUpperCase().padEnd(8)}`;
}
