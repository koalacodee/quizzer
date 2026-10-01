import "server-only";
import { and, asc, count, desc, eq, notInArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { attempts, choices, questions, quizzes } from "@/db/schema";
import type { ExportedQuiz, QuizInput } from "./quiz-format";

export type FullQuiz = NonNullable<Awaited<ReturnType<typeof getQuizFull>>>;

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

export async function listPublishedQuizzes() {
  return db
    .select({
      id: quizzes.id,
      title: quizzes.title,
      description: quizzes.description,
      timeLimitMinutes: quizzes.timeLimitMinutes,
      createdAt: quizzes.createdAt,
      ...statsColumns,
    })
    .from(quizzes)
    .where(eq(quizzes.published, true))
    .orderBy(desc(quizzes.createdAt));
}

export async function listQuizzesForAdmin() {
  return db
    .select({
      id: quizzes.id,
      title: quizzes.title,
      published: quizzes.published,
      updatedAt: quizzes.updatedAt,
      ...statsColumns,
      attemptCount: sql<number>`(select count(*) from ${attempts} where ${attempts.quizId} = ${quizzes.id})`.mapWith(Number),
      avgPercent: sql<number | null>`(select avg(case when ${attempts.maxScore} > 0 then ${attempts.score} / ${attempts.maxScore} * 100 end) from ${attempts} where ${attempts.quizId} = ${quizzes.id})`.mapWith((v) => (v == null ? null : Number(v))),
    })
    .from(quizzes)
    .orderBy(desc(quizzes.updatedAt));
}

export async function listAttempts(quizId: string) {
  return db
    .select()
    .from(attempts)
    .where(eq(attempts.quizId, quizId))
    .orderBy(desc(attempts.submittedAt));
}

export async function countQuizzes() {
  const [row] = await db.select({ n: count() }).from(quizzes);
  return row.n;
}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

async function writeQuestions(tx: Tx, quizId: string, input: QuizInput) {
  const keepIds = input.questions.map((q) => q.id).filter((id): id is string => !!id);
  // Remove questions that were deleted in the editor.
  await tx
    .delete(questions)
    .where(
      keepIds.length
        ? and(eq(questions.quizId, quizId), notInArray(questions.id, keepIds))
        : eq(questions.quizId, quizId),
    );

  for (const [position, q] of input.questions.entries()) {
    const values = {
      quizId,
      position,
      type: q.type,
      text: q.text,
      points: q.points,
      explanation: q.explanation,
    };
    let questionId = q.id;
    if (questionId) {
      // Upsert so ids stay stable (past attempts reference them).
      await tx
        .insert(questions)
        .values({ id: questionId, ...values })
        .onConflictDoUpdate({ target: questions.id, set: values, where: eq(questions.quizId, quizId) });
    } else {
      [{ id: questionId }] = await tx.insert(questions).values(values).returning({ id: questions.id });
    }

    const keepChoiceIds = q.choices.map((c) => c.id).filter((id): id is string => !!id);
    await tx
      .delete(choices)
      .where(
        keepChoiceIds.length
          ? and(eq(choices.questionId, questionId), notInArray(choices.id, keepChoiceIds))
          : eq(choices.questionId, questionId),
      );
    for (const [cPos, c] of q.choices.entries()) {
      const cValues = { questionId, position: cPos, text: c.text, isCorrect: c.correct };
      if (c.id) {
        await tx
          .insert(choices)
          .values({ id: c.id, ...cValues })
          .onConflictDoUpdate({ target: choices.id, set: cValues, where: eq(choices.questionId, questionId) });
      } else {
        await tx.insert(choices).values(cValues);
      }
    }
  }
}

function quizValues(input: QuizInput) {
  return {
    title: input.title,
    description: input.description,
    timeLimitMinutes: input.timeLimitMinutes,
    shuffleQuestions: input.shuffleQuestions,
    shuffleChoices: input.shuffleChoices,
    showAnswers: input.showAnswers,
    published: input.published,
  };
}

export async function createQuiz(input: QuizInput) {
  return db.transaction(async (tx) => {
    const [quiz] = await tx.insert(quizzes).values(quizValues(input)).returning({ id: quizzes.id });
    // Fresh ids for everything when creating.
    await writeQuestions(tx, quiz.id, {
      ...input,
      questions: input.questions.map((q) => ({
        ...q,
        id: undefined,
        choices: q.choices.map((c) => ({ ...c, id: undefined })),
      })),
    });
    return quiz.id;
  });
}

export async function updateQuiz(id: string, input: QuizInput) {
  await db.transaction(async (tx) => {
    await tx
      .update(quizzes)
      .set({ ...quizValues(input), updatedAt: new Date() })
      .where(eq(quizzes.id, id));
    await writeQuestions(tx, id, input);
  });
}

export function toExport(quiz: FullQuiz): ExportedQuiz {
  return {
    title: quiz.title,
    description: quiz.description,
    timeLimitMinutes: quiz.timeLimitMinutes,
    shuffleQuestions: quiz.shuffleQuestions,
    shuffleChoices: quiz.shuffleChoices,
    showAnswers: quiz.showAnswers,
    published: quiz.published,
    questions: quiz.questions.map((q) => ({
      type: q.type,
      text: q.text,
      points: q.points,
      explanation: q.explanation,
      choices: q.choices.map((c) => ({ text: c.text, correct: c.isCorrect })),
    })),
  };
}

export function isUuid(s: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
}

/** Shape consumed by the admin editor (keeps ids so edits update in place). */
export function toEditor(quiz: FullQuiz): QuizInput {
  return {
    ...toExport(quiz),
    questions: quiz.questions.map((q) => ({
      id: q.id,
      type: q.type,
      text: q.text,
      points: q.points,
      explanation: q.explanation,
      choices: q.choices.map((c) => ({ id: c.id, text: c.text, correct: c.isCorrect })),
    })),
  };
}
