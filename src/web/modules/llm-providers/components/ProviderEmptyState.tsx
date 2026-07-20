import { Key } from "@solar-icons/react";
import { Button } from "src/components/ui/button";

// ─── Provider Empty State ─────────────────────────────────────────────────────
// Shown when no AI providers have been configured yet.

interface ProviderEmptyStateProps {
  onAdd: () => void;
}

export function ProviderEmptyState({ onAdd }: ProviderEmptyStateProps) {
  return (
    <div className="flex flex-col items-center gap-3 py-10 text-center">
      <div className="w-12 h-12 rounded-md bg-muted border border-border flex items-center justify-center">
        <Key width={20} height={20} className="text-muted-foreground" />
      </div>
      <div>
        <p className="text-sm font-semibold text-foreground">No providers yet</p>
        <p className="text-xs text-muted-foreground mt-1">Add an AI provider to power your agents</p>
      </div>
      <Button variant="primary" size="sm" icon={<Key width={11} height={11} />} onClick={onAdd}>
        Add Your First Provider
      </Button>
    </div>
  );
}
