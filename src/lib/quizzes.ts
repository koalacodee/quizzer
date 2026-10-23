import "server-only";
import { and, asc, count, desc, eq, sql } from "drizzle-orm";
import { unstable_cache } from "next/cache";
import { db } from "@/db";
import { attempts, choices, questions, quizzes, type SnapshotQuestion } from "@/db/schema";
import { buildSnapshot } from "./grading";
import type { ExportedQuiz, QuizInput } from "./quiz-format";
import * as store from "./quiz-store";

/** Cache tag for the public quiz list; invalidate after any quiz mutation. */
export const QUIZZES_TAG = "quizzes";

export type FullQuiz = NonNullable<Awaited<ReturnType<typeof getQuizFull>>>;
type Attempt = typeof attempts.$inferSelect;

export async function getQuizFull(id: string) {
  if (!isUuid(id)) return undefined;
  return db.query.quizzes.findFirst({
    where: eq(quizzes.id, id),
    with: {
      questions: {
        orderBy: asc(questions.position),
        with: { choices: { orderBy: asc(choices.position) } },
      },
    },
  });
}

const statsColumns = {
  questionCount: sql<number>`(select count(*) from ${questions} where ${questions.quizId} = ${quizzes.id})`.mapWith(Number),
  totalPoints: sql<number>`(select coalesce(sum(${questions.points}), 0) from ${questions} where ${questions.quizId} = ${quizzes.id})`.mapWith(Number),
};

/** Attempts that count: submitted, and not an admin preview. */
const counted = sql`${attempts.status} = 'submitted' and not ${attempts.preview}`;

const cachedPublishedQuizzes = unstable_cache(
  () =>
    db
      .select({
        id: quizzes.id,
        title: quizzes.title,
        description: quizzes.description,
        timeLimitMinutes: quizzes.timeLimitMinutes,
        opensAt: quizzes.opensAt,
        closesAt: quizzes.closesAt,
        questionPoolSize: quizzes.questionPoolSize,
        createdAt: quizzes.createdAt,
        ...statsColumns,
      })
      .from(quizzes)
      .where(eq(quizzes.published, true))
      .orderBy(desc(quizzes.createdAt)),
  ["published-quizzes"],
  { tags: [QUIZZES_TAG], revalidate: 300 },
);

export async function listPublishedQuizzes() {
  // unstable_cache stores JSON, so dates come back as strings.
  const date = (v: Date | string | null) => (v == null ? null : new Date(v));
  return (await cachedPublishedQuizzes()).map((q) => ({
    ...q,
    createdAt: date(q.createdAt)!,
    opensAt: date(q.opensAt),
    closesAt: date(q.closesAt),
  }));
}

export async function listQuizzesForAdmin() {
  return db
    .select({
      id: quizzes.id,
      title: quizzes.title,
      published: quizzes.published,
      opensAt: quizzes.opensAt,
      closesAt: quizzes.closesAt,
      updatedAt: quizzes.updatedAt,
      ...statsColumns,
      attemptCount: sql<number>`(select count(*) from ${attempts} where ${attempts.quizId} = ${quizzes.id} and ${counted})`.mapWith(Number),
      avgPercent: sql<number | null>`(select avg(case when ${attempts.maxScore} > 0 then ${attempts.score} / ${attempts.maxScore} * 100 end) from ${attempts} where ${attempts.quizId} = ${quizzes.id} and ${counted})`.mapWith((v) => (v == null ? null : Number(v))),
    })
    .from(quizzes)
    .orderBy(desc(quizzes.updatedAt));
}

/** Submitted, non-preview attempts, newest first. */
export async function listAttempts(quizId: string) {
  return db
    .select()
    .from(attempts)
    .where(and(eq(attempts.quizId, quizId), counted))
    .orderBy(desc(attempts.submittedAt));
}

export async function countAttempts(quizId: string) {
  const [row] = await db
    .select({ n: count() })
    .from(attempts)
    .where(and(eq(attempts.quizId, quizId), counted));
  return row.n;
}

export async function countQuizzes() {
  const [row] = await db.select({ n: count() }).from(quizzes);
  return row.n;
}

