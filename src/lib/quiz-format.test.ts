import { describe, expect, it } from "vitest";
import { parseQuizImport } from "./quiz-format";

const base = { title: "T", questions: [{ text: "Q", choices: [{ text: "a", correct: true }, { text: "b" }] }] };

describe("parseQuizImport", () => {
  it("accepts the canonical shape with defaults", () => {
    const res = parseQuizImport(JSON.stringify(base));
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.quizzes[0].questions[0]).toMatchObject({ type: "single", points: 1, explanation: "" });
  });

  it("accepts the short form: aliases, string choices and answer indices", () => {
    const res = parseQuizImport(
      JSON.stringify({ title: "T", questions: [{ question: "Q", grade: 2, choices: ["x", "y", "z"], answer: [0, 2] }] }),
    );
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const q = res.quizzes[0].questions[0];
    expect(q.text).toBe("Q");
    expect(q.points).toBe(2);
    expect(q.type).toBe("multiple");
    expect(q.choices.map((c) => c.correct)).toEqual([true, false, true]);
  });

  it("accepts arrays and export files, and strips ids", () => {
    const withIds = { ...base, id: "x", questions: [{ ...base.questions[0], id: "y" }] };
    const arr = parseQuizImport(JSON.stringify([base, base]));
    const exp = parseQuizImport(JSON.stringify({ version: 1, quizzes: [withIds] }));
    expect(arr.ok && arr.quizzes.length).toBe(2);
    expect(exp.ok && exp.quizzes[0].questions[0].id).toBeUndefined();
  });

  it("reports readable errors", () => {
    expect(parseQuizImport("{")).toMatchObject({ ok: false });
    const res = parseQuizImport(JSON.stringify({ title: "T", questions: [{ text: "Q", choices: ["a", "b"] }] }));
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.errors[0]).toContain("Question #1");
    expect(res.errors[0]).toContain("Mark at least one correct choice");
  });

  it("rejects an empty list", () => {
    expect(parseQuizImport("[]")).toEqual({ ok: false, errors: ["No quizzes found in the file"] });
  });
});
