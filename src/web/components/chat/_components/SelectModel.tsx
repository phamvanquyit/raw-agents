import AltArrowDown from "@solar-icons/react/arrows/AltArrowDown";
import { cn } from "src/common/lib/cn";
import { ModelPicker, shortModelName } from "src/components/ModelPicker";
import { ProviderIcon } from "src/modules/llm-providers/components/ProviderIcon";

interface SelectModelProps {
  providerId?: string | null;
  model?: string;
  onChange?: (providerId: string, model: string) => void;
}

export function SelectModel({ providerId, model, onChange }: SelectModelProps) {
  return (
    <ModelPicker
      selectedProviderId={providerId ?? null}
      selectedModel={model ?? ""}
      onChange={(pid, m) => onChange?.(pid, m)}
      className="w-fit"
      matchTriggerWidth={false}
      popoverSide="top"
      popoverClassName="w-72 h-80 p-0 overflow-hidden"
      renderTrigger={({ provider, model: selectedModel, open }) => (
        <button
          type="button"
          className={cn(
            "flex h-7 items-center gap-1.5 rounded-lg px-2 text-[11px] font-medium leading-none transition-all duration-150 cursor-pointer outline-none",
            open
              ? "bg-border/70 text-foreground"
              : selectedModel
                ? "text-muted-foreground hover:bg-border/60 hover:text-foreground"
                : "border border-dashed border-border text-muted-foreground hover:bg-muted hover:border-border",
          )}
        >
          {selectedModel && provider && <ProviderIcon provider={provider.provider} size={14} />}
          <span className="truncate text-[11px] font-medium leading-tight">{selectedModel ? shortModelName(selectedModel) : "Select model"}</span>
          <AltArrowDown
            width={9}
            height={9}
            className={cn("shrink-0 transition-transform duration-150", open ? "rotate-180 text-foreground" : "text-border-hover")}
          />
        </button>
      )}
    />
  );
}
