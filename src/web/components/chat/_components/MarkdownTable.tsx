import { Clipboard, ClipboardCheck } from "@solar-icons/react";
import { type ReactNode, useCallback, useRef, useState } from "react";

function escapeCell(text: string): string {
  return text.replace(/\|/g, "\\|").replace(/\n+/g, " ").trim();
}

function tableToMarkdown(table: HTMLTableElement): string {
  const rows = Array.from(table.querySelectorAll("tr"));
  const data = rows.map((tr) => Array.from(tr.querySelectorAll("th, td")).map((cell) => escapeCell(cell.textContent ?? "")));
  if (data.length === 0) return "";

  const colCount = Math.max(...data.map((row) => row.length));
  const pad = (row: string[]) => Array.from({ length: colCount }, (_, i) => row[i] ?? "");

  const header = pad(data[0]);
  const separator = header.map(() => "---");
  const body = data.slice(1).map(pad);

  return [`| ${header.join(" | ")} |`, `| ${separator.join(" | ")} |`, ...body.map((row) => `| ${row.join(" | ")} |`)].join("\n");
}

export function MarkdownTable({ children }: { children: ReactNode }) {
  const tableRef = useRef<HTMLTableElement>(null);
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(() => {
    const table = tableRef.current;
    if (!table) return;
    const markdown = tableToMarkdown(table);
    void navigator.clipboard.writeText(markdown).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    });
  }, []);

  return (
    <div className="relative my-3 rounded-lg overflow-hidden">
      <button
        type="button"
        onClick={handleCopy}
        className="absolute top-1.5 right-1.5 z-10 w-6 h-6 flex items-center justify-center rounded-md bg-card/80 border border-border text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
        title={copied ? "Copied" : "Copy as Markdown"}
      >
        {copied ? <ClipboardCheck size={12} /> : <Clipboard size={12} />}
      </button>

      <div className="overflow-x-auto hover-scrollbar">
        <table ref={tableRef} className="whitespace-nowrap">
          {children}
        </table>
      </div>
    </div>
  );
}
