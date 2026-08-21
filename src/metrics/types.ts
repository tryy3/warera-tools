export type MetricAttrs = Record<string, string | number | boolean>;

export type MetricsBackend = {
  count(name: string, value: number, attrs?: MetricAttrs): void;
  distribution(name: string, value: number, attrs?: MetricAttrs, unit?: string): void;
  gauge(name: string, value: number, attrs?: MetricAttrs): void;
};
