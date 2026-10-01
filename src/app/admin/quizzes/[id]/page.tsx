import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { QuizEditor } from "@/components/QuizEditor";
import { requireAdmin } from "@/lib/auth";
import { getQuizFull, toEditor } from "@/lib/quizzes";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Edit quiz" };

export default async function EditQuizPage(props: PageProps<"/admin/quizzes/[id]">) {
  await requireAdmin();
  const quiz = await getQuizFull((await props.params).id);
  if (!quiz) notFound();
  return <QuizEditor key={quiz.id} quizId={quiz.id} initial={toEditor(quiz)} />;
}
