import type { Components } from "react-markdown";
import { isPendingMermaidBlock } from "../common/hasUnclosedMermaidFence";
import { CodeBlock } from "./CodeBlock";
import { MarkdownTable } from "./MarkdownTable";

/** Shared Tailwind prose classes for chat markdown (no CSS file). */
export const markdownRootClass =
  "font-[family-name:var(--font-family-chat)] text-[14px] leading-[1.75] break-words text-[#ebebeb] " +
  "[&_p]:m-0 [&_p]:mb-3 [&_p:last-child]:mb-0 " +
  "[&_h1]:mt-4 [&_h1]:mb-2 [&_h1]:text-[16px] [&_h1]:font-semibold [&_h1]:leading-normal " +
  "[&_h2]:mt-4 [&_h2]:mb-2 [&_h2]:text-[16px] [&_h2]:font-semibold [&_h2]:leading-normal " +
  "[&_h3]:mt-4 [&_h3]:mb-2 [&_h3]:text-[14px] [&_h3]:font-semibold [&_h3]:leading-normal " +
  "[&_h4]:mt-4 [&_h4]:mb-1.5 [&_h4]:text-[14px] [&_h4]:font-semibold [&_h4]:leading-normal " +
  "[&_h1:first-child]:mt-0 [&_h2:first-child]:mt-0 [&_h3:first-child]:mt-0 [&_h4:first-child]:mt-0 " +
  "[&_strong]:font-semibold [&_em]:italic " +
  "[&_blockquote]:my-3 [&_blockquote]:border-l-2 [&_blockquote]:border-primary/40 [&_blockquote]:py-1 [&_blockquote]:pl-3 [&_blockquote]:italic [&_blockquote]:text-tertiary-foreground " +
  "[&_ul]:mt-2 [&_ul]:mb-3 [&_ul]:list-disc [&_ul]:pl-6 " +
  "[&_ol]:mt-2 [&_ol]:mb-3 [&_ol]:list-decimal [&_ol]:pl-6 " +
  "[&_li]:mb-1.5 [&_li]:leading-[1.75] " +
  "[&_a]:text-primary [&_a]:underline [&_a]:underline-offset-[3px] [&_a]:decoration-primary/40 hover:[&_a]:decoration-primary/70";

export type MarkdownStreamState = {
  content: string;
  streaming: boolean;
};

/**
 * Build markdown components. Pass getState so pending-mermaid can update via ref
 * without recreating the components object (avoids remounting finished charts).
 */
export function createMarkdownComponents(getState?: () => MarkdownStreamState): Components {
  return {
    code({ className, children, ...props }) {
      const match = /language-(\w+)/.exec(className || "");
      const lang = match?.[1] ?? "";
      const codeText = String(children).replace(/\n$/, "");
      const isBlock = codeText.includes("\n") || !!match;

      if (isBlock) {
        const state = getState?.();
        const pendingMermaid = lang.toLowerCase() === "mermaid" && state ? isPendingMermaidBlock(state.content, codeText, state.streaming) : false;

        return (
          <CodeBlock language={lang} pendingMermaid={pendingMermaid}>
            {codeText}
          </CodeBlock>
        );
      }

      return (
        <span className="rounded-sm bg-white/10 px-1 py-0.5 text-[13px] leading-5" {...props}>
          {children}
        </span>
      );
    },
    hr() {
      return null;
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
}

export const markdownComponents: Components = createMarkdownComponents();
