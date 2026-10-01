"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { importQuizzes } from "../actions";

export function ImportForm() {
  const [json, setJson] = useState("");
  const [errors, setErrors] = useState<string[]>([]);
  const [imported, setImported] = useState<string[] | null>(null);
  const [pending, start] = useTransition();
  const [dragging, setDragging] = useState(false);

  const readFile = async (file: File | undefined) => {
    if (!file) return;
    setJson(await file.text());
    setErrors([]);
    setImported(null);
  };

  const submit = () =>
    start(async () => {
      setErrors([]);
      setImported(null);
      const res = await importQuizzes(json);
      if ("errors" in res) setErrors(res.errors);
      else {
        setImported(res.ids);
        setJson("");
      }
    });

  return (
    <div className="space-y-4">
      <label
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          readFile(e.dataTransfer.files[0]);
        }}
        className={`flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed px-6 py-8 text-center text-sm transition ${
          dragging ? "border-accent bg-accent-soft" : "border-border hover:border-accent/60"
        }`}
      >
        <span className="font-medium">Drop a .json file here, or click to choose</span>
        <span className="mt-1 text-muted">…or paste JSON below</span>
        <input type="file" accept="application/json,.json" className="sr-only" onChange={(e) => readFile(e.target.files?.[0])} />
      </label>

      <textarea
        className="input min-h-80 font-mono text-xs"
        placeholder='{ "title": "…", "questions": [ … ] }'
        value={json}
        onChange={(e) => setJson(e.target.value)}
        spellCheck={false}
      />

      {errors.length > 0 && (
        <div className="rounded-xl border border-danger/40 bg-danger-soft p-4 text-sm text-danger">
          <p className="font-medium">Import failed</p>
          <ul className="mt-2 list-disc space-y-0.5 pl-5">
            {errors.map((e, i) => <li key={i}>{e}</li>)}
          </ul>
        </div>
      )}
      {imported && (
        <div className="rounded-xl border border-success/40 bg-success-soft p-4 text-sm text-success">
          Imported {imported.length} quiz{imported.length === 1 ? "" : "zes"}.{" "}
          {imported.length === 1 ? (
            <Link href={`/admin/quizzes/${imported[0]}`} className="underline">Open in editor</Link>
          ) : (
            <Link href="/admin" className="underline">Back to all quizzes</Link>
          )}
        </div>
      )}

      <button className="btn-primary" disabled={pending || !json.trim()} onClick={submit}>
        {pending ? "Importing…" : "Import"}
      </button>
    </div>
  );
}
