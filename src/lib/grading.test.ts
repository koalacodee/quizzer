import { describe, expect, it } from "vitest";
import { formatPoints, gradeAttempt, gradeQuestion, percent } from "./grading";

const single = {
  id: "q1",
  points: 2,
  choices: [
    { id: "a", isCorrect: true },
    { id: "b", isCorrect: false },
  ],
};
const multiple = {
  id: "q2",
  points: 3,
  choices: [
    { id: "a", isCorrect: true },
    { id: "b", isCorrect: true },
    { id: "c", isCorrect: false },
  ],
};

describe("gradeQuestion", () => {
  it("awards full points for the exact correct set", () => {
    expect(gradeQuestion(single, ["a"])).toMatchObject({ earned: 2, max: 2, correct: true });
    expect(gradeQuestion(multiple, ["b", "a"])).toMatchObject({ earned: 3, correct: true });
  });

  it("gives nothing for wrong, partial or blank answers", () => {
    expect(gradeQuestion(single, ["b"]).earned).toBe(0);
    expect(gradeQuestion(multiple, ["a"]).earned).toBe(0);
    expect(gradeQuestion(multiple, ["a", "b", "c"]).earned).toBe(0);
    expect(gradeQuestion(single).earned).toBe(0);
  });
});

describe("gradeAttempt", () => {
  it("sums earned and max points", () => {
    const { score, maxScore } = gradeAttempt([single, multiple], { q1: ["a"], q2: ["a"] });
    expect(score).toBe(2);
    expect(maxScore).toBe(5);
  });
});

describe("helpers", () => {
  it("percent rounds and handles zero max", () => {
    expect(percent(1, 3)).toBe(33);
    expect(percent(1, 0)).toBe(0);
  });

  it("formatPoints trims trailing zeros", () => {
    expect(formatPoints(2)).toBe("2");
    expect(formatPoints(1.5)).toBe("1.5");
    expect(formatPoints(0.25)).toBe("0.25");
  });
});
