import { AltArrowDown } from "@solar-icons/react";
import { cn } from "src/common/lib/cn";
import { ModelPicker, shortModelName } from "src/components/ModelPicker";
import { ProviderIcon } from "src/modules/llm-providers/components/ProviderIcon";

interface SelectModelProps {
  providerId?: string | null;
  model?: string;
  onProviderChange?: (id: string) => void;
  onModelChange?: (model: string) => void;
}

export function SelectModel({ providerId, model, onProviderChange, onModelChange }: SelectModelProps) {
  return (
    <ModelPicker
      selectedProviderId={providerId ?? null}
      selectedModel={model ?? ""}
      onChange={(pid, m) => {
        onProviderChange?.(pid);
        onModelChange?.(m);
      }}
      popoverSide="top"
      popoverClassName="w-72 h-80 p-0 overflow-hidden"
      renderTrigger={({ provider, model: selectedModel }) => (
        <button
          type="button"
          className={cn(
            "flex items-center gap-1.5 text-[11px] font-medium transition-all duration-150 cursor-pointer",
            selectedModel
              ? "px-2 py-1 rounded-lg text-muted-foreground hover:bg-border/60 hover:text-foreground"
              : "px-2 py-1 rounded-lg border border-dashed border-border text-muted-foreground hover:bg-muted hover:border-border",
          )}
        >
          {selectedModel && provider && <ProviderIcon provider={provider.provider} size={14} />}
          <span className="truncate text-[11px] font-medium leading-tight">{selectedModel ? shortModelName(selectedModel) : "Select model"}</span>
          <AltArrowDown width={9} height={9} className="text-border-hover shrink-0" />
        </button>
      )}
    />
  );
}
