import { z } from "zod";

/**
 * Canonical quiz shape used by the editor, JSON import and JSON export.
 * Ids are optional: present when editing existing rows, absent on import.
 */

export const QUESTION_TYPES = ["single", "multiple", "true_false", "numeric"] as const;
export const ANSWER_REVEAL = ["immediately", "after_close", "never"] as const;
export const SCORING_MODES = ["all_or_nothing", "partial"] as const;

export const choiceSchema = z.object({
  id: z.uuid().optional(),
  text: z.string().trim().min(1, "Choice text is required"),
  correct: z.boolean().default(false),
});

export const questionSchema = z
  .object({
    id: z.uuid().optional(),
    type: z.enum(QUESTION_TYPES).default("single"),
    text: z.string().trim().min(1, "Question text is required"),
    points: z.number().positive("Points must be greater than 0").default(1),
    explanation: z.string().default(""),
    choices: z.array(choiceSchema).default([]),
    numericAnswer: z.number("The correct answer must be a number").nullable().default(null),
    numericTolerance: z.number().min(0, "Tolerance can't be negative").default(0),
  })
  .superRefine((q, ctx) => {
    if (q.type === "numeric") {
      if (q.numericAnswer === null) {
        ctx.addIssue({ code: "custom", message: "Enter the correct numeric answer", path: ["numericAnswer"] });
      }
      return;
    }
    if (q.choices.length < 2) {
      ctx.addIssue({ code: "custom", message: "A question needs at least 2 choices", path: ["choices"] });
      return;
    }
    const correct = q.choices.filter((c) => c.correct).length;
    if (q.type === "true_false" && q.choices.length !== 2) {
      ctx.addIssue({ code: "custom", message: "True/false questions have exactly 2 choices", path: ["choices"] });
    } else if (correct === 0) {
      ctx.addIssue({ code: "custom", message: "Mark at least one correct choice", path: ["choices"] });
    } else if (q.type !== "multiple" && correct > 1) {
      ctx.addIssue({
        code: "custom",
        message: "Single-answer questions must have exactly one correct choice",
        path: ["choices"],
      });
    }
  });

const optionalDate = z.coerce.date("Invalid date").nullable().default(null);

export const quizSchema = z
  .object({
    title: z.string().trim().min(1, "Title is required"),
    description: z.string().default(""),
    timeLimitMinutes: z.number().int().positive().nullable().default(null),
    shuffleQuestions: z.boolean().default(false),
    shuffleChoices: z.boolean().default(false),
    answerReveal: z.enum(ANSWER_REVEAL).default("immediately"),
    published: z.boolean().default(false),
    opensAt: optionalDate,
    closesAt: optionalDate,
    maxAttempts: z.number().int().positive("Max attempts must be at least 1").nullable().default(null),
    requireName: z.boolean().default(false),
    collectStudentId: z.boolean().default(false),
    questionPoolSize: z.number().int().positive("Pool size must be at least 1").nullable().default(null),
    scoring: z.enum(SCORING_MODES).default("all_or_nothing"),
    negativeMarking: z.number().min(0).max(1, "Negative marking is a fraction between 0 and 1").default(0),
    questions: z.array(questionSchema).min(1, "Add at least one question"),
  })
  .superRefine((quiz, ctx) => {
    if (quiz.opensAt && quiz.closesAt && quiz.closesAt <= quiz.opensAt) {
      ctx.addIssue({ code: "custom", message: "The closing time must be after the opening time", path: ["closesAt"] });
    }
    if (quiz.questionPoolSize && quiz.questionPoolSize > quiz.questions.length) {
      ctx.addIssue({
        code: "custom",
        message: "Pool size can't exceed the number of questions",
        path: ["questionPoolSize"],
      });
    }
    if (quiz.answerReveal === "after_close" && !quiz.closesAt) {
      ctx.addIssue({
        code: "custom",
        message: "Set a closing time to reveal answers after the quiz closes",
        path: ["answerReveal"],
      });
    }
  });

export type QuizInput = z.infer<typeof quizSchema>;
export type QuestionInput = z.infer<typeof questionSchema>;

export const TRUE_FALSE_LABELS = ["True", "False"] as const;

/**
 * Import is lenient: besides the canonical shape it accepts
 *   - choices as plain strings
 *   - `answer` as a 0-based index (or array of indices) instead of `correct` flags
 *   - `question` as an alias for `text`, `grade` as an alias for `points`
 *   - numeric questions as `answer: <number>` (+ optional `tolerance`) without choices
 *   - true/false questions as `answer: true | false` without choices
 *   - a single quiz, an array of quizzes, or `{ quizzes: [...] }`
 *   - version 1 files (`showAnswers: boolean`)
 */
