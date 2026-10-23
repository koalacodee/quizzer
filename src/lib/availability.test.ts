import { describe, expect, it } from "vitest";
import { canRevealAnswers, quizStatus } from "./availability";

const now = new Date("2026-01-10T12:00:00Z");
const past = new Date("2026-01-01T00:00:00Z");
const future = new Date("2026-02-01T00:00:00Z");

describe("quizStatus", () => {
  it("is open without a window", () => {
    expect(quizStatus({ opensAt: null, closesAt: null }, now)).toBe("open");
  });
  it("respects opensAt and closesAt", () => {
    expect(quizStatus({ opensAt: future, closesAt: null }, now)).toBe("upcoming");
    expect(quizStatus({ opensAt: past, closesAt: future }, now)).toBe("open");
    expect(quizStatus({ opensAt: null, closesAt: past }, now)).toBe("closed");
  });
});

describe("canRevealAnswers", () => {
  const q = (answerReveal: "immediately" | "after_close" | "never", closesAt: Date | null) => ({
    opensAt: null,
    closesAt,
    answerReveal,
  });
  it("follows the reveal mode", () => {
    expect(canRevealAnswers(q("immediately", null), now)).toBe(true);
    expect(canRevealAnswers(q("never", past), now)).toBe(false);
    expect(canRevealAnswers(q("after_close", future), now)).toBe(false);
    expect(canRevealAnswers(q("after_close", past), now)).toBe(true);
    expect(canRevealAnswers(q("after_close", null), now)).toBe(false);
  });
  it("always reveals to admins", () => {
    expect(canRevealAnswers(q("never", null), now, true)).toBe(true);
  });
});
