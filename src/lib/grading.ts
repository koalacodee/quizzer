import type { AttemptAnswers, SnapshotQuestion } from "@/db/schema";
import { orderChoices } from "./layout";

export type QuestionType = SnapshotQuestion["type"];

export type GradingOptions = {
  scoring: "all_or_nothing" | "partial";
  /** Fraction of the question's points deducted for a wrong (not blank) answer. */
  negativeMarking: number;
};

const DEFAULTS: GradingOptions = { scoring: "all_or_nothing", negativeMarking: 0 };

type GradableQuestion = {
  id: string;
  type: QuestionType;
  points: number;
  numericAnswer: number | null;
  numericTolerance: number;
  choices: { id: string; isCorrect: boolean }[];
};

export type QuestionResult = {
  questionId: string;
  earned: number;
  max: number;
  correct: boolean;
  answered: boolean;
};

// `|| 0` turns -0 (zero negative marking) into 0.
const round = (n: number) => Math.round(n * 10_000) / 10_000 || 0;

/** Parses a typed numeric answer; accepts a decimal comma ("2,5"). */
export function parseNumber(raw: string | undefined) {
  if (raw === undefined) return null;
  let s = raw.trim();
  if (!s) return null;
  if (!s.includes(".") && /^-?\d+,\d+$/.test(s)) s = s.replace(",", ".");
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

export function gradeQuestion(
  q: GradableQuestion,
  selected: string[] = [],
  opts: GradingOptions = DEFAULTS,
): QuestionResult {
  const penalty = -q.points * opts.negativeMarking;
  const result = (fraction: number, answered: boolean): QuestionResult => {
    const correct = fraction === 1;
    const earned = fraction > 0 ? q.points * fraction : answered ? penalty : 0;
    return { questionId: q.id, earned: round(earned), max: q.points, correct, answered };
  };

  if (q.type === "numeric") {
    const value = parseNumber(selected[0]);
    if (value === null || q.numericAnswer === null) return result(0, value !== null);
    // Small epsilon so 0.1 + 0.2 style answers match a zero tolerance.
    const ok = Math.abs(value - q.numericAnswer) <= q.numericTolerance + 1e-9;
    return result(ok ? 1 : 0, true);
  }

  const correctIds = new Set(q.choices.filter((c) => c.isCorrect).map((c) => c.id));
  const picked = new Set(selected);
  const answered = picked.size > 0;
  const right = [...picked].filter((id) => correctIds.has(id)).length;
  const wrong = picked.size - right;
  const exact = right === correctIds.size && wrong === 0;

  if (q.type === "multiple" && opts.scoring === "partial" && correctIds.size > 0) {
    return result(Math.max(0, (right - wrong) / correctIds.size), answered);
  }
  return result(exact ? 1 : 0, answered);
}

/** Totals are floored at 0 so negative marking can't produce a negative grade. */
export function gradeAttempt(questions: GradableQuestion[], answers: AttemptAnswers, opts: GradingOptions = DEFAULTS) {
  const results = questions.map((q) => gradeQuestion(q, answers[q.id], opts));
  const score = round(Math.max(0, results.reduce((s, r) => s + r.earned, 0)));
  const maxScore = round(results.reduce((s, r) => s + r.max, 0));
  return { results, score, maxScore };
}

type SnapshotSource = GradableQuestion & {
  text: string;
  explanation: string;
  choices: { id: string; text: string; isCorrect: boolean }[];
};

/** Grades and freezes the questions an attempt was shown, in the order (and choice order) it saw them. */
export function buildSnapshot(
  questions: SnapshotSource[],
  answers: AttemptAnswers,
  opts: GradingOptions = DEFAULTS,
  choiceOrder?: Record<string, string[]>,
) {
  const { results: graded, score, maxScore } = gradeAttempt(questions, answers, opts);
  const results: SnapshotQuestion[] = questions.map((q, i) => ({
    questionId: q.id,
    type: q.type,
    text: q.text,
    points: q.points,
    explanation: q.explanation,
    numericAnswer: q.numericAnswer,
    numericTolerance: q.numericTolerance,
    choices: orderChoices(choiceOrder?.[q.id], q.choices).map(({ id, text, isCorrect }) => ({ id, text, isCorrect })),
    selected: answers[q.id] ?? [],
    earned: graded[i].earned,
    correct: graded[i].correct,
    answered: graded[i].answered,
  }));
  return { results, score, maxScore };
}

/** Keeps only answers to the given questions: valid choice ids, or one parsable number. */
export function sanitizeAnswers(
  questions: Pick<GradableQuestion, "id" | "type" | "choices">[],
  raw: AttemptAnswers,
): AttemptAnswers {
  const answers: AttemptAnswers = {};
  for (const q of questions) {
    const given = raw[q.id] ?? [];
    if (q.type === "numeric") {
      const n = parseNumber(given[0]);
      if (n !== null) answers[q.id] = [String(n)];
      continue;
    }
    const valid = new Set(q.choices.map((c) => c.id));
    const picked = [...new Set(given)].filter((id) => valid.has(id));
    if (picked.length) answers[q.id] = q.type === "multiple" ? picked : picked.slice(0, 1);
  }
  return answers;
}

export function percent(score: number, max: number) {
  return max > 0 ? Math.round((score / max) * 100) : 0;
}

export function formatPoints(n: number) {
  return Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
}