type Participant = { clientToken: string; participantId: string };

/** Attempts (started or submitted, excluding previews) that count toward `maxAttempts`. */
export async function attemptsUsed(quiz: Pick<FullQuiz, "id" | "collectStudentId">, who: Participant) {
  const key = quiz.collectStudentId ? who.participantId : who.clientToken;
  if (!key) return 0;
  const [row] = await db
    .select({ n: count() })
    .from(attempts)
    .where(
      and(
        eq(attempts.quizId, quiz.id),
        eq(attempts.preview, false),
        quiz.collectStudentId ? eq(attempts.participantId, key) : eq(attempts.clientToken, key),
      ),
    );
  return row.n;
}

/** Remaining attempts, or null when unlimited. */
export async function attemptsRemaining(
  quiz: Pick<FullQuiz, "id" | "collectStudentId" | "maxAttempts">,
  who: Participant,
) {
  if (!quiz.maxAttempts) return null;
  return Math.max(0, quiz.maxAttempts - (await attemptsUsed(quiz, who)));
}

/** Per-question results: the stored snapshot, or a live regrade for attempts made before snapshots. */
export function attemptResults(attempt: Attempt, quiz: FullQuiz): SnapshotQuestion[] {
  return attempt.results ?? buildSnapshot(quiz.questions, attempt.answers, quiz).results;
}

/** Re-grades every submitted attempt against the quiz's current answer key. */
export async function regradeAttempts(quizId: string) {
  const quiz = await getQuizFull(quizId);
  if (!quiz) return 0;
  const byId = new Map(quiz.questions.map((q) => [q.id, q]));
  const rows = await db
    .select()
    .from(attempts)
    .where(and(eq(attempts.quizId, quizId), eq(attempts.status, "submitted")));
  await db.transaction(async (tx) => {
    for (const a of rows) {
      const ids = a.results?.map((r) => r.questionId) ?? a.layout?.questionIds ?? quiz.questions.map((q) => q.id);
      const asked = ids.map((id) => byId.get(id)).filter((q) => !!q);
      const { results, score, maxScore } = buildSnapshot(asked, a.answers, quiz, a.layout?.choiceOrder);
      await tx.update(attempts).set({ results, score, maxScore }).where(eq(attempts.id, a.id));
    }
  });
  return rows.length;
}

export const createQuiz = (input: QuizInput) => store.createQuiz(db, input);
export const updateQuiz = (id: string, input: QuizInput) => store.updateQuiz(db, id, input);

export function toExport(quiz: FullQuiz): ExportedQuiz {
  return {
    title: quiz.title,
    description: quiz.description,
    timeLimitMinutes: quiz.timeLimitMinutes,
    shuffleQuestions: quiz.shuffleQuestions,
    shuffleChoices: quiz.shuffleChoices,
    answerReveal: quiz.answerReveal,
    published: quiz.published,
    opensAt: quiz.opensAt,
    closesAt: quiz.closesAt,
    maxAttempts: quiz.maxAttempts,
    requireName: quiz.requireName,
    collectStudentId: quiz.collectStudentId,
    questionPoolSize: quiz.questionPoolSize,
    scoring: quiz.scoring,
    negativeMarking: quiz.negativeMarking,
    questions: quiz.questions.map((q) => ({
      type: q.type,
      text: q.text,
      points: q.points,
      explanation: q.explanation,
      numericAnswer: q.numericAnswer,
      numericTolerance: q.numericTolerance,
      choices: q.choices.map((c) => ({ text: c.text, correct: c.isCorrect })),
    })),
  };
}

export function isUuid(s: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
}

/** Shape consumed by the admin editor (keeps ids so edits update in place). */
export function toEditor(quiz: FullQuiz): QuizInput {
  const exported = toExport(quiz);
  return {
    ...exported,
    questions: quiz.questions.map((q, i) => ({
      ...exported.questions[i],
      id: q.id,
      choices: q.choices.map((c) => ({ id: c.id, text: c.text, correct: c.isCorrect })),
    })),
  };
}

export function slugify(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "quiz";
}
