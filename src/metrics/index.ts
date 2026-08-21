import type { MetricAttrs, MetricsBackend } from "./types";

export type { MetricAttrs, MetricsBackend } from "./types";

let backend: MetricsBackend | null = null;

export function setMetricsBackend(next: MetricsBackend | null): void {
  backend = next;
}

export function resetMetricsForTests(): void {
  backend = null;
}

function emit(fn: () => void): void {
  try {
    fn();
  } catch {
    // fail-open
  }
}

export function count(name: string, value = 1, attrs?: MetricAttrs): void {
  emit(() => backend?.count(name, value, attrs));
}

export function distribution(
  name: string,
  value: number,
  attrs?: MetricAttrs,
  unit?: string,
): void {
  emit(() => backend?.distribution(name, value, attrs, unit));
}

export function gauge(name: string, value: number, attrs?: MetricAttrs): void {
  emit(() => backend?.gauge(name, value, attrs));
}
