import Link from "next/link";
import { listPublishedQuizzes } from "@/lib/quizzes";
import { formatPoints } from "@/lib/grading";

export const dynamic = "force-dynamic";

export default async function Home() {
  const quizzes = await listPublishedQuizzes();

  return (
    <div className="space-y-8">
      <section>
        <h1 className="text-3xl font-semibold tracking-tight">Quizzes</h1>
        <p className="mt-1 text-muted">Pick a quiz, answer at your own pace, and see your grade right away.</p>
      </section>

      {quizzes.length === 0 ? (
        <div className="card p-10 text-center text-muted">
          No quizzes published yet.{" "}
          <Link href="/admin" className="text-accent underline">Create one</Link>.
        </div>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2">
          {quizzes.map((q) => (
            <li key={q.id}>
              <Link
                href={`/quiz/${q.id}`}
                className="card group flex h-full flex-col p-5 transition hover:border-accent hover:shadow-sm"
              >
                <h2 className="font-semibold group-hover:text-accent">{q.title}</h2>
                {q.description && (
                  <p className="mt-1 line-clamp-2 text-sm text-muted">{stripMarkdown(q.description)}</p>
                )}
                <div className="mt-auto flex flex-wrap gap-2 pt-4 text-xs text-muted">
                  <Pill>{q.questionCount} questions</Pill>
                  <Pill>{formatPoints(q.totalPoints)} pts</Pill>
                  {q.timeLimitMinutes && <Pill>{q.timeLimitMinutes} min</Pill>}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Pill({ children }: { children: React.ReactNode }) {
  return <span className="rounded-full border border-border px-2.5 py-0.5">{children}</span>;
}

function stripMarkdown(s: string) {
  return s.replace(/\$\$?[^$]*\$\$?/g, "…").replace(/[#*_`>\[\]()]/g, "").trim();
}