function normalizeQuestion(raw: unknown): unknown {
  if (!raw || typeof raw !== "object") return raw;
  const q = { ...(raw as Record<string, unknown>) };
  if (q.text === undefined && typeof q.question === "string") q.text = q.question;
  if (q.points === undefined && typeof q.grade === "number") q.points = q.grade;
  if (q.numericTolerance === undefined && typeof q.tolerance === "number") q.numericTolerance = q.tolerance;
  delete q.question;
  delete q.grade;
  delete q.tolerance;
  delete q.id;

  const answer = q.answer;
  delete q.answer;
  const hasChoices = Array.isArray(q.choices) && q.choices.length > 0;

  if (q.type === undefined && !hasChoices) {
    if (typeof answer === "number" || typeof q.numericAnswer === "number") q.type = "numeric";
    else if (typeof answer === "boolean") q.type = "true_false";
  }

  if (q.type === "numeric") {
    if (q.numericAnswer === undefined && typeof answer === "number") q.numericAnswer = answer;
    q.choices = [];
    return q;
  }

  if (q.type === "true_false" && !hasChoices && typeof answer === "boolean") {
    q.choices = TRUE_FALSE_LABELS.map((text, i) => ({ text, correct: (i === 0) === answer }));
    return q;
  }

  const answerIdx = new Set(Array.isArray(answer) ? answer : typeof answer === "number" ? [answer] : []);
  if (Array.isArray(q.choices)) {
    q.choices = q.choices.map((c, i) => {
      const base: Record<string, unknown> =
        typeof c === "string" || typeof c === "number" ? { text: String(c) } : { ...(c as Record<string, unknown>) };
      delete base.id;
      if (answerIdx.has(i)) base.correct = true;
      return base;
    });
  }
  if (q.type === undefined && Array.isArray(q.choices)) {
    const correct = (q.choices as { correct?: boolean }[]).filter((c) => c.correct).length;
    q.type = correct > 1 ? "multiple" : "single";
  }
  return q;
}

function normalizeQuiz(raw: unknown): unknown {
  if (!raw || typeof raw !== "object") return raw;
  const quiz = { ...(raw as Record<string, unknown>) };
  delete quiz.id;
  delete quiz.shortCode;
  if (quiz.answerReveal === undefined && typeof quiz.showAnswers === "boolean") {
    quiz.answerReveal = quiz.showAnswers ? "immediately" : "never";
  }
  delete quiz.showAnswers;
  if (Array.isArray(quiz.questions)) quiz.questions = quiz.questions.map(normalizeQuestion);
  return quiz;
}

export type ImportResult =
  | { ok: true; quizzes: QuizInput[] }
  | { ok: false; errors: string[] };

export function parseQuizImport(json: string): ImportResult {
  let data: unknown;
  try {
    data = JSON.parse(json);
  } catch (e) {
    return { ok: false, errors: [`Invalid JSON: ${(e as Error).message}`] };
  }
  const list: unknown[] = Array.isArray(data)
    ? data
    : data && typeof data === "object" && Array.isArray((data as { quizzes?: unknown }).quizzes)
      ? (data as { quizzes: unknown[] }).quizzes
      : [data];
  if (list.length === 0) return { ok: false, errors: ["No quizzes found in the file"] };

  const quizzes: QuizInput[] = [];
  const errors: string[] = [];
  list.forEach((raw, i) => {
    const res = quizSchema.safeParse(normalizeQuiz(raw));
    if (res.success) quizzes.push(res.data);
    else errors.push(...formatIssues(res.error, list.length > 1 ? `Quiz ${i + 1}` : undefined));
  });
  return errors.length ? { ok: false, errors } : { ok: true, quizzes };
}

export function formatIssues(error: z.ZodError, prefix?: string): string[] {
  return error.issues.map((issue) => {
    const path = issue.path
      .map((p, i) =>
        typeof p === "number" ? (issue.path[i - 1] === "questions" ? `#${p + 1}` : `[${p + 1}]`) : String(p),
      )
      .join(" ")
      .replace("questions #", "Question #")
      .replace(" choices [", " choice [");
    return [prefix, path, issue.message].filter(Boolean).join(" › ");
  });
}

/** Shape written by export (and re-importable). */
export type ExportedQuiz = Omit<QuizInput, "questions"> & {
  questions: (Omit<QuestionInput, "id" | "choices"> & {
    choices: { text: string; correct: boolean }[];
  })[];
};

export const EXPORT_VERSION = 2;
