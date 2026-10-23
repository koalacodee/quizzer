"use server";

import { and, eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { z } from "zod";
import { db } from "@/db";
import { attempts, type AttemptLayout } from "@/db/schema";
import { isAdmin } from "@/lib/auth";
import { quizStatus } from "@/lib/availability";
import { buildSnapshot, sanitizeAnswers } from "@/lib/grading";
import { buildLayout } from "@/lib/layout";
import { attemptsUsed, getQuizFull, isUuid } from "@/lib/quizzes";
import { clientIp, rateLimit } from "@/lib/rate-limit";

const CLIENT_COOKIE = "quizzer_pid";
/** Submissions within this long after the deadline are not marked late (network, auto-submit). */
const GRACE_MS = 30_000;

/** Random per-browser id used to tie attempts to the device that started them. */
async function clientToken(create: boolean) {
  const store = await cookies();
  const existing = store.get(CLIENT_COOKIE)?.value;
  if (existing && isUuid(existing)) return existing;
  if (!create) return null;
  const token = crypto.randomUUID();
  store.set(CLIENT_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
  return token;
}

export type ActiveAttempt = {
  attemptId: string;
  layout: AttemptLayout;
  /** Epoch ms, or null when untimed. */
  deadline: number | null;
};

const startSchema = z.object({
  quizId: z.uuid(),
  participantName: z.string().trim().max(100).default(""),
  participantId: z.string().trim().max(100).default(""),
});

export async function startAttempt(input: z.input<typeof startSchema>): Promise<ActiveAttempt | { error: string }> {
  const parsed = startSchema.safeParse(input);
  if (!parsed.success) return { error: "Invalid request" };
  const { quizId, participantName, participantId } = parsed.data;

  const [quiz, admin] = await Promise.all([getQuizFull(quizId), isAdmin()]);
  if (!quiz || (!quiz.published && !admin)) return { error: "This quiz is no longer available" };
  const status = quizStatus(quiz);
  if (status !== "open" && !admin) {
    return { error: status === "upcoming" ? "This quiz hasn't opened yet" : "This quiz is closed" };
  }
  if (quiz.requireName && !participantName) return { error: "Please enter your name" };
  if (quiz.collectStudentId && !participantId) return { error: "Please enter your student ID" };
  if (!admin && !(await rateLimit(`start:${await clientIp()}`, 30, 60 * 60))) {
    return { error: "Too many attempts started from this network — please try again later" };
  }

  const token = (await clientToken(true))!;
  // Admin runs of unpublished or closed quizzes don't count anywhere.
  const preview = !quiz.published || status !== "open";
  if (quiz.maxAttempts && !preview) {
    const used = await attemptsUsed(quiz, { clientToken: token, participantId });
    if (used >= quiz.maxAttempts) {
      return { error: `You've used all ${quiz.maxAttempts} attempt${quiz.maxAttempts === 1 ? "" : "s"} for this quiz` };
    }
  }

  const layout = buildLayout(quiz);
  const now = Date.now();
  let deadline = quiz.timeLimitMinutes ? now + quiz.timeLimitMinutes * 60_000 : null;
  if (quiz.closesAt && !preview && (deadline === null || quiz.closesAt.getTime() < deadline)) {
    deadline = quiz.closesAt.getTime();
  }

  const [row] = await db
    .insert(attempts)
    .values({
      quizId: quiz.id,
      participantName,
      participantId,
      clientToken: token,
      preview,
      layout,
      startedAt: new Date(now),
      deadline: deadline === null ? null : new Date(deadline),
    })
    .returning({ id: attempts.id });

  return { attemptId: row.id, layout, deadline };
}

async function ownAttempt(attemptId: string) {
  if (!isUuid(attemptId)) return null;
  const token = await clientToken(false);
  if (!token) return null;
  const attempt = await db.query.attempts.findFirst({ where: eq(attempts.id, attemptId) });
  return attempt && attempt.clientToken === token ? attempt : null;
}

/** Server-side state of an attempt saved in the browser, so a reload can't reset the clock or order. */
export async function resumeAttempt(
  attemptId: string,
): Promise<(ActiveAttempt & { status: "in_progress" | "submitted" }) | null> {
  const attempt = await ownAttempt(attemptId);
  if (!attempt?.layout) return null;
  return {
    attemptId: attempt.id,
    status: attempt.status,
    layout: attempt.layout,
    deadline: attempt.deadline?.getTime() ?? null,
  };
}

const submissionSchema = z.object({
  attemptId: z.uuid(),
  answers: z.record(z.string(), z.array(z.string().max(64)).max(50)),
});

export async function submitAttempt(
  input: z.input<typeof submissionSchema>,
): Promise<{ attemptId: string } | { error: string }> {
  const parsed = submissionSchema.safeParse(input);
  if (!parsed.success) return { error: "Invalid submission" };
  const attempt = await ownAttempt(parsed.data.attemptId);
  if (!attempt) return { error: "This attempt could not be found" };
  // Idempotent: a retried submit just returns the existing result.
  if (attempt.status === "submitted") return { attemptId: attempt.id };

  const quiz = await getQuizFull(attempt.quizId);
  if (!quiz) return { error: "This quiz is no longer available" };

  const layout = attempt.layout ?? buildLayout({ ...quiz, shuffleQuestions: false, shuffleChoices: false, questionPoolSize: null });
  const byId = new Map(quiz.questions.map((q) => [q.id, q]));
  const asked = layout.questionIds.map((id) => byId.get(id)).filter((q) => !!q);

  const answers = sanitizeAnswers(asked, parsed.data.answers);
  const { results, score, maxScore } = buildSnapshot(asked, answers, quiz, layout.choiceOrder);
  const now = new Date();
  const late = !!attempt.deadline && now.getTime() > attempt.deadline.getTime() + GRACE_MS;

  await db
    .update(attempts)
    .set({ status: "submitted", answers, results, score, maxScore, submittedAt: now, late })
    .where(and(eq(attempts.id, attempt.id), eq(attempts.status, "in_progress")));

  return { attemptId: attempt.id };
}
