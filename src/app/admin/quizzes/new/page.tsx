import type { Metadata } from "next";
import { QuizEditor } from "@/components/QuizEditor";
import { requireAdmin } from "@/lib/auth";

export const metadata: Metadata = { title: "New quiz" };

export default async function NewQuizPage() {
  await requireAdmin();
  return <QuizEditor quizId={null} />;
}
