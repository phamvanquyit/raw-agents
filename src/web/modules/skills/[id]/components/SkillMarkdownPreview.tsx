import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { markdownComponents } from "src/components/chat/_components/markdown";
import { parseSkillFrontmatter } from "../../common/frontmatter";

const previewRootClass =
  "break-words text-[15px] leading-7 text-foreground " +
  "[&_p]:m-0 [&_p]:mb-4 [&_p:last-child]:mb-0 " +
  "[&_h1]:mt-8 [&_h1]:mb-3 [&_h1]:text-[22px] [&_h1]:font-semibold [&_h1]:leading-8 " +
  "[&_h2]:mt-7 [&_h2]:mb-2.5 [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:leading-7 " +
  "[&_h3]:mt-6 [&_h3]:mb-2 [&_h3]:text-base [&_h3]:font-semibold [&_h3]:leading-6 " +
  "[&_h4]:mt-5 [&_h4]:mb-1.5 [&_h4]:text-sm [&_h4]:font-semibold " +
  "[&_h1:first-child]:mt-0 [&_h2:first-child]:mt-0 [&_h3:first-child]:mt-0 [&_h4:first-child]:mt-0 " +
  "[&_strong]:font-semibold [&_em]:italic " +
  "[&_blockquote]:my-4 [&_blockquote]:border-l-2 [&_blockquote]:border-brand/40 [&_blockquote]:py-1 [&_blockquote]:pl-4 [&_blockquote]:text-muted-foreground " +
  "[&_ul]:mt-2 [&_ul]:mb-4 [&_ul:not(.contains-task-list)]:list-disc [&_ul:not(.contains-task-list)]:pl-6 " +
  "[&_ul.contains-task-list]:list-none [&_ul.contains-task-list]:pl-0 " +
  "[&_ol]:mt-2 [&_ol]:mb-4 [&_ol]:list-decimal [&_ol]:pl-6 " +
  "[&_li]:mb-1.5 [&_li]:leading-7 " +
  "[&_li.task-list-item]:flex [&_li.task-list-item]:items-start [&_li.task-list-item]:gap-2 " +
  "[&_li.task-list-item>input]:mt-1.5 [&_li.task-list-item>input]:size-3.5 [&_li.task-list-item>input]:shrink-0 [&_li.task-list-item>input]:accent-brand " +
  "[&_a]:text-link [&_a]:underline [&_a]:underline-offset-[3px] [&_a]:decoration-link/40 hover:[&_a]:decoration-link/70";

const previewComponents = {
  ...markdownComponents,
  hr() {
    return <hr className="my-6 border-border" />;
  },
};

interface SkillMarkdownPreviewProps {
  content: string;
  showFrontmatter?: boolean;
}

export function SkillMarkdownPreview({ content, showFrontmatter = false }: SkillMarkdownPreviewProps) {
  const parsed = showFrontmatter ? parseSkillFrontmatter(content) : { frontmatter: {}, body: content, hasFrontmatter: false };
  const name = parsed.frontmatter.name?.trim();
  const description = parsed.frontmatter.description?.trim();
  const body = parsed.hasFrontmatter ? parsed.body : content;

  return (
    <article className="mx-auto w-full max-w-2xl px-6 py-8">
      {parsed.hasFrontmatter ? (
        <header className="mb-8 border-b border-border pb-6">
          {name ? <h1 className="m-0 text-[22px] font-semibold leading-8 text-foreground">{name}</h1> : null}
          {description ? <p className="m-0 mt-2 text-[15px] leading-6 text-muted-foreground">{description}</p> : null}
        </header>
      ) : null}
      {body.trim() ? (
        <div className={previewRootClass}>
          <ReactMarkdown remarkPlugins={[remarkGfm]} components={previewComponents}>
            {body}
          </ReactMarkdown>
        </div>
      ) : (
        <p className="m-0 text-sm text-muted-foreground">This file is empty.</p>
      )}
    </article>
  );
}
