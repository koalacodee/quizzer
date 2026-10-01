import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import rehypeHighlight from "rehype-highlight";

const remarkPlugins = [remarkGfm, remarkMath];
const rehypePlugins = [[rehypeKatex, { throwOnError: false, strict: false }], rehypeHighlight] as const;

/** Renders Markdown with GFM, LaTeX math ($…$ / $$…$$) and code highlighting. */
export function Markdown({
  children,
  className = "",
  inline = false,
}: {
  children: string;
  className?: string;
  /** Compact variant for short snippets such as answer choices. */
  inline?: boolean;
}) {
  return (
    <div className={`prose-quiz ${inline ? "prose-inline" : ""} ${className}`}>
      <ReactMarkdown
        remarkPlugins={remarkPlugins}
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        rehypePlugins={rehypePlugins as any}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
