"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { attempts, quizzes } from "@/db/schema";
import { requireAdmin } from "@/lib/auth";
import { formatIssues, parseQuizImport, quizSchema } from "@/lib/quiz-format";
import { createQuiz, getQuizFull, isUuid, toEditor, toExport, updateQuiz } from "@/lib/quizzes";
import type { QuizInput } from "@/lib/quiz-format";
import { SESSION_COOKIE, SESSION_TTL_SECONDS, createSessionToken, passwordMatches } from "@/lib/session";

export async function login(_prev: { error?: string } | undefined, formData: FormData) {
  const password = String(formData.get("password") ?? "");
  if (!passwordMatches(password)) return { error: "Wrong password" };
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

export type SaveResult = { errors: string[] } | { ok: true; id: string; quiz: QuizInput };

export async function saveQuiz(id: string | null, input: unknown): Promise<SaveResult> {
  await requireAdmin();
  const parsed = quizSchema.safeParse(input);
  if (!parsed.success) return { errors: formatIssues(parsed.error) };

  let quizId = id;
  if (quizId) {
    if (!isUuid(quizId)) return { errors: ["Quiz not found"] };
    await updateQuiz(quizId, parsed.data);
  } else {
    quizId = await createQuiz(parsed.data);
  }
  revalidatePath("/", "layout");
  const saved = await getQuizFull(quizId);
  if (!saved) return { errors: ["Quiz not found"] };
  return { ok: true, id: quizId, quiz: toEditor(saved) };
}

export async function deleteQuiz(id: string) {
  await requireAdmin();
  if (isUuid(id)) await db.delete(quizzes).where(eq(quizzes.id, id));
  revalidatePath("/", "layout");
}

export async function setPublished(id: string, published: boolean) {
  await requireAdmin();
  if (isUuid(id)) await db.update(quizzes).set({ published }).where(eq(quizzes.id, id));
  revalidatePath("/", "layout");
}

export async function duplicateQuiz(id: string) {
  await requireAdmin();
  const quiz = await getQuizFull(id);
  if (!quiz) return;
  const copy = toExport(quiz);
  await createQuiz({ ...copy, title: `${copy.title} (copy)`, published: false });
  revalidatePath("/", "layout");
}

export async function deleteAttempt(id: string) {
  await requireAdmin();
  if (isUuid(id)) await db.delete(attempts).where(eq(attempts.id, id));
  revalidatePath("/admin", "layout");
}

export async function importQuizzes(json: string): Promise<{ errors: string[] } | { ok: true; ids: string[] }> {
  await requireAdmin();
  const res = parseQuizImport(json);
  if (!res.ok) return { errors: res.errors };
  const ids: string[] = [];
  for (const quiz of res.quizzes) ids.push(await createQuiz(quiz));
  revalidatePath("/", "layout");
  return { ok: true, ids };
}
