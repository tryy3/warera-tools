import * as Sentry from "@sentry/node";
import type { MetricsBackend } from "./types";

type MetricsApi = {
  count(
    name: string,
    value: number,
    options?: { attributes?: Record<string, string | number | boolean> },
  ): void;
  distribution(
    name: string,
    value: number,
    options?: { attributes?: Record<string, string | number | boolean>; unit?: string },
  ): void;
  gauge(
    name: string,
    value: number,
    options?: { attributes?: Record<string, string | number | boolean> },
  ): void;
};

const sentryMetrics = (Sentry as unknown as { metrics?: MetricsApi }).metrics;

export function createSentryMetricsBackend(): MetricsBackend {
  return {
    count(name, value, attrs) {
      sentryMetrics?.count(name, value, { attributes: attrs });
    },
    distribution(name, value, attrs, unit) {
      sentryMetrics?.distribution(name, value, { attributes: attrs, unit });
    },
    gauge(name, value, attrs) {
      sentryMetrics?.gauge(name, value, { attributes: attrs });
    },
  };
}
