import { FullScreen, QuitFullScreen } from "@solar-icons/react";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { sanitizeMermaid } from "../common/sanitizeMermaid";

interface MermaidBlockProps {
  children: string;
}

export function MermaidBlock({ children }: MermaidBlockProps) {
  const id = useId().replace(/:/g, "_");
  const containerRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const fullscreenRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [svgContent, setSvgContent] = useState<string>("");

  // Pan/zoom state — use refs for drag perf (no re-render per mousemove)
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const dragRef = useRef({ active: false, startX: 0, startY: 0, panX: 0, panY: 0 });
  const [isDragging, setIsDragging] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const render = async () => {
      // Dynamic import — mermaid is only loaded when a mermaid block appears
      const { default: mermaid } = await import("mermaid");
      mermaid.initialize({
        startOnLoad: false,
        theme: "default",
        fontFamily: '"Geist Variable", "Geist", ui-sans-serif, -apple-system, "system-ui", "Segoe UI", Helvetica, Arial, sans-serif',
      });

      const raw = children.trim();

      // Attempt 1: render raw input
      try {
        const { svg } = await mermaid.render(`mermaid-${id}`, raw);
        if (!cancelled) {
          setSvgContent(svg);
          if (containerRef.current) containerRef.current.innerHTML = svg;
          setError(null);
        }
        return;
      } catch {
        // raw failed — clean up orphaned DOM from failed render, then try sanitized
        document.getElementById(`dmermaid-${id}`)?.remove();
      }

      // Attempt 2: sanitize then render
      const sanitized = sanitizeMermaid(raw);
      try {
        const renderId = `mermaid-${id}-s`;
        // Clean up any leftover element from failed render
        document.getElementById(renderId)?.remove();
        const { svg } = await mermaid.render(renderId, sanitized);
        if (!cancelled) {
          setSvgContent(svg);
          if (containerRef.current) containerRef.current.innerHTML = svg;
          setError(null);
        }
      } catch (err) {
        if (!cancelled) {
          setError(String(err));
        }
      }
    };

    render();
    return () => {
      cancelled = true;
    };
  }, [children, id]);

  const resetView = useCallback(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, []);

  const openFullscreen = () => {
    if (dialogRef.current && fullscreenRef.current) {
      fullscreenRef.current.innerHTML = svgContent;
      resetView();
      dialogRef.current.showModal();
    }
  };

  const closeFullscreen = () => {
    dialogRef.current?.close();
    resetView();
  };

  // --- Zoom via scroll wheel ---
  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setZoom((prev) => {
      const delta = e.deltaY > 0 ? 0.9 : 1.1;
      return Math.min(5, Math.max(0.3, prev * delta));
    });
  }, []);

  // --- Drag to pan ---
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    // Ignore clicks on buttons/controls
    if ((e.target as HTMLElement).closest("button")) return;
    e.preventDefault();
    dragRef.current = {
      active: true,
      startX: e.clientX,
      startY: e.clientY,
      panX: 0, // will be set in effect
      panY: 0,
    };
    setIsDragging(true);
    // Snapshot current pan via closure
    setPan((prev) => {
      dragRef.current.panX = prev.x;
      dragRef.current.panY = prev.y;
      return prev;
    });
  }, []);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    const d = dragRef.current;
    if (!d.active) return;
    e.preventDefault();
    const dx = e.clientX - d.startX;
    const dy = e.clientY - d.startY;
    setPan({ x: d.panX + dx, y: d.panY + dy });
  }, []);

  const handleMouseUp = useCallback(() => {
    dragRef.current.active = false;
    setIsDragging(false);
  }, []);

  // Clean up drag if mouse leaves viewport
  const handleMouseLeave = useCallback(() => {
    if (dragRef.current.active) {
      dragRef.current.active = false;
      setIsDragging(false);
    }
  }, []);

  const isDefaultView = zoom === 1 && pan.x === 0 && pan.y === 0;

  if (error) {
    return (
      <div className="my-3.5 rounded-xl bg-primary-50 border border-danger/30 p-4 text-xs text-danger">
        <p className="font-medium mb-1">Mermaid render error</p>
        <pre className="whitespace-pre-wrap text-[11px] opacity-70">{error}</pre>
      </div>
    );
  }

  return (
    <>
      <div className="my-3.5 last:mb-0 group relative rounded-xl border border-border/60 bg-surface overflow-hidden">
        {/* Fullscreen button — top right */}
        <button
          type="button"
          onClick={openFullscreen}
          className="absolute top-2 right-2 z-10 flex items-center gap-1 px-2 py-1 rounded-lg bg-surface border border-border text-muted text-xs cursor-pointer opacity-0 group-hover:opacity-100 transition-opacity hover:text-primary hover:border-primary/30"
          title="Fullscreen"
        >
          <FullScreen size={14} />
        </button>

        {/* Mermaid diagram */}
        <div
          ref={containerRef}
          className="flex justify-center p-6 overflow-x-auto [scrollbar-width:thin] [scrollbar-color:#d1cfc5_transparent] [&_svg]:max-w-full"
        />
      </div>

      {/* Fullscreen dialog */}
      <dialog
        ref={dialogRef}
        className="m-0 p-0 w-screen h-screen max-w-none max-h-none bg-surface backdrop:bg-black/40 open:flex open:flex-col"
        onKeyDown={(e) => {
          if (e.key === "Escape") closeFullscreen();
        }}
      >
        <button
          type="button"
          onClick={closeFullscreen}
          className="fixed top-5 right-5 z-50 flex items-center gap-1.5 px-3 py-2 rounded-xl bg-surface border border-border text-soft text-sm cursor-pointer shadow-md hover:text-primary hover:border-primary/30 transition-colors"
          title="Exit fullscreen"
        >
          <QuitFullScreen size={16} />
          <span>Exit</span>
        </button>

        {/* Zoom indicator */}
        <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 px-3 py-1.5 rounded-full bg-surface border border-border text-xs text-soft shadow-md select-none">
          <span>{Math.round(zoom * 100)}%</span>
          {!isDefaultView && (
            <button type="button" onClick={resetView} className="text-muted hover:text-primary cursor-pointer transition-colors">
              Reset
            </button>
          )}
        </div>

        {/* Pan/zoom viewport — clips content, captures drag */}
        <div
          ref={viewportRef}
          onWheel={handleWheel}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseLeave}
          onDoubleClick={resetView}
          className={`flex-1 overflow-hidden w-full h-full select-none ${isDragging ? "cursor-grabbing" : "cursor-grab"}`}
        >
          {/* Inner content — positioned via translate + scale */}
          <div
            ref={fullscreenRef}
            className="flex items-center justify-center w-full h-full origin-center [&_svg]:max-w-none [&_svg]:max-h-none pointer-events-none"
            style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})` }}
          />
        </div>
      </dialog>
    </>
  );
}
