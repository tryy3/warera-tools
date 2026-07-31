import { HttpError } from "./errors";

export function parseIsoCode(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") {
    throw new HttpError(400, "invalid_body", "isoCode must be a 2-letter ISO country code or null");
  }
  const trimmed = value.trim();
  if (trimmed === "") return null;
  const upper = trimmed.toUpperCase();
  if (!/^[A-Z]{2}$/.test(upper)) {
    throw new HttpError(400, "invalid_body", "isoCode must be a 2-letter ISO country code or null");
  }
  return upper;
}
