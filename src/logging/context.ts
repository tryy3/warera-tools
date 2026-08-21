import * as Sentry from "@sentry/node";
import type { Logger as TsLogger } from "tslog";
import { isSentryInitialized } from "./sentry";

export type LogContextAttributes = {
  request_id?: string;
  job_id?: string;
  job_run_id?: string | number;
  [key: string]: string | number | boolean | undefined;
};

let rootTs: TsLogger<unknown> | null = null;

export function registerServerTsLogger(log: TsLogger<unknown> | null): void {
  rootTs = log;
}

export function getLogContext(): LogContextAttributes {
  if (!rootTs) return {};
  const ctx = rootTs.getContext() as LogContextAttributes | undefined;
  return ctx ?? {};
}

function cleanAttributes(attrs: LogContextAttributes): Record<string, string | number | boolean> {
  const out: Record<string, string | number | boolean> = {};
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined) continue;
    out[k] = v;
  }
  return out;
}

export async function withLogContext<T>(
  opts: { attributes: LogContextAttributes; spanName: string; spanOp: string },
  fn: () => Promise<T> | T,
): Promise<T> {
  const attributes = cleanAttributes(opts.attributes);

  const run = async (): Promise<T> => {
    if (!isSentryInitialized()) {
      return await fn();
    }
    return await Sentry.startSpan(
      { name: opts.spanName, op: opts.spanOp, attributes },
      async () => {
        const scope = Sentry.getIsolationScope();
        scope.setAttributes(attributes);
        return await fn();
      },
    );
  };

  if (!rootTs) return run();
  return rootTs.runInContext(attributes, () => run());
}
