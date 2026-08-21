import type { MetricAttrs, MetricsBackend } from "./types";

export type MetricEvent = {
  type: "count" | "distribution" | "gauge";
  name: string;
  value: number;
  attrs?: MetricAttrs;
  unit?: string;
};

export function createRecordingBackend(): MetricsBackend & { events: MetricEvent[] } {
  const events: MetricEvent[] = [];
  return {
    events,
    count(name, value, attrs) {
      events.push({ type: "count", name, value, attrs });
    },
    distribution(name, value, attrs, unit) {
      events.push({ type: "distribution", name, value, attrs, unit });
    },
    gauge(name, value, attrs) {
      events.push({ type: "gauge", name, value, attrs });
    },
  };
}
