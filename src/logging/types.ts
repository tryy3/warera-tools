export type LogFn = (...args: unknown[]) => void;

export type Logger = {
  silly: LogFn;
  trace: LogFn;
  debug: LogFn;
  info: LogFn;
  warn: LogFn;
  error: LogFn;
  fatal: LogFn;
  child: (opts?: { name?: string; bindings?: Record<string, unknown> }) => Logger;
  /** Present on server loggers; used in tests / shutdown. */
  flush?: () => Promise<void>;
};
