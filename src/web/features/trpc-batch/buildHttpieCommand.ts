import type { BatchRow } from "./types";

function shellQuoteIfNeeded(value: string): string {
  if (/^[A-Za-z0-9_./:@%+-]+$/.test(value)) {
    return value;
  }
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

function appendFormArgs(out: string[], path: string, value: unknown): void {
  if (value === null || value === undefined) {
    return;
  }
  if (typeof value === "string") {
    out.push(`${path}=${shellQuoteIfNeeded(value)}`);
    return;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    out.push(`${path}:=${String(value)}`);
    return;
  }
  if (Array.isArray(value)) {
    if (value.every((v) => v === null || ["string", "number", "boolean"].includes(typeof v))) {
      for (const item of value) {
        if (item === null) continue;
        if (typeof item === "string") {
          out.push(`${path}[]=${shellQuoteIfNeeded(item)}`);
        } else {
          out.push(`${path}[]:=${String(item)}`);
        }
      }
      return;
    }
    out.push(`${path}:=${shellQuoteIfNeeded(JSON.stringify(value))}`);
    return;
  }
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>);
    if (entries.length === 0) {
      out.push(`${path}:={}`);
      return;
    }
    for (const [key, child] of entries) {
      appendFormArgs(out, `${path}[${key}]`, child);
    }
    return;
  }
  out.push(`${path}:=${shellQuoteIfNeeded(JSON.stringify(value))}`);
}

export function buildHttpieCommand(row: Pick<BatchRow, "procedure" | "input">): string {
  const parts = [
    "https",
    "POST",
    `api2.warera.io/trpc/${row.procedure}`,
    "X-API-Key:$WARERA_API_KEY",
  ];
  if (row.input !== null && typeof row.input === "object" && !Array.isArray(row.input)) {
    const args: string[] = [];
    for (const [key, value] of Object.entries(row.input as Record<string, unknown>)) {
      appendFormArgs(args, key, value);
    }
    parts.push(...args);
  } else if (row.input !== null && row.input !== undefined) {
    // Non-object input: single JSON body field is awkward for HTTPie form style;
    // emit as raw JSON arg on a synthetic key only if needed — prefer empty form.
    parts.push(`input:=${shellQuoteIfNeeded(JSON.stringify(row.input))}`);
  }
  return parts.join(" ");
}
