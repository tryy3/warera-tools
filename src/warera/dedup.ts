export function dedupKey(parts: {
  method: string;
  procedure: string;
  input: unknown;
  authStyle: string;
  baseUrl: string;
}): string {
  return JSON.stringify([
    parts.method,
    parts.procedure,
    parts.input,
    parts.authStyle,
    parts.baseUrl,
  ]);
}

export function createInFlightDedup(): {
  join<T>(key: string, start: () => Promise<T>): { joined: boolean; promise: Promise<T> };
} {
  const inFlight = new Map<string, Promise<unknown>>();

  return {
    join<T>(key: string, start: () => Promise<T>): { joined: boolean; promise: Promise<T> } {
      const existing = inFlight.get(key);
      if (existing) {
        return { joined: true, promise: existing as Promise<T> };
      }

      const promise = start().finally(() => {
        inFlight.delete(key);
      });
      inFlight.set(key, promise);
      return { joined: false, promise };
    },
  };
}
