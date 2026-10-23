import { describe, expect, it } from "vitest";
import { formatShareCode, newShortCode, normalizeShareCode } from "./quiz-store";

describe("share codes", () => {
  it("are 10 digits that never start with 0", () => {
    for (let i = 0; i < 1000; i++) expect(newShortCode()).toMatch(/^[1-9]\d{9}$/);
  });

  it("normalize typed codes", () => {
    expect(normalizeShareCode("482 910 3756")).toBe("4829103756");
    expect(normalizeShareCode("482-910-3756")).toBe("4829103756");
    expect(normalizeShareCode("0829103756")).toBeNull();
    expect(normalizeShareCode("48291037")).toBeNull();
    expect(normalizeShareCode("48291037abc")).toBeNull();
  });

  it("format for reading aloud", () => {
    expect(formatShareCode("4829103756")).toBe("482 910 3756");
  });
});
