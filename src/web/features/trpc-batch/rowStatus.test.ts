import { describe, expect, it } from "vite-plus/test";
import { rowStatus } from "./rowStatus";

describe("rowStatus", () => {
  it("returns error when response has error key", () => {
    expect(
      rowStatus({
        index: 0,
        procedure: "x.y",
        input: {},
        response: { error: { message: "nope" } },
      }),
    ).toBe("error");
  });

  it("returns no input when input is null", () => {
    expect(
      rowStatus({
        index: 0,
        procedure: "x.y",
        input: null,
        response: { result: { data: 1 } },
      }),
    ).toBe("no input");
  });

  it("returns no response when response is null", () => {
    expect(
      rowStatus({
        index: 0,
        procedure: "x.y",
        input: { a: 1 },
        response: null,
      }),
    ).toBe("no response");
  });

  it("returns ok when input and successful response exist", () => {
    expect(
      rowStatus({
        index: 0,
        procedure: "x.y",
        input: { a: 1 },
        response: { result: { data: null } },
      }),
    ).toBe("ok");
  });
});
