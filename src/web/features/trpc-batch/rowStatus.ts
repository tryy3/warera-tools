import type { BatchRow } from "./types";

export type RowStatus = "ok" | "error" | "no input" | "no response";

export function rowStatus(row: BatchRow): RowStatus {
  if (
    row.response !== null &&
    typeof row.response === "object" &&
    !Array.isArray(row.response) &&
    "error" in row.response
  ) {
    return "error";
  }
  if (row.input === null) return "no input";
  if (row.response === null) return "no response";
  return "ok";
}
