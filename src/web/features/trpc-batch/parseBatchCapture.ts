import type { BatchRow, ParseBatchResult } from "./types";

function extractProcedures(urlText: string): { procedures: string[]; error: string | null } {
  const trimmed = urlText.trim();
  if (!trimmed) {
    return { procedures: [], error: "URL is required" };
  }
  let pathname: string;
  try {
    const u = new URL(trimmed);
    pathname = u.pathname;
  } catch {
    // Allow path-only paste
    pathname = trimmed.split("?")[0] ?? trimmed;
  }
  const marker = "/trpc/";
  const idx = pathname.indexOf(marker);
  if (idx < 0) {
    return { procedures: [], error: "URL must contain /trpc/" };
  }
  const after = pathname.slice(idx + marker.length);
  const procedures = after
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);
  if (procedures.length === 0) {
    return { procedures: [], error: "No procedures found after /trpc/" };
  }
  return { procedures, error: null };
}

function parseJsonObject(text: string): {
  value: Record<string, unknown> | null;
  error: string | null;
} {
  const trimmed = text.trim();
  if (!trimmed) {
    return { value: {}, error: null };
  }
  try {
    const parsed: unknown = JSON.parse(trimmed);
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
      return { value: null, error: "Payload must be a JSON object" };
    }
    return { value: parsed as Record<string, unknown>, error: null };
  } catch (err) {
    return { value: null, error: err instanceof Error ? err.message : "Invalid payload JSON" };
  }
}

function parseJsonArray(text: string): {
  value: unknown[] | null;
  error: string | null;
  empty: boolean;
} {
  const trimmed = text.trim();
  if (!trimmed) {
    return { value: null, error: null, empty: true };
  }
  try {
    const parsed: unknown = JSON.parse(trimmed);
    if (!Array.isArray(parsed)) {
      return { value: null, error: "Response must be a JSON array", empty: false };
    }
    return { value: parsed, error: null, empty: false };
  } catch (err) {
    return {
      value: null,
      error: err instanceof Error ? err.message : "Invalid response JSON",
      empty: false,
    };
  }
}

export function parseBatchCapture(
  urlText: string,
  payloadText: string,
  responseText: string,
): ParseBatchResult {
  const warnings: string[] = [];
  const { procedures, error: urlError } = extractProcedures(urlText);
  if (urlError || procedures.length === 0) {
    return {
      rows: [],
      urlError: urlError ?? "URL is required",
      payloadError: null,
      responseError: null,
      warnings,
    };
  }

  const payload = parseJsonObject(payloadText);
  const response = parseJsonArray(responseText);

  if (response.value && response.value.length !== procedures.length) {
    warnings.push(
      `Response length (${response.value.length}) differs from procedure count (${procedures.length})`,
    );
  }

  const rows: BatchRow[] = procedures.map((procedure, index) => {
    const input =
      payload.value && Object.prototype.hasOwnProperty.call(payload.value, String(index))
        ? payload.value[String(index)]
        : null;
    const responseItem =
      response.value && index < response.value.length ? response.value[index] : null;
    return { index, procedure, input, response: responseItem };
  });

  return {
    rows,
    urlError: null,
    payloadError: payload.error,
    responseError: response.error,
    warnings,
  };
}
