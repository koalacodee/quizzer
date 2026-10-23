// Quiz writes shared by the app (src/lib/quizzes.ts) and scripts/seed.ts — no `server-only` here.
import { and, eq, inArray, notInArray, sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import * as schema from "@/db/schema";
import { choices, questions, quizzes } from "@/db/schema";
import type { QuizInput } from "./quiz-format";

export type Db = PostgresJsDatabase<typeof schema>;
type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

const excluded = (column: string) => sql.raw(`excluded.${column}`);

/** Public quiz identifier used in share links: 10 digits, never starting with 0. */
export const SHARE_CODE_LENGTH = 10;

export function newShortCode() {
  const digits: number[] = [];
  while (digits.length < SHARE_CODE_LENGTH) {
    for (const b of crypto.getRandomValues(new Uint8Array(16))) {
      // Rejection sampling keeps every digit equally likely.
      if (b >= 250) continue;
      const d = b % 10;
      if (digits.length === 0 && d === 0) continue;
      if (digits.length < SHARE_CODE_LENGTH) digits.push(d);
    }
  }
  return digits.join("");
}

/** Accepts codes typed with spaces or dashes ("482 910 3756"); returns the bare digits or null. */
export function normalizeShareCode(input: string) {
  const digits = input.replace(/[\s-]/g, "");
  return /^[1-9]\d{9}$/.test(digits) ? digits : null;
}

/** "4829103756" → "482 910 3756", easier to read aloud or copy from a slide. */
export function formatShareCode(code: string) {
  return code.replace(/^(\d{3})(\d{3})(\d{4})$/, "$1 $2 $3");
}

export function quizValues(input: QuizInput) {
  return {
    title: input.title,
    description: input.description,
    timeLimitMinutes: input.timeLimitMinutes,
    shuffleQuestions: input.shuffleQuestions,
    shuffleChoices: input.shuffleChoices,
    answerReveal: input.answerReveal,
    published: input.published,
    opensAt: input.opensAt,
    closesAt: input.closesAt,
    maxAttempts: input.maxAttempts,
    requireName: input.requireName,
    collectStudentId: input.collectStudentId,
    questionPoolSize: input.questionPoolSize,
    scoring: input.scoring,
    negativeMarking: input.negativeMarking,
  };
}

/**
 * Replaces a quiz's questions and choices in a constant number of queries.
 * Incoming ids are kept only when they already belong to this quiz (or question),
 * so past attempts keep matching; anything else gets a fresh id.
 */
async function writeQuestions(tx: Tx, quizId: string, input: QuizInput) {
  const existing = await tx
    .select({ questionId: questions.id, choiceId: choices.id })
    .from(questions)
    .leftJoin(choices, eq(choices.questionId, questions.id))
    .where(eq(questions.quizId, quizId));
  const ownedQuestions = new Set(existing.map((r) => r.questionId));
  const choiceOwner = new Map(existing.filter((r) => r.choiceId).map((r) => [r.choiceId!, r.questionId]));

  const seen = new Set<string>();
  const claim = (id: string | undefined, owned: boolean) => {
    if (id && owned && !seen.has(id)) {
      seen.add(id);
      return id;
    }
    return crypto.randomUUID();
  };

  const questionRows = input.questions.map((q, position) => {
    const numeric = q.type === "numeric";
    return {
      id: claim(q.id, !!q.id && ownedQuestions.has(q.id)),
      quizId,
      position,
      type: q.type,
      text: q.text,
      points: q.points,
      explanation: q.explanation,
      numericAnswer: numeric ? q.numericAnswer : null,
      numericTolerance: numeric ? q.numericTolerance : 0,
    };
  });
  const choiceRows = input.questions.flatMap((q, i) => {
    if (q.type === "numeric") return [];
    const questionId = questionRows[i].id;
    return q.choices.map((c, position) => ({
      id: claim(c.id, !!c.id && choiceOwner.get(c.id) === questionId),
      questionId,
      position,
      text: c.text,
      isCorrect: c.correct,
    }));
  });

  const keptQuestions = questionRows.map((r) => r.id).filter((id) => ownedQuestions.has(id));
  await tx
    .delete(questions)
    .where(
      keptQuestions.length
        ? and(eq(questions.quizId, quizId), notInArray(questions.id, keptQuestions))
        : eq(questions.quizId, quizId),
    );
  if (keptQuestions.length) {
    const keptChoices = choiceRows.map((r) => r.id).filter((id) => choiceOwner.has(id));
    await tx
      .delete(choices)
      .where(
        keptChoices.length
          ? and(inArray(choices.questionId, keptQuestions), notInArray(choices.id, keptChoices))
          : inArray(choices.questionId, keptQuestions),
      );
  }

  if (questionRows.length) {
    await tx
      .insert(questions)
      .values(questionRows)
      .onConflictDoUpdate({
        target: questions.id,
        set: {
          position: excluded("position"),
          type: excluded("type"),
          text: excluded("text"),
          points: excluded("points"),
          explanation: excluded("explanation"),
          numericAnswer: excluded("numeric_answer"),
          numericTolerance: excluded("numeric_tolerance"),
        },
      });
  }
  if (choiceRows.length) {
    await tx
      .insert(choices)
      .values(choiceRows)
      .onConflictDoUpdate({
        target: choices.id,
        set: { position: excluded("position"), text: excluded("text"), isCorrect: excluded("is_correct") },
      });
  }
}

function isShortCodeConflict(e: unknown) {
  const err = e as { code?: string; constraint_name?: string; cause?: { code?: string; constraint_name?: string } };
  const pg = err.cause ?? err;
  return pg.code === "23505" && (pg.constraint_name ?? "").includes("short_code");
}

export async function createQuiz(db: Db, input: QuizInput) {
  for (let attempt = 0; ; attempt++) {
    try {
      return await db.transaction(async (tx) => {
        const [quiz] = await tx
          .insert(quizzes)
          .values({ ...quizValues(input), shortCode: newShortCode() })
          .returning({ id: quizzes.id });
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
    } catch (e) {
      if (attempt < 4 && isShortCodeConflict(e)) continue;
      throw e;
    }
  }
}

/** Returns false when the quiz doesn't exist. */
export async function updateQuiz(db: Db, id: string, input: QuizInput) {
  return db.transaction(async (tx) => {
    const updated = await tx
      .update(quizzes)
      .set({ ...quizValues(input), updatedAt: new Date() })
      .where(eq(quizzes.id, id))
      .returning({ id: quizzes.id });
    if (!updated.length) return false;
    await writeQuestions(tx, id, input);
    return true;
  });
}
