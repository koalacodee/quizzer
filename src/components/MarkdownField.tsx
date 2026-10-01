"use client";

import { useRef } from "react";
import { Markdown } from "./Markdown";

type Snippet = { label: string; title: string; before: string; after?: string; placeholder?: string };

const SNIPPETS: Snippet[] = [
  { label: "B", title: "Bold", before: "**", after: "**", placeholder: "bold" },
  { label: "I", title: "Italic", before: "_", after: "_", placeholder: "italic" },
  { label: "</>", title: "Inline code", before: "`", after: "`", placeholder: "code" },
  { label: "∑", title: "Inline math  $…$", before: "$", after: "$", placeholder: "x^2" },
  { label: "∫∫", title: "Block math  $$…$$", before: "\n$$\n", after: "\n$$\n", placeholder: "\\int_0^1 x\\,dx" },
  { label: "{ }", title: "Code block", before: "\n```python\n", after: "\n```\n", placeholder: "print('hi')" },
];

/** Textarea for Markdown + LaTeX with a tiny toolbar and live preview. */
export function MarkdownField({
  value,
  onChange,
  placeholder,
  rows = 4,
  compact = false,
  preview = true,
  id,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  rows?: number;
  /** Single-line-ish variant for answer choices. */
  compact?: boolean;
  preview?: boolean;
  id?: string;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);

  const insert = (s: Snippet) => {
    const el = ref.current;
    if (!el) return;
    const { selectionStart: a, selectionEnd: b } = el;
    const selected = value.slice(a, b) || s.placeholder || "";
    const after = s.after ?? "";
    const next = value.slice(0, a) + s.before + selected + after + value.slice(b);
    onChange(next);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(a + s.before.length, a + s.before.length + selected.length);
    });
  };

  // Only show compact previews when there is something to render.
  const showPreview = preview && value.trim() !== "" && (!compact || /[$*_`#\\[\]|]/.test(value));

  return (
    <div className="space-y-2">
      <div className="overflow-hidden rounded-xl border border-border bg-surface transition focus-within:border-accent focus-within:ring-2 focus-within:ring-accent/20">
        {!compact && (
          <div className="flex gap-0.5 border-b border-border bg-background px-1.5 py-1">
            {SNIPPETS.map((s) => (
              <button
                key={s.title}
                type="button"
                title={s.title}
                onClick={() => insert(s)}
                className="rounded-md px-2 py-0.5 font-mono text-xs text-muted hover:bg-surface hover:text-foreground"
              >
                {s.label}
              </button>
            ))}
          </div>
        )}
        <textarea
          id={id}
          ref={ref}
          value={value}
          rows={compact ? 1 : rows}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
          className={`block w-full resize-y bg-transparent px-3 py-2 text-sm outline-none ${
            compact ? "min-h-[2.4rem]" : "font-mono"
          }`}
        />
      </div>
      {showPreview && (
        <div className={`rounded-xl border border-dashed border-border px-3 py-2 text-sm ${compact ? "" : "bg-background"}`}>
          <Markdown inline={compact}>{value}</Markdown>
        </div>
      )}
    </div>
  );
}
