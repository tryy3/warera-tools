import type { WareraCallClass } from "./call-class";
import type { WareraBatchItem } from "./trpc";

export const WARERA_BATCH_WINDOW_MS = 400;

export type WareraAuthStyle = "auto" | "api-key" | "bearer";

export type BackgroundQueuedRequest = {
  item: WareraBatchItem;
  resolve: (value: unknown) => void;
  reject: (reason: unknown) => void;
  authStyle: WareraAuthStyle;
  baseUrl: string;
  callClass: WareraCallClass;
  fetchInit: RequestInit;
  fetchInitGroupKey: string;
};

export type BackgroundBatchQueueOptions = {
  sleep: (ms: number) => Promise<void>;
  windowMs?: number;
  requestInitGroupKey: (init: RequestInit) => string;
  flushGroup: (group: BackgroundQueuedRequest[]) => Promise<void>;
};

export function createBackgroundBatchQueue(options: BackgroundBatchQueueOptions) {
  const windowMs = options.windowMs ?? WARERA_BATCH_WINDOW_MS;
  let queue: BackgroundQueuedRequest[] = [];
  let timer: Promise<void> | null = null;

  async function flushQueue(): Promise<void> {
    const pending = queue;
    queue = [];
    const groups = new Map<string, BackgroundQueuedRequest[]>();
    for (const queued of pending) {
      const key = JSON.stringify([
        "GET",
        queued.authStyle,
        queued.baseUrl,
        queued.fetchInitGroupKey,
      ]);
      const group = groups.get(key);
      if (group) {
        group.push(queued);
      } else {
        groups.set(key, [queued]);
      }
    }

    await Promise.all([...groups.values()].map((group) => options.flushGroup(group)));
  }

  function enqueue(
    item: WareraBatchItem,
    authStyle: WareraAuthStyle,
    baseUrl: string,
    callClass: WareraCallClass,
    fetchInit: RequestInit,
  ): Promise<unknown> {
    const promise = new Promise<unknown>((resolve, reject) => {
      queue.push({
        item,
        resolve,
        reject,
        authStyle,
        baseUrl,
        callClass,
        fetchInit,
        fetchInitGroupKey: options.requestInitGroupKey(fetchInit),
      });
    });
    if (timer === null) {
      timer = options.sleep(windowMs).then(async () => {
        timer = null;
        await flushQueue();
      });
    }
    return promise;
  }

  return { enqueue };
}
