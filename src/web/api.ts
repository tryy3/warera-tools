import { webLogger } from "./logger";

export class ApiError extends Error {
  status: number;
  code: string | undefined;

  constructor(status: number, message: string, code?: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  if (!headers.has("content-type")) {
    headers.set("content-type", "application/json");
  }
  const started = performance.now();
  try {
    const res = await fetch(path, { ...init, headers });
    const durationMs = Math.round(performance.now() - started);
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      webLogger.warn({ path, status: res.status, durationMs }, "api request");
      throw new ApiError(
        res.status,
        body?.error?.message ?? res.statusText,
        typeof body?.error?.code === "string" ? body.error.code : undefined,
      );
    }
    webLogger.debug({ path, status: res.status, durationMs }, "api request");
    return res.json() as Promise<T>;
  } catch (err) {
    if (err instanceof ApiError) throw err;
    const durationMs = Math.round(performance.now() - started);
    webLogger.error({ path, durationMs }, "api request", err);
    throw err;
  }
}
