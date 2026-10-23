import Link from "next/link";
import { LocalTime } from "@/components/LocalTime";
import { quizStatus } from "@/lib/availability";
import { listPublishedQuizzes } from "@/lib/quizzes";
import { formatPoints } from "@/lib/grading";

export const dynamic = "force-dynamic";

export default async function Home() {
  const quizzes = await listPublishedQuizzes();
  // The list is cached; open/closed status is computed per request so it never goes stale.
  const now = new Date();

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
          {quizzes.map((q) => {
            const status = quizStatus(q, now);
            const pooled = q.questionPoolSize != null && q.questionPoolSize < q.questionCount;
            return (
              <li key={q.id}>
                <Link
                  href={`/quiz/${q.id}`}
                  className="card group flex h-full flex-col p-5 transition hover:border-accent hover:shadow-sm"
                >
                  <div className="flex items-start justify-between gap-3">
                    <h2 className="font-semibold group-hover:text-accent">{q.title}</h2>
                    {status === "upcoming" && q.opensAt && (
                      <span className="shrink-0 rounded-full bg-accent-soft px-2.5 py-0.5 text-xs text-accent">
                        Opens <LocalTime date={q.opensAt} options={{ dateStyle: "medium" }} />
                      </span>
                    )}
                    {status === "closed" && (
                      <span className="shrink-0 rounded-full border border-border px-2.5 py-0.5 text-xs text-muted">Closed</span>
                    )}
                  </div>
                  {q.description && (
                    <p className="mt-1 line-clamp-2 text-sm text-muted">{stripMarkdown(q.description)}</p>
                  )}
                  <div className="mt-auto flex flex-wrap gap-2 pt-4 text-xs text-muted">
                    <Pill>{pooled ? q.questionPoolSize : q.questionCount} questions</Pill>
                    {!pooled && <Pill>{formatPoints(q.totalPoints)} pts</Pill>}
                    {q.timeLimitMinutes && <Pill>{q.timeLimitMinutes} min</Pill>}
                    {status === "open" && q.closesAt && (
                      <Pill>
                        Due <LocalTime date={q.closesAt} />
                      </Pill>
                    )}
                  </div>
                </Link>
              </li>
            );
          })}
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
