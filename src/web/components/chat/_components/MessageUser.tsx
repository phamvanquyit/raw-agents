import { AltArrowDown, AltArrowUp } from "@solar-icons/react";
import { useEffect, useRef, useState } from "react";
import type { ChatAgentMessage } from "../common/types";

const MAX_HEIGHT = 150;

interface MessageUserProps {
  msg: ChatAgentMessage;
}

export function MessageUser({ msg }: MessageUserProps) {
  const contentRef = useRef<HTMLDivElement>(null);
  const [isOverflow, setIsOverflow] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);

  useEffect(() => {
    const el = contentRef.current;
    if (el) {
      setIsOverflow(el.scrollHeight > MAX_HEIGHT);
    }
  }, [msg.content]);

  return (
    <div className="ca-fade-in mt-5">
      {/* Message row */}
      <div className="flex items-start gap-3 px-4 pt-3 pb-2">
        {/* Left: tag + message */}
        <div className="flex-1 min-w-0 flex flex-col bg-[#6b9a4a]/10 px-4 py-2.5 rounded-lg border border-primary/50">
          {/* Message text */}
          <div
            ref={contentRef}
            className="relative overflow-hidden transition-[max-height] duration-300 ease-in-out"
            style={{ maxHeight: isExpanded || !isOverflow ? "none" : `${MAX_HEIGHT}px` }}
          >
            <span className="text-sm text-main whitespace-pre-wrap wrap-break-word">{msg.content}</span>
            {/* Gradient fade overlay */}
            {isOverflow && !isExpanded && (
              <div className="absolute bottom-0 left-0 right-0 h-10 bg-gradient-to-t from-[#6b9a4a]/10 to-transparent pointer-events-none" />
            )}
          </div>
          {/* Expand / Collapse button */}
          {isOverflow && (
            <button
              type="button"
              onClick={() => setIsExpanded((v) => !v)}
              className="flex items-center gap-1 mt-1 text-xs text-primary/70 hover:text-primary transition-colors cursor-pointer self-start"
            >
              {isExpanded ? (
                <>
                  <AltArrowUp className="size-3.5" />
                  Show less
                </>
              ) : (
                <>
                  <AltArrowDown className="size-3.5" />
                  Show more
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
