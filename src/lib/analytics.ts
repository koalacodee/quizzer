import type { SnapshotQuestion } from "@/db/schema";

type AnalyzedQuestion = {
  id: string;
  type: SnapshotQuestion["type"];
  points: number;
  choices: { id: string; isCorrect: boolean }[];
};

export type QuestionStats = {
  questionId: string;
  /** Attempts that were shown this question (differs from attempt count with question pools). */
  asked: number;
  answered: number;
  correct: number;
  /** 0–100, or null when nobody was asked. */
  correctRate: number | null;
  avgEarned: number | null;
  choiceCounts: Record<string, number>;
  /** Most-picked wrong choice, if any wrong choice was picked. */
  topDistractor: string | null;
  /** Numeric answers given, most common first. */
  numericValues: { value: string; count: number }[];
};

export function analyzeQuiz(questions: AnalyzedQuestion[], attempts: SnapshotQuestion[][]): QuestionStats[] {
  const byQuestion = new Map<string, SnapshotQuestion[]>();
  for (const results of attempts) {
    for (const r of results) {
      const list = byQuestion.get(r.questionId) ?? [];
      list.push(r);
      byQuestion.set(r.questionId, list);
    }
  }

  return questions.map((q) => {
    const entries = byQuestion.get(q.id) ?? [];
    const asked = entries.length;
    const answered = entries.filter((e) => e.answered).length;
    const correct = entries.filter((e) => e.correct).length;
    const choiceCounts: Record<string, number> = Object.fromEntries(q.choices.map((c) => [c.id, 0]));
    const numeric = new Map<string, number>();
    for (const e of entries) {
      if (q.type === "numeric") {
        if (e.selected[0] !== undefined) numeric.set(e.selected[0], (numeric.get(e.selected[0]) ?? 0) + 1);
      } else {
        for (const id of e.selected) if (id in choiceCounts) choiceCounts[id]++;
      }
    }
    let topDistractor: string | null = null;
    for (const c of q.choices) {
      if (c.isCorrect || !choiceCounts[c.id]) continue;
      if (!topDistractor || choiceCounts[c.id] > choiceCounts[topDistractor]) topDistractor = c.id;
    }
    return {
      questionId: q.id,
      asked,
      answered,
      correct,
      correctRate: asked ? Math.round((correct / asked) * 100) : null,
      avgEarned: asked ? entries.reduce((s, e) => s + e.earned, 0) / asked : null,
      choiceCounts,
      topDistractor,
      numericValues: [...numeric.entries()]
        .map(([value, count]) => ({ value, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10),
    };
  });
}
