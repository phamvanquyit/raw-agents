import { useRef, useState } from "react";

import { cn } from "src/common/lib/cn";
import RenderIf from "src/components/ui/RenderIf";
import { SelectModel } from "./SelectModel";

interface InputAreaProps {
  generating: boolean;
  placeholder: string;
  onSend: (text: string) => void;
  onCancel: () => void;
  providerId?: string | null;
  model?: string;
  onProviderChange?: (id: string) => void;
  onModelChange?: (model: string) => void;
  hideConfig?: boolean;
}

export function InputArea({ generating, placeholder, onSend, onCancel, providerId, model, onProviderChange, onModelChange, hideConfig }: InputAreaProps) {
  const [text, setText] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const hasText = text.trim().length > 0;

  const noModel = !hideConfig && !model;
  const canSend = !generating && !noModel;
  const sendEnabled = hasText && canSend;

  const handleSend = () => {
    if (!sendEnabled) return;
    onSend(text.trim());
    setText("");
    if (textareaRef.current) textareaRef.current.style.height = "auto";
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.nativeEvent.isComposing) return;
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div
      className={cn(
        "shrink-0 mx-2 mb-2 rounded-xl border overflow-hidden flex flex-col transition-all duration-150",
        noModel ? "bg-surface/60 border-border" : "bg-surface border-border",
      )}
    >
      {/* Textarea */}
      <textarea
        ref={textareaRef}
        data-chat-input
        rows={1}
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          e.target.style.height = "auto";
          e.target.style.height = `${Math.min(e.target.scrollHeight, 160)}px`;
        }}
        onKeyDown={handleKeyDown}
        disabled={generating || noModel}
        placeholder={noModel ? "Select a model to start chatting" : placeholder}
        className={cn(
          "w-full px-3 pt-3 pb-2 border-none outline-none resize-none text-[14px] leading-relaxed min-h-[22px] max-h-[120px] overflow-auto block chat-input-textarea transition-colors bg-transparent",
          noModel ? "text-muted cursor-not-allowed placeholder:text-border-hover" : "text-main placeholder:text-muted placeholder:font-normal",
        )}
      />

      {/* Bottom toolbar */}
      <div className="flex items-center gap-1.5 pb-2 px-2">
        {/* Model picker */}
        <RenderIf condition={!hideConfig}>
          <SelectModel providerId={providerId} model={model} onProviderChange={onProviderChange} onModelChange={onModelChange} />
        </RenderIf>

        <div className="flex-1" />

        {/* Send / Stop */}
        <RenderIf
          condition={generating}
          fallback={
            <button
              type="button"
              disabled={!sendEnabled}
              onClick={handleSend}
              title="Send (Enter)"
              className={[
                "w-7 h-7 rounded-lg flex items-center justify-center shrink-0 transition-all duration-100",
                sendEnabled
                  ? "bg-primary border border-primary-600 cursor-pointer hover:bg-primary-hover active:scale-95"
                  : "bg-border cursor-not-allowed opacity-50",
              ].join(" ")}
            >
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                <title>Send</title>
                <path
                  d="M6 9.5V2.5M6 2.5L3 5.5M6 2.5L9 5.5"
                  stroke={sendEnabled ? "#1a1a1a" : "currentColor"}
                  strokeWidth="1.6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
          }
        >
          <button
            type="button"
            onClick={onCancel}
            title="Stop"
            className="w-7 h-7 rounded-lg bg-surface-raised border border-border-hover flex items-center justify-center shrink-0 cursor-pointer hover:opacity-80 active:scale-95 transition-all duration-100"
          >
            <svg width="9" height="9" viewBox="0 0 9 9" fill="none">
              <title>Stop</title>
              <rect x="1" y="1" width="7" height="7" rx="1.5" fill="currentColor" />
            </svg>
          </button>
        </RenderIf>
      </div>
    </div>
  );
}
