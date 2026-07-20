import type { Components } from "react-markdown";
import { CodeBlock } from "./CodeBlock";
import { MarkdownTable } from "./MarkdownTable";

/** Shared Tailwind prose classes for chat markdown (no CSS file). */
export const markdownRootClass =
  "font-[family-name:var(--font-family-chat)] text-[14px] leading-[1.75] break-words text-foreground " +
  "[&_p]:m-0 [&_p]:mb-2 [&_p:last-child]:mb-0 " +
  "[&_h1]:mt-4 [&_h1]:mb-2 [&_h1]:text-[16px] [&_h1]:font-semibold [&_h1]:leading-snug " +
  "[&_h2]:mt-4 [&_h2]:mb-2 [&_h2]:text-[16px] [&_h2]:font-semibold [&_h2]:leading-snug " +
  "[&_h3]:mt-4 [&_h3]:mb-2 [&_h3]:text-[16px] [&_h3]:font-semibold [&_h3]:leading-snug " +
  "[&_h4]:mt-4 [&_h4]:mb-2 [&_h4]:text-[14px] [&_h4]:font-semibold [&_h4]:leading-snug " +
  "[&_h1:first-child]:mt-0 [&_h2:first-child]:mt-0 [&_h3:first-child]:mt-0 [&_h4:first-child]:mt-0 " +
  "[&_strong]:font-semibold [&_em]:italic [&_em]:text-tertiary-foreground " +
  "[&_blockquote]:my-3 [&_blockquote]:border-l-2 [&_blockquote]:border-primary/40 [&_blockquote]:py-1 [&_blockquote]:pl-2.5 [&_blockquote]:italic [&_blockquote]:text-tertiary-foreground " +
  "[&_ul]:my-2 [&_ul]:mb-4 [&_ul]:list-disc [&_ul]:pl-6 " +
  "[&_ol]:my-2 [&_ol]:mb-4 [&_ol]:list-decimal [&_ol]:pl-6 " +
  "[&_li]:mb-1.5 [&_li]:leading-[1.7] " +
  "[&_hr]:my-4 [&_hr]:border-0 " +
  "[&_a]:text-primary [&_a]:underline [&_a]:underline-offset-[3px] [&_a]:decoration-primary/40 hover:[&_a]:decoration-primary/70";

export const markdownComponents: Components = {
  code({ className, children, ...props }) {
    const match = /language-(\w+)/.exec(className || "");
    const lang = match?.[1] ?? "";
    const codeText = String(children).replace(/\n$/, "");
    const isBlock = codeText.includes("\n") || !!match;

    if (isBlock) {
      return <CodeBlock language={lang}>{codeText}</CodeBlock>;
    }

    return (
      <code className="rounded-[5px] bg-muted px-1.5 py-px font-[family-name:var(--font-family-mono)] text-[13px]" {...props}>
        {children}
      </code>
    );
  },
  table({ children }) {
    return <MarkdownTable>{children}</MarkdownTable>;
  },
  a({ href, children, ...props }) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" {...props}>
        {children}
      </a>
    );
  },
};
