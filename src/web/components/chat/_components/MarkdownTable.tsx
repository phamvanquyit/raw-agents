import { type ReactNode, useState } from "react";
import { createPortal } from "react-dom";
import RenderIf from "src/components/ui/RenderIf";

// ─── Fullscreen overlay ───────────────────────────────────────────────────────

function TableFullscreen({
  children,
  onClose,
}: {
  children: ReactNode;
  onClose: () => void;
}) {
  return createPortal(
    <div className="fixed inset-0 z-[9999] flex flex-col bg-surface" onClick={onClose}>
      {/* Close button — fixed top-right */}
      <div className="flex-none flex items-center justify-end px-4 py-2 border-b border-border">
        <button
          type="button"
          onClick={onClose}
          className="w-7 h-7 flex items-center justify-center rounded-lg text-muted hover:text-main hover:bg-surface-raised transition-colors"
          title="Close"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
            <path d="M2 2l10 10M12 2L2 12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
        </button>
      </div>

      {/* Scrollable table area — 2-directional scroll */}
      <div className="flex-1 overflow-auto p-4 ca-markdown text-sm" onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>,
    document.body,
  );
}

// ─── MarkdownTable wrapper ────────────────────────────────────────────────────

export function MarkdownTable({ children }: { children: ReactNode }) {
  const [fullscreen, setFullscreen] = useState(false);

  return (
    <>
      <div className="relative my-3 rounded-lg overflow-hidden">
        {/* Fullscreen button */}
        <button
          type="button"
          onClick={() => setFullscreen(true)}
          className="absolute top-1.5 right-1.5 z-10 w-6 h-6 flex items-center justify-center rounded-md bg-surface/80 border border-border text-muted hover:text-main hover:bg-surface-raised transition-colors"
          title="Fullscreen"
        >
          <svg width="11" height="11" viewBox="0 0 11 11" fill="none" aria-hidden="true">
            <path d="M1 4V1h3M7 1h3v3M10 7v3H7M4 10H1V7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>

        {/* Scrollable table */}
        <div className="overflow-x-auto hover-scrollbar">
          <table className="whitespace-nowrap">{children}</table>
        </div>
      </div>

      <RenderIf condition={fullscreen}>
        <TableFullscreen onClose={() => setFullscreen(false)}>
          <table>{children}</table>
        </TableFullscreen>
      </RenderIf>
    </>
  );
}
