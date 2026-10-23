"use server";

import { eq } from "drizzle-orm";
import { revalidatePath, revalidateTag } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { attempts, quizzes } from "@/db/schema";
import { requireAdmin } from "@/lib/auth";
import { formatIssues, parseQuizImport, quizSchema } from "@/lib/quiz-format";
import {
  QUIZZES_TAG,
  createQuiz,
  getQuizFull,
  isUuid,
  regradeAttempts as regradeAll,
  toEditor,
  toExport,
  updateQuiz,
} from "@/lib/quizzes";
import type { QuizInput } from "@/lib/quiz-format";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { SESSION_COOKIE, SESSION_TTL_SECONDS, createSessionToken, passwordMatches } from "@/lib/session";

/** Quiz data changed: refresh the cached public list and every rendered page. */
function invalidate() {
  revalidateTag(QUIZZES_TAG, { expire: 0 });
  revalidatePath("/", "layout");
}

export async function login(_prev: { error?: string } | undefined, formData: FormData) {
  if (!(await rateLimit(`login:${await clientIp()}`, 10, 15 * 60))) {
    return { error: "Too many attempts — try again in a few minutes" };
  }
  const password = String(formData.get("password") ?? "");
  if (!(await passwordMatches(password))) return { error: "Wrong password" };
  (await cookies()).set(SESSION_COOKIE, await createSessionToken(), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
  const next = String(formData.get("next") ?? "");
  redirect(next.startsWith("/admin") ? next : "/admin");
}

export async function logout() {
  (await cookies()).delete(SESSION_COOKIE);
  redirect("/");
}

export type SaveResult = { errors: string[] } | { ok: true; id: string; shortCode: string; quiz: QuizInput };

export async function saveQuiz(id: string | null, input: unknown): Promise<SaveResult> {
  await requireAdmin();
  const parsed = quizSchema.safeParse(input);
  if (!parsed.success) return { errors: formatIssues(parsed.error) };

  let quizId = id;
  if (quizId) {
    if (!isUuid(quizId) || !(await updateQuiz(quizId, parsed.data))) return { errors: ["Quiz not found"] };
  } else {
    quizId = await createQuiz(parsed.data);
  }
  invalidate();
  const saved = await getQuizFull(quizId);
  if (!saved) return { errors: ["Quiz not found"] };
  return { ok: true, id: quizId, shortCode: saved.shortCode, quiz: toEditor(saved) };
}

export async function deleteQuiz(id: string) {
  await requireAdmin();
  if (isUuid(id)) await db.delete(quizzes).where(eq(quizzes.id, id));
  invalidate();
}

export async function setPublished(id: string, published: boolean) {
  await requireAdmin();
  if (isUuid(id)) await db.update(quizzes).set({ published, updatedAt: new Date() }).where(eq(quizzes.id, id));
  invalidate();
}

export async function duplicateQuiz(id: string) {
  await requireAdmin();
  const quiz = await getQuizFull(id);
  if (!quiz) return;
  const copy = toExport(quiz);
  await createQuiz({ ...copy, title: `${copy.title} (copy)`, published: false });
  invalidate();
}

export async function deleteAttempt(id: string) {
  await requireAdmin();
  if (isUuid(id)) await db.delete(attempts).where(eq(attempts.id, id));
  revalidatePath("/admin", "layout");
}

export async function regradeAttempts(quizId: string): Promise<{ count: number }> {
  await requireAdmin();
  const count = isUuid(quizId) ? await regradeAll(quizId) : 0;
  revalidatePath("/", "layout");
  return { count };
}

export async function importQuizzes(json: string): Promise<{ errors: string[] } | { ok: true; ids: string[] }> {
  await requireAdmin();
  const res = parseQuizImport(json);
  if (!res.ok) return { errors: res.errors };
  const ids: string[] = [];
  for (const quiz of res.quizzes) ids.push(await createQuiz(quiz));
  invalidate();
  return { ok: true, ids };
}
