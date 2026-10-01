import type { AttemptAnswers } from "@/db/schema";

type GradableQuestion = {
  id: string;
  points: number;
  choices: { id: string; isCorrect: boolean }[];
};

export type QuestionResult = { questionId: string; earned: number; max: number; correct: boolean };

/** All-or-nothing: the selected set must match the correct set exactly. */
export function gradeQuestion(q: GradableQuestion, selected: string[] = []): QuestionResult {
  const correctIds = new Set(q.choices.filter((c) => c.isCorrect).map((c) => c.id));
  const picked = new Set(selected);
  const correct = picked.size === correctIds.size && [...picked].every((id) => correctIds.has(id));
  return { questionId: q.id, earned: correct ? q.points : 0, max: q.points, correct };
}

export function gradeAttempt(questions: GradableQuestion[], answers: AttemptAnswers) {
  const results = questions.map((q) => gradeQuestion(q, answers[q.id]));
  const score = results.reduce((s, r) => s + r.earned, 0);
  const maxScore = results.reduce((s, r) => s + r.max, 0);
  return { results, score, maxScore };
}

export function percent(score: number, max: number) {
  return max > 0 ? Math.round((score / max) * 100) : 0;
}

export function formatPoints(n: number) {
  return Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/0+$/, "");
}
