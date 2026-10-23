export type QuizStatus = "upcoming" | "open" | "closed";

type Window = { opensAt: Date | null; closesAt: Date | null };

export function quizStatus(quiz: Window, now = new Date()): QuizStatus {
  if (quiz.opensAt && now < quiz.opensAt) return "upcoming";
  if (quiz.closesAt && now >= quiz.closesAt) return "closed";
  return "open";
}

/** Whether correct answers and explanations may be shown on a results page. */
export function canRevealAnswers(
  quiz: Window & { answerReveal: "immediately" | "after_close" | "never" },
  now = new Date(),
  admin = false,
) {
  if (admin || quiz.answerReveal === "immediately") return true;
  if (quiz.answerReveal === "after_close") return !!quiz.closesAt && now >= quiz.closesAt;
  return false;
}
