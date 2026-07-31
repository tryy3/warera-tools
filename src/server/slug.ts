import { HttpError } from "./errors";

export function slugifyCountryId(name: string): string {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (!slug) {
    throw new HttpError(400, "invalid_body", "Country name must yield a non-empty id");
  }
  return slug;
}

export function parseTaxRate(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 1) {
    throw new HttpError(400, "invalid_body", "taxRate must be a number between 0 and 1");
  }
  return value;
}
