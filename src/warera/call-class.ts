import { getLogContext } from "../logging/context";

export type WareraCallClass = "interactive" | "background";

export function inferCallClass(override?: WareraCallClass): WareraCallClass {
  if (override !== undefined) return override;

  const jobId = getLogContext().job_id;
  if (typeof jobId === "string" && jobId.length > 0) {
    return "background";
  }

  return "interactive";
}
