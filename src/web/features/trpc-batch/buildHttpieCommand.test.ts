import { describe, expect, it } from "vitest";
import { buildHttpieCommand } from "./buildHttpieCommand";

describe("buildHttpieCommand", () => {
  it("builds POST to api2 with env API key and scalar form fields", () => {
    const cmd = buildHttpieCommand({
      procedure: "work.getStatsByCompany",
      input: {
        companyId: "6a29dc47f157d40728bcd38c",
        days: 14,
        workerId: "69df82906aef50deba9f7ebc",
      },
    });
    expect(cmd).toBe(
      "https POST api2.warera.io/trpc/work.getStatsByCompany X-API-Key:$WARERA_API_KEY companyId=6a29dc47f157d40728bcd38c days:=14 workerId=69df82906aef50deba9f7ebc",
    );
  });

  it("flattens nested objects with bracket keys", () => {
    const cmd = buildHttpieCommand({
      procedure: "announcement.getPaginated",
      input: { owner: { type: "mu", id: "abc" }, limit: 5 },
    });
    expect(cmd).toContain("owner[type]=mu");
    expect(cmd).toContain("owner[id]=abc");
    expect(cmd).toContain("limit:=5");
    expect(cmd).toContain("api2.warera.io/trpc/announcement.getPaginated");
    expect(cmd).not.toContain("api5");
  });

  it("encodes string arrays with []=", () => {
    const cmd = buildHttpieCommand({
      procedure: "x.y",
      input: { tags: ["a", "b"] },
    });
    expect(cmd).toContain("tags[]=a");
    expect(cmd).toContain("tags[]=b");
  });

  it("omits form fields when input is null", () => {
    const cmd = buildHttpieCommand({ procedure: "mu.getById", input: null });
    expect(cmd).toBe(
      "https POST api2.warera.io/trpc/mu.getById X-API-Key:$WARERA_API_KEY",
    );
  });

  it("skips null fields", () => {
    const cmd = buildHttpieCommand({
      procedure: "x.y",
      input: { a: "keep", b: null },
    });
    expect(cmd).toContain("a=keep");
    expect(cmd).not.toContain("b=");
  });
});
