import { describe, expect, it } from "vitest";
import { parseBatchCapture } from "./parseBatchCapture";

const SAMPLE_URL =
  "https://api5.warera.io/trpc/announcement.getPaginated,muHelp.getManyPaginated,badgeCollection.getByMuId?batch=1";

const SAMPLE_PAYLOAD = JSON.stringify({
  "0": { ownerType: "mu", ownerId: "abc", limit: 5 },
  "1": { limit: 5, muId: "abc" },
  // sparse: no "2"
});

const SAMPLE_RESPONSE = JSON.stringify([
  { result: { data: { items: [] } } },
  { result: { data: { items: [{ _id: "1" }] } } },
  { result: { data: null } },
]);

describe("parseBatchCapture", () => {
  it("joins URL order with sparse payload keys and dense response array", () => {
    const result = parseBatchCapture(SAMPLE_URL, SAMPLE_PAYLOAD, SAMPLE_RESPONSE);
    expect(result.urlError).toBeNull();
    expect(result.payloadError).toBeNull();
    expect(result.responseError).toBeNull();
    expect(result.rows).toHaveLength(3);
    expect(result.rows[0]).toEqual({
      index: 0,
      procedure: "announcement.getPaginated",
      input: { ownerType: "mu", ownerId: "abc", limit: 5 },
      response: { result: { data: { items: [] } } },
    });
    expect(result.rows[1]?.procedure).toBe("muHelp.getManyPaginated");
    expect(result.rows[2]).toEqual({
      index: 2,
      procedure: "badgeCollection.getByMuId",
      input: null,
      response: { result: { data: null } },
    });
  });

  it("returns urlError and empty rows when /trpc/ is missing", () => {
    const result = parseBatchCapture("https://example.com/foo", "{}", "[]");
    expect(result.urlError).toMatch(/trpc/i);
    expect(result.rows).toEqual([]);
  });

  it("lists procedures when payload JSON is invalid", () => {
    const result = parseBatchCapture(SAMPLE_URL, "{not-json", SAMPLE_RESPONSE);
    expect(result.payloadError).toBeTruthy();
    expect(result.rows).toHaveLength(3);
    expect(result.rows.every((r) => r.input === null)).toBe(true);
    expect(result.rows[0]?.response).toEqual({ result: { data: { items: [] } } });
  });

  it("warns when response length differs from procedure count", () => {
    const result = parseBatchCapture(SAMPLE_URL, SAMPLE_PAYLOAD, "[{},{}]");
    expect(result.warnings.some((w) => /length/i.test(w))).toBe(true);
    expect(result.rows[2]?.response).toBeNull();
  });

  it("allows empty response text (optional)", () => {
    const result = parseBatchCapture(SAMPLE_URL, SAMPLE_PAYLOAD, "");
    expect(result.responseError).toBeNull();
    expect(result.rows).toHaveLength(3);
    expect(result.rows.every((r) => r.response === null)).toBe(true);
  });
});
