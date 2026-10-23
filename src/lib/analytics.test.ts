import { describe, expect, it } from "vitest";
import type { SnapshotQuestion } from "@/db/schema";
import { analyzeQuiz } from "./analytics";

const q1 = {
  id: "q1",
  type: "single" as const,
  points: 1,
  choices: [
    { id: "a", isCorrect: true },
    { id: "b", isCorrect: false },
    { id: "c", isCorrect: false },
  ],
};
const q2 = { id: "q2", type: "numeric" as const, points: 2, choices: [] };

const entry = (questionId: string, selected: string[], correct: boolean, earned: number): SnapshotQuestion => ({
  questionId,
  type: questionId === "q2" ? "numeric" : "single",
  text: "",
  points: 1,
  explanation: "",
  numericAnswer: null,
  numericTolerance: 0,
  choices: [],
  selected,
  earned,
  correct,
  answered: selected.length > 0,
});

describe("analyzeQuiz", () => {
  it("aggregates correctness, choice picks and numeric answers", () => {
    const [s1, s2] = analyzeQuiz(
      [q1, q2],
      [
        [entry("q1", ["a"], true, 1), entry("q2", ["3"], true, 2)],
        [entry("q1", ["b"], false, 0), entry("q2", ["3"], true, 2)],
        [entry("q1", ["b"], false, 0)],
        [entry("q1", [], false, 0), entry("q2", ["4"], false, 0)],
      ],
    );
    expect(s1).toMatchObject({ asked: 4, answered: 3, correct: 1, correctRate: 25, avgEarned: 0.25, topDistractor: "b" });
    expect(s1.choiceCounts).toEqual({ a: 1, b: 2, c: 0 });
    expect(s2).toMatchObject({ asked: 3, correct: 2, correctRate: 67 });
    expect(s2.numericValues).toEqual([
      { value: "3", count: 2 },
      { value: "4", count: 1 },
    ]);
  });

  it("handles questions nobody was asked", () => {
    const [s] = analyzeQuiz([q1], []);
    expect(s).toMatchObject({ asked: 0, correctRate: null, avgEarned: null, topDistractor: null });
  });
});
