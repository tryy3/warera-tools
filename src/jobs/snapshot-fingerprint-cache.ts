export type FingerprintCache = {
  get(key: string): string | undefined;
  set(key: string, fingerprint: string): void;
  setMany(entries: Iterable<readonly [string, string]>): void;
  ensureWarmed(
    keys: readonly string[],
    loader: (missingKeys: string[]) => Promise<Map<string, string>>,
  ): Promise<void>;
  clear(): void;
};

export function createFingerprintCache(): FingerprintCache {
  const map = new Map<string, string>();
  return {
    get: (key) => map.get(key),
    set: (key, fingerprint) => {
      map.set(key, fingerprint);
    },
    setMany: (entries) => {
      for (const [key, fingerprint] of entries) map.set(key, fingerprint);
    },
    async ensureWarmed(keys, loader) {
      const missing = [...new Set(keys.filter((k) => k.length > 0 && !map.has(k)))];
      if (missing.length === 0) return;
      const loaded = await loader(missing);
      for (const [key, fingerprint] of loaded) map.set(key, fingerprint);
      // Keys with no DB row stay absent → first write treats them as new (insert).
    },
    clear: () => map.clear(),
  };
}
