"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { deleteQuiz, duplicateQuiz, setPublished } from "./actions";

export function QuizRowActions({ id, title, published }: { id: string; title: string; published: boolean }) {
  const [pending, start] = useTransition();
  const [copied, setCopied] = useState(false);

  const copyLink = async () => {
    await navigator.clipboard.writeText(`${window.location.origin}/quiz/${id}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const item = "rounded-lg px-2 py-1 text-xs text-muted transition hover:bg-background hover:text-foreground disabled:opacity-50";

  return (
    <div className="flex flex-wrap justify-end gap-0.5 whitespace-nowrap">
      <button className={item} disabled={pending} onClick={() => start(() => setPublished(id, !published))}>
        {published ? "Unpublish" : "Publish"}
      </button>
      <Link className={item} href={`/quiz/${id}`} target="_blank">Preview</Link>
      <button className={item} onClick={copyLink}>{copied ? "Copied!" : "Copy link"}</button>
      <Link className={item} href={`/admin/quizzes/${id}/share`}>Share</Link>
      <Link className={item} href={`/admin/quizzes/${id}`}>Edit</Link>
      <a className={item} href={`/api/admin/quizzes/${id}/export`} download>Export</a>
      <button className={item} disabled={pending} onClick={() => start(() => duplicateQuiz(id))}>Duplicate</button>
      <button
        className={`${item} hover:!text-danger`}
        disabled={pending}
        onClick={() => {
          if (confirm(`Delete "${title}" and all its attempts? This cannot be undone.`)) start(() => deleteQuiz(id));
        }}
      >
        Delete
      </button>
    </div>
  );
}
