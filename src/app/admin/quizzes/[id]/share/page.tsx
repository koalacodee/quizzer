import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import QRCode from "qrcode";
import { requireAdmin } from "@/lib/auth";
import { getQuizFull } from "@/lib/quizzes";
import { CopyButton } from "./CopyButton";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Share quiz" };

async function origin() {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

export default async function SharePage(props: PageProps<"/admin/quizzes/[id]/share">) {
  await requireAdmin();
  const quiz = await getQuizFull((await props.params).id);
  if (!quiz) notFound();

  const base = await origin();
  const shortUrl = `${base}/q/${quiz.shortCode}`;
  const fullUrl = `${base}/quiz/${quiz.id}`;
  // qrcode emits a self-contained SVG string from our own URL, so inlining it is safe.
  const svg = await QRCode.toString(shortUrl, { type: "svg", margin: 1, errorCorrectionLevel: "M" });
  const { present } = await props.searchParams;

  if (present !== undefined) {
    return (
      <div className="fixed inset-0 z-30 flex flex-col items-center justify-center gap-6 bg-white p-6 text-center text-stone-900">
        <h1 className="text-3xl font-semibold sm:text-5xl">{quiz.title}</h1>
        <div className="w-[min(70vh,80vw)] [&_svg]:h-auto [&_svg]:w-full" dangerouslySetInnerHTML={{ __html: svg }} />
        <p className="font-mono text-2xl sm:text-4xl">{shortUrl.replace(/^https?:\/\//, "")}</p>
        <Link href={`/admin/quizzes/${quiz.id}/share`} className="text-sm text-stone-500 underline">
          Exit presentation
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <Link href="/admin" className="text-sm text-muted hover:text-foreground">← All quizzes</Link>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">Share “{quiz.title}”</h1>
        {!quiz.published && (
          <p className="mt-2 rounded-xl border border-warn/40 bg-warn-soft px-4 py-2 text-sm text-warn">
            This quiz is a draft — publish it before sharing, or students will see “not found”.
          </p>
        )}
      </div>
      <div className="grid gap-6 md:grid-cols-[18rem_1fr]">
        <div className="card p-4">
          <div className="rounded-xl bg-white p-2 [&_svg]:h-auto [&_svg]:w-full" dangerouslySetInnerHTML={{ __html: svg }} />
        </div>
        <div className="card space-y-5 p-6">
          <div>
            <span className="label">Short link</span>
            <div className="flex gap-2">
              <input readOnly value={shortUrl} className="input font-mono" aria-label="Short link" />
              <CopyButton text={shortUrl} />
            </div>
          </div>
          <div>
            <span className="label">Full link</span>
            <div className="flex gap-2">
              <input readOnly value={fullUrl} className="input font-mono text-xs" aria-label="Full link" />
              <CopyButton text={fullUrl} />
            </div>
          </div>
          <Link href={`/admin/quizzes/${quiz.id}/share?present`} className="btn-primary inline-flex">
            Present full screen
          </Link>
        </div>
      </div>
    </div>
  );
}
