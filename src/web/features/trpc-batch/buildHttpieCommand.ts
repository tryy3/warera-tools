import type { BatchRow } from "./types";

/** Single-quote a complete shell token (form arg or URL target). */
function shellQuote(token: string): string {
  return `'${token.replace(/'/g, `'\\''`)}'`;
}

function shellQuoteUrlTarget(procedure: string): string {
  const url = `api2.warera.io/trpc/${procedure}`;
  if (/^[A-Za-z0-9_./-]+$/.test(url)) {
    return url;
  }
  return shellQuote(url);
}

function pushFormArg(out: string[], arg: string): void {
  out.push(shellQuote(arg));
}

function appendFormArgs(out: string[], path: string, value: unknown): void {
  if (value === null || value === undefined) {
    return;
  }
  if (typeof value === "string") {
    pushFormArg(out, `${path}=${value}`);
    return;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    pushFormArg(out, `${path}:=${String(value)}`);
    return;
  }
  if (Array.isArray(value)) {
    if (value.length === 0) {
      pushFormArg(out, `${path}:=[]`);
      return;
    }
    if (value.every((v) => v === null || ["string", "number", "boolean"].includes(typeof v))) {
      const nonNull = value.filter((item) => item !== null);
      if (nonNull.length === 0) {
        pushFormArg(out, `${path}:=[]`);
        return;
      }
      for (const item of value) {
        if (item === null) continue;
        if (typeof item === "string") {
          pushFormArg(out, `${path}[]=${item}`);
        } else {
          pushFormArg(out, `${path}[]:=${String(item)}`);
        }
      }
      return;
    }
    pushFormArg(out, `${path}:=${JSON.stringify(value)}`);
    return;
  }
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>);
    if (entries.length === 0) {
      pushFormArg(out, `${path}:={}`);
      return;
    }
    for (const [key, child] of entries) {
      appendFormArgs(out, `${path}[${key}]`, child);
    }
    return;
  }
  pushFormArg(out, `${path}:=${JSON.stringify(value)}`);
}

export function buildHttpieCommand(row: Pick<BatchRow, "procedure" | "input">): string {
  const parts = ["https", "POST", shellQuoteUrlTarget(row.procedure), "X-API-Key:$WARERA_API_KEY"];
  if (row.input !== null && typeof row.input === "object" && !Array.isArray(row.input)) {
    const args: string[] = [];
    for (const [key, value] of Object.entries(row.input as Record<string, unknown>)) {
      appendFormArgs(args, key, value);
    }
    parts.push(...args);
  } else if (row.input !== null && row.input !== undefined) {
    pushFormArg(parts, `input:=${JSON.stringify(row.input)}`);
  }
  return parts.join(" ");
}
