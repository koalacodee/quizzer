import type { AttemptLayout } from "@/db/schema";

export function shuffle<T>(arr: T[], random = Math.random) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

type LayoutQuiz = {
  shuffleQuestions: boolean;
  shuffleChoices: boolean;
  questionPoolSize: number | null;
  questions: { id: string; choices: { id: string }[] }[];
};

/** Picks the questions (pool), their order and each question's choice order for one attempt. */
export function buildLayout(quiz: LayoutQuiz, random = Math.random): AttemptLayout {
  let picked = quiz.questions;
  const pool = quiz.questionPoolSize;
  if (pool && pool < picked.length) {
    // Draw a random subset but keep authoring order unless shuffling is on.
    const chosen = new Set(shuffle(picked, random).slice(0, pool).map((q) => q.id));
    picked = picked.filter((q) => chosen.has(q.id));
  }
  if (quiz.shuffleQuestions) picked = shuffle(picked, random);
  return {
    questionIds: picked.map((q) => q.id),
    choiceOrder: Object.fromEntries(
      picked.map((q) => {
        const ids = q.choices.map((c) => c.id);
        return [q.id, quiz.shuffleChoices ? shuffle(ids, random) : ids];
      }),
    ),
  };
}

/**
 * Applies a stored choice order to the question's current choices: ids that no longer
 * exist are dropped and choices added after the attempt started are appended.
 */
export function orderChoices<T extends { id: string }>(stored: string[] | undefined, current: T[]): T[] {
  if (!stored) return current;
  const byId = new Map(current.map((c) => [c.id, c]));
  const ordered = stored.map((id) => byId.get(id)).filter((c): c is T => !!c);
  const placed = new Set(stored);
  return [...ordered, ...current.filter((c) => !placed.has(c.id))];
}
