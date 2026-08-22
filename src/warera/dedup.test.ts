import { describe, expect, it } from "vite-plus/test";
import { createInFlightDedup, dedupKey } from "./dedup";

describe("dedupKey", () => {
  it("is stable for the same input object values", () => {
    expect(
      dedupKey({
        method: "GET",
        procedure: "user.getUserLite",
        input: { userId: "a" },
        authStyle: "auto",
        baseUrl: "https://api2.warera.io/trpc",
      }),
    ).toBe(
      dedupKey({
        method: "GET",
        procedure: "user.getUserLite",
        input: { userId: "a" },
        authStyle: "auto",
        baseUrl: "https://api2.warera.io/trpc",
      }),
    );
  });
});

describe("createInFlightDedup", () => {
  it("joins a second caller onto the in-flight promise", async () => {
    const dedup = createInFlightDedup();
    let starts = 0;
    const start = () => {
      starts += 1;
      return Promise.resolve("ok");
    };
    const a = dedup.join("k", start);
    const b = dedup.join("k", start);
    expect(a.joined).toBe(false);
    expect(b.joined).toBe(true);
    expect(await a.promise).toBe("ok");
    expect(await b.promise).toBe("ok");
    expect(starts).toBe(1);
  });

  it("starts a new attempt after the first promise settles (including failure)", async () => {
    const dedup = createInFlightDedup();
    const first = dedup.join("k", () => Promise.reject(new Error("nope")));
    await expect(first.promise).rejects.toThrow("nope");
    const second = dedup.join("k", () => Promise.resolve("ok"));
    expect(second.joined).toBe(false);
    expect(await second.promise).toBe("ok");
  });
});
