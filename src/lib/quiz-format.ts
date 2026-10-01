import { z } from "zod";

/**
 * Canonical quiz shape used by the editor, JSON import and JSON export.
 * Ids are optional: present when editing existing rows, absent on import.
 */

export const choiceSchema = z.object({
  id: z.uuid().optional(),
  text: z.string().trim().min(1, "Choice text is required"),
  correct: z.boolean().default(false),
});

export const questionSchema = z
  .object({
    id: z.uuid().optional(),
    type: z.enum(["single", "multiple"]).default("single"),
    text: z.string().trim().min(1, "Question text is required"),
    points: z.number().positive("Points must be greater than 0").default(1),
    explanation: z.string().default(""),
    choices: z.array(choiceSchema).min(2, "A question needs at least 2 choices"),
  })
  .superRefine((q, ctx) => {
    const correct = q.choices.filter((c) => c.correct).length;
    if (correct === 0) {
      ctx.addIssue({ code: "custom", message: "Mark at least one correct choice", path: ["choices"] });
    } else if (q.type === "single" && correct > 1) {
      ctx.addIssue({
        code: "custom",
        message: "Single-answer questions must have exactly one correct choice",
        path: ["choices"],
      });
    }
  });

export const quizSchema = z.object({
  title: z.string().trim().min(1, "Title is required"),
  description: z.string().default(""),
  timeLimitMinutes: z.number().int().positive().nullable().default(null),
  shuffleQuestions: z.boolean().default(false),
  shuffleChoices: z.boolean().default(false),
  showAnswers: z.boolean().default(true),
  published: z.boolean().default(false),
  questions: z.array(questionSchema).min(1, "Add at least one question"),
});

export type QuizInput = z.infer<typeof quizSchema>;
export type QuestionInput = z.infer<typeof questionSchema>;

/**
 * Import is lenient: besides the canonical shape it accepts
 *   - choices as plain strings
 *   - `answer` as a 0-based index (or array of indices) instead of `correct` flags
 *   - `question` as an alias for `text`, `grade` as an alias for `points`
 *   - a single quiz, an array of quizzes, or `{ quizzes: [...] }`
 */
function normalizeQuestion(raw: unknown): unknown {
  if (!raw || typeof raw !== "object") return raw;
  const q = { ...(raw as Record<string, unknown>) };
  if (q.text === undefined && typeof q.question === "string") q.text = q.question;
  if (q.points === undefined && typeof q.grade === "number") q.points = q.grade;
  delete q.question;
  delete q.grade;
  delete q.id;

  const answer = q.answer;
  const answerIdx = new Set(
    Array.isArray(answer) ? answer : typeof answer === "number" ? [answer] : [],
  );
  if (Array.isArray(q.choices)) {
    q.choices = q.choices.map((c, i) => {
      const base =
        typeof c === "string" || typeof c === "number"
          ? { text: String(c) }
          : { ...(c as Record<string, unknown>) };
      delete (base as Record<string, unknown>).id;
      if (answerIdx.has(i)) (base as Record<string, unknown>).correct = true;
      return base;
    });
  }
  delete q.answer;
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
        typeof p === "number" ? (issue.path[i - 1] === "questions" ? `#${p + 1}` : `[${p + 1}]`) : p,
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

export const EXPORT_VERSION = 1;
