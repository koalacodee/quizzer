import { describe, expect, it } from "vitest";
import { parseQuizImport } from "./quiz-format";

const base = { title: "T", questions: [{ text: "Q", choices: [{ text: "a", correct: true }, { text: "b" }] }] };
const parse = (data: unknown) => parseQuizImport(JSON.stringify(data));

describe("parseQuizImport", () => {
  it("accepts the canonical shape with defaults", () => {
    const res = parse(base);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.quizzes[0]).toMatchObject({
      answerReveal: "immediately",
      opensAt: null,
      maxAttempts: null,
      scoring: "all_or_nothing",
      negativeMarking: 0,
    });
    expect(res.quizzes[0].questions[0]).toMatchObject({ type: "single", points: 1, explanation: "" });
  });

  it("accepts the short form: aliases, string choices and answer indices", () => {
    const res = parse({ title: "T", questions: [{ question: "Q", grade: 2, choices: ["x", "y", "z"], answer: [0, 2] }] });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const q = res.quizzes[0].questions[0];
    expect(q.text).toBe("Q");
    expect(q.points).toBe(2);
    expect(q.type).toBe("multiple");
    expect(q.choices.map((c) => c.correct)).toEqual([true, false, true]);
  });

  it("accepts arrays and export files, and strips ids", () => {
    const withIds = { ...base, id: "x", shortCode: "abc", questions: [{ ...base.questions[0], id: "y" }] };
    const arr = parse([base, base]);
    const exp = parse({ version: 2, quizzes: [withIds] });
    expect(arr.ok && arr.quizzes.length).toBe(2);
    expect(exp.ok && exp.quizzes[0].questions[0].id).toBeUndefined();
  });

  it("maps version 1 showAnswers to answerReveal", () => {
    const res = parse({ ...base, showAnswers: false });
    expect(res.ok && res.quizzes[0].answerReveal).toBe("never");
  });

  it("imports numeric questions", () => {
    const res = parse({ title: "T", questions: [{ question: "π?", answer: 3.14, tolerance: 0.01 }] });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.quizzes[0].questions[0]).toMatchObject({
      type: "numeric",
      numericAnswer: 3.14,
      numericTolerance: 0.01,
      choices: [],
    });
    expect(parse({ title: "T", questions: [{ type: "numeric", text: "Q" }] }).ok).toBe(false);
  });

  it("imports true/false questions", () => {
    const res = parse({ title: "T", questions: [{ text: "Sky is blue", answer: true }, { type: "true_false", text: "No", answer: false }] });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const [a, b] = res.quizzes[0].questions;
    expect(a.type).toBe("true_false");
    expect(a.choices).toEqual([{ text: "True", correct: true }, { text: "False", correct: false }]);
    expect(b.choices.map((c) => c.correct)).toEqual([false, true]);
  });

  it("parses dates and validates the window, pool and reveal mode", () => {
    const ok = parse({ ...base, opensAt: "2026-01-01T09:00:00Z", closesAt: "2026-01-02T09:00:00Z", answerReveal: "after_close" });
    expect(ok.ok && ok.quizzes[0].closesAt).toEqual(new Date("2026-01-02T09:00:00Z"));

    const backwards = parse({ ...base, opensAt: "2026-01-02T00:00:00Z", closesAt: "2026-01-01T00:00:00Z" });
    expect(!backwards.ok && backwards.errors[0]).toContain("closing time must be after");
    const pool = parse({ ...base, questionPoolSize: 5 });
    expect(!pool.ok && pool.errors[0]).toContain("Pool size");
    const reveal = parse({ ...base, answerReveal: "after_close" });
    expect(!reveal.ok && reveal.errors[0]).toContain("closing time");
  });

  it("reports readable errors", () => {
    expect(parseQuizImport("{")).toMatchObject({ ok: false });
    const res = parse({ title: "T", questions: [{ text: "Q", choices: ["a", "b"] }] });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.errors[0]).toContain("Question #1");
    expect(res.errors[0]).toContain("Mark at least one correct choice");
  });

  it("rejects an empty list", () => {
    expect(parseQuizImport("[]")).toEqual({ ok: false, errors: ["No quizzes found in the file"] });
  });
});
