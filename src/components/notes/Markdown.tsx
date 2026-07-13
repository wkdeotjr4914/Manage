import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";

/** Renders trusted internal markdown with GFM + code highlighting. */
export function Markdown({ children }: { children: string }) {
  return (
    <div className="prose-note">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeHighlight]}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
