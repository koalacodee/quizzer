"use server";

import { z } from "zod";
import { db } from "@/db";
import { attempts } from "@/db/schema";
import { isAdmin } from "@/lib/auth";
import { gradeAttempt } from "@/lib/grading";
import { getQuizFull } from "@/lib/quizzes";

const submissionSchema = z.object({
  quizId: z.uuid(),
  participantName: z.string().trim().max(100).default(""),
  answers: z.record(z.string(), z.array(z.string()).max(50)),
  startedAt: z.number().int().positive().nullable(),
});

export async function submitAttempt(
  input: z.input<typeof submissionSchema>,
): Promise<{ attemptId: string } | { error: string }> {
  const parsed = submissionSchema.safeParse(input);
  if (!parsed.success) return { error: "Invalid submission" };
  const data = parsed.data;
  const quiz = await getQuizFull(data.quizId);
  if (!quiz || (!quiz.published && !(await isAdmin()))) return { error: "This quiz is no longer available" };

  // Only keep answers for real questions/choices of this quiz.
  const answers: Record<string, string[]> = {};
  for (const q of quiz.questions) {
    const valid = new Set(q.choices.map((c) => c.id));
    const picked = [...new Set(data.answers[q.id] ?? [])].filter((id) => valid.has(id));
    if (picked.length) answers[q.id] = q.type === "single" ? picked.slice(0, 1) : picked;
  }

  const { score, maxScore } = gradeAttempt(quiz.questions, answers);
  const startedAt =
    data.startedAt && data.startedAt <= Date.now() ? new Date(data.startedAt) : null;

  const [row] = await db
    .insert(attempts)
    .values({
      quizId: quiz.id,
      participantName: data.participantName,
      answers,
      score,
      maxScore,
      startedAt,
    })
    .returning({ id: attempts.id });

  return { attemptId: row.id };
}
