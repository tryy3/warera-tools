export type BatchRow = {
  index: number;
  procedure: string;
  input: unknown | null;
  response: unknown | null;
};

export type ParseBatchResult = {
  rows: BatchRow[];
  urlError: string | null;
  payloadError: string | null;
  responseError: string | null;
  warnings: string[];
};
