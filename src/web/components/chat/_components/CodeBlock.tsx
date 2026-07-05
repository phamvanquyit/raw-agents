import { Clipboard, ClipboardCheck } from "@solar-icons/react";
import { useState } from "react";
import SyntaxHighlighter from "react-syntax-highlighter";
import { atomOneDark } from "react-syntax-highlighter/dist/esm/styles/hljs";
import { MermaidBlock } from "./MermaidBlock";

// ── Language display labels ───────────────────────────────────────────────
const LANG_LABELS: Record<string, string> = {
  js: "JavaScript",
  javascript: "JavaScript",
  jsx: "JSX",
  ts: "TypeScript",
  typescript: "TypeScript",
  tsx: "TSX",
  py: "Python",
  python: "Python",
  sh: "Shell",
  bash: "Bash",
  zsh: "Zsh",
  shell: "Shell",
  json: "JSON",
  yaml: "YAML",
  yml: "YAML",
  toml: "TOML",
  html: "HTML",
  css: "CSS",
  sql: "SQL",
  md: "Markdown",
  markdown: "Markdown",
  rs: "Rust",
  rust: "Rust",
  go: "Go",
  java: "Java",
  cpp: "C++",
  c: "C",
  cs: "C#",
  csharp: "C#",
  php: "PHP",
  rb: "Ruby",
  ruby: "Ruby",
  swift: "Swift",
  kt: "Kotlin",
  kotlin: "Kotlin",
  graphql: "GraphQL",
  dockerfile: "Dockerfile",
  xml: "XML",
};

// ── Props ─────────────────────────────────────────────────────────────────
interface CodeBlockProps {
  language?: string;
  children: string;
}

export function CodeBlock({ language = "", children }: CodeBlockProps) {
  const [copied, setCopied] = useState(false);

  const lang = language.toLowerCase().trim();
  const isMermaid = lang === "mermaid";
  const label = isMermaid ? "Mermaid" : (LANG_LABELS[lang] ?? (lang || "Code"));

  const handleCopy = () => {
    navigator.clipboard.writeText(children).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  // Mermaid — completely separate block, no header
  if (isMermaid) {
    return <MermaidBlock>{children}</MermaidBlock>;
  }

  return (
    <div className="relative rounded-lg overflow-hidden bg-black/20 border border-white/5">
      {/* Label + Copy — floating inside code block */}
      <div className="flex items-center justify-between px-3 py-2 select-none border-b border-white/5">
        <span className="font-mono text-[11px] text-white/30">{label}</span>
        <button
          type="button"
          onClick={handleCopy}
          className="flex items-center justify-center w-5 h-5 rounded bg-transparent text-white/25 cursor-pointer transition-colors hover:text-white/60"
          title="Copy code"
        >
          {copied ? <ClipboardCheck size={13} /> : <Clipboard size={13} />}
        </button>
      </div>

      {/* Code */}
      <SyntaxHighlighter
        language={lang || "text"}
        style={atomOneDark}
        useInlineStyles
        wrapLongLines={false}
        PreTag="div"
        CodeTag="code"
        customStyle={{ fontSize: "12.5px", padding: "0", margin: 0, background: "transparent" }}
      >
        {children}
      </SyntaxHighlighter>
    </div>
  );
}
