import { describe, expect, it } from "vitest";
import {
  buildSnapshot,
  formatPoints,
  gradeAttempt,
  gradeQuestion,
  parseNumber,
  percent,
  sanitizeAnswers,
  type GradingOptions,
} from "./grading";

const base = { numericAnswer: null, numericTolerance: 0 };
const single = {
  ...base,
  id: "q1",
  type: "single" as const,
  points: 2,
  choices: [
    { id: "a", isCorrect: true },
    { id: "b", isCorrect: false },
  ],
};
const multiple = {
  ...base,
  id: "q2",
  type: "multiple" as const,
  points: 3,
  choices: [
    { id: "a", isCorrect: true },
    { id: "b", isCorrect: true },
    { id: "c", isCorrect: false },
  ],
};
const trueFalse = { ...single, id: "q3", type: "true_false" as const, points: 1 };
const numeric = { id: "q4", type: "numeric" as const, points: 4, numericAnswer: 3.14, numericTolerance: 0.01, choices: [] };

const partial: GradingOptions = { scoring: "partial", negativeMarking: 0 };
const negative: GradingOptions = { scoring: "all_or_nothing", negativeMarking: 0.25 };

describe("gradeQuestion — all or nothing", () => {
  it("awards full points for the exact correct set", () => {
    expect(gradeQuestion(single, ["a"])).toMatchObject({ earned: 2, max: 2, correct: true, answered: true });
    expect(gradeQuestion(multiple, ["b", "a"])).toMatchObject({ earned: 3, correct: true });
    expect(gradeQuestion(trueFalse, ["a"])).toMatchObject({ earned: 1, correct: true });
  });

  it("gives nothing for wrong, partial or blank answers", () => {
    expect(gradeQuestion(single, ["b"]).earned).toBe(0);
    expect(gradeQuestion(multiple, ["a"]).earned).toBe(0);
    expect(gradeQuestion(multiple, ["a", "b", "c"]).earned).toBe(0);
    expect(gradeQuestion(single)).toMatchObject({ earned: 0, answered: false });
  });
});

describe("gradeQuestion — partial credit", () => {
  it("scores (right − wrong) / correct, floored at 0", () => {
    expect(gradeQuestion(multiple, ["a"], partial)).toMatchObject({ earned: 1.5, correct: false });
    expect(gradeQuestion(multiple, ["a", "b"], partial)).toMatchObject({ earned: 3, correct: true });
    expect(gradeQuestion(multiple, ["a", "c"], partial).earned).toBe(0);
    expect(gradeQuestion(multiple, ["c"], partial).earned).toBe(0);
  });

  it("does not change single-answer questions", () => {
    expect(gradeQuestion(single, ["b"], partial).earned).toBe(0);
  });
});

describe("gradeQuestion — negative marking", () => {
  it("deducts a fraction for wrong answers but not for blanks", () => {
    expect(gradeQuestion(single, ["b"], negative).earned).toBe(-0.5);
    expect(gradeQuestion(single, [], negative).earned).toBe(0);
    expect(gradeQuestion(numeric, ["2"], negative).earned).toBe(-1);
  });

  it("only applies to partial scoring when nothing was earned", () => {
    const opts: GradingOptions = { scoring: "partial", negativeMarking: 0.5 };
    expect(gradeQuestion(multiple, ["a"], opts).earned).toBe(1.5);
    expect(gradeQuestion(multiple, ["c"], opts).earned).toBe(-1.5);
  });
});

describe("gradeQuestion — numeric", () => {
  it("accepts answers within the tolerance", () => {
    expect(gradeQuestion(numeric, ["3.14"]).correct).toBe(true);
    expect(gradeQuestion(numeric, ["3.15"]).correct).toBe(true);
    expect(gradeQuestion(numeric, ["3.13"]).correct).toBe(true);
    expect(gradeQuestion(numeric, ["3.16"]).correct).toBe(false);
  });

  it("handles exact answers, decimal commas and junk", () => {
    const exact = { ...numeric, numericAnswer: 0.3, numericTolerance: 0 };
    expect(gradeQuestion(exact, [String(0.1 + 0.2)]).correct).toBe(true);
    expect(gradeQuestion(numeric, ["3,14"]).correct).toBe(true);
    expect(gradeQuestion(numeric, ["pi"])).toMatchObject({ earned: 0, answered: false });
  });
});

describe("gradeAttempt", () => {
  it("sums earned and max points", () => {
    const { score, maxScore } = gradeAttempt([single, multiple], { q1: ["a"], q2: ["a"] });
    expect(score).toBe(2);
    expect(maxScore).toBe(5);
  });

  it("never goes below zero", () => {
    expect(gradeAttempt([single, trueFalse], { q1: ["b"], q3: ["b"] }, { ...negative, negativeMarking: 1 }).score).toBe(0);
  });
});

describe("buildSnapshot", () => {
  const withText = {
    ...multiple,
    text: "Pick",
    explanation: "Because",
    choices: multiple.choices.map((c) => ({ ...c, text: c.id.toUpperCase() })),
  };

  it("freezes question content, selections and grades in the order shown", () => {
    const { results, score } = buildSnapshot([withText], { q2: ["c"] }, undefined, { q2: ["c", "a", "b"] });
    expect(score).toBe(0);
    expect(results[0]).toMatchObject({ questionId: "q2", text: "Pick", selected: ["c"], earned: 0, correct: false });
    expect(results[0].choices.map((c) => c.id)).toEqual(["c", "a", "b"]);
  });
});

describe("sanitizeAnswers", () => {
  it("keeps only valid choices and one parsable number", () => {
    expect(
      sanitizeAnswers([single, multiple, numeric], {
        q1: ["b", "a"],
        q2: ["a", "zzz", "a"],
        q4: [" 2,5 "],
        other: ["a"],
      }),
    ).toEqual({ q1: ["b"], q2: ["a"], q4: ["2.5"] });
    expect(sanitizeAnswers([numeric], { q4: ["nope"] })).toEqual({});
  });
});

describe("helpers", () => {
  it("parseNumber", () => {
    expect(parseNumber("1e3")).toBe(1000);
    expect(parseNumber("-2,5")).toBe(-2.5);
    expect(parseNumber("1,000.5")).toBeNull();
    expect(parseNumber("")).toBeNull();
    expect(parseNumber(undefined)).toBeNull();
  });

  it("percent rounds and handles zero max", () => {
    expect(percent(1, 3)).toBe(33);
    expect(percent(1, 0)).toBe(0);
  });

  it("formatPoints trims trailing zeros", () => {
    expect(formatPoints(2)).toBe("2");
    expect(formatPoints(1.5)).toBe("1.5");
    expect(formatPoints(0.25)).toBe("0.25");
    expect(formatPoints(-0.5)).toBe("-0.5");
  });
});
