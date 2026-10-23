import type { Metadata } from "next";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { Markdown } from "@/components/Markdown";
import { QuizTaker, type TakerQuiz } from "@/components/QuizTaker";
import { isAdmin } from "@/lib/auth";
import { quizStatus } from "@/lib/availability";
import { attemptsRemaining, getQuizFull } from "@/lib/quizzes";

export const dynamic = "force-dynamic";

async function load(id: string) {
  const quiz = await getQuizFull(id);
  if (!quiz || (!quiz.published && !(await isAdmin()))) return null;
  return quiz;
}

export async function generateMetadata(props: PageProps<"/quiz/[id]">): Promise<Metadata> {
  const quiz = await load((await props.params).id);
  return { title: quiz?.title ?? "Quiz not found" };
}

export default async function QuizPage(props: PageProps<"/quiz/[id]">) {
  const quiz = await load((await props.params).id);
  if (!quiz) notFound();

  // With student IDs the limit is per ID, which isn't known until the form is filled in.
  const remaining = quiz.collectStudentId
    ? null
    : await attemptsRemaining(quiz, { clientToken: (await cookies()).get("quizzer_pid")?.value ?? "", participantId: "" });

  // Correct answers never leave the server; Markdown is rendered here, too.
  const takerQuiz: TakerQuiz = {
    id: quiz.id,
    title: quiz.title,
    description: quiz.description ? <Markdown>{quiz.description}</Markdown> : null,
    published: quiz.published,
    timeLimitMinutes: quiz.timeLimitMinutes,
    totalPoints: quiz.questions.reduce((s, q) => s + q.points, 0),
    status: quizStatus(quiz),
    opensAt: quiz.opensAt?.toISOString() ?? null,
    closesAt: quiz.closesAt?.toISOString() ?? null,
    requireName: quiz.requireName,
    collectStudentId: quiz.collectStudentId,
    questionPoolSize: quiz.questionPoolSize,
    attemptsRemaining: remaining,
    questions: quiz.questions.map((q) => ({
      id: q.id,
      type: q.type,
      points: q.points,
      text: <Markdown>{q.text}</Markdown>,
      choices: q.choices.map((c) => ({ id: c.id, text: <Markdown inline>{c.text}</Markdown> })),
    })),
  };

  return <QuizTaker quiz={takerQuiz} />;
}
