import { AltArrowLeft, Magnifier } from "@solar-icons/react";
import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { apiClient } from "src/common/api";
import type { LlmProvider } from "src/common/types";
import { cn } from "src/lib/utils";
import { PROVIDER_META, fetchLlmProviders } from "src/modules/llm-providers/common/llmProvidersSlice";
import { ProviderIcon } from "src/modules/llm-providers/components/ProviderIcon";
import { useAppDispatch, useAppSelector } from "src/store/store";
import { Popover, PopoverContent, PopoverTrigger } from "./popover";

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Show only the part after the last `/` (e.g. "deepseek/deepseek-v4-flash" → "deepseek-v4-flash"). */
export function shortModelName(name: string) {
  return name.includes("/") ? (name.split("/").pop() as string) : name;
}

// ─── ModelPicker ──────────────────────────────────────────────────────────────
// Two-level popover: Level 1 = providers, Level 2 = models of selected provider.
// Providers are fetched from Redux store. Models are fetched on-demand per provider.
// Accepts an optional `renderTrigger` to customize the trigger button.

export interface ModelPickerProps {
  selectedProviderId: string | null;
  selectedModel: string;
  onChange: (providerId: string, model: string) => void;
  disabled?: boolean;
  placeholder?: string;
  /** Override the trigger element. Receives the current provider, model, and open state. */
  renderTrigger?: (ctx: { provider: LlmProvider | null; model: string; open: boolean }) => ReactNode;
  /** Props forwarded to PopoverContent for positioning. */
  popoverSide?: "top" | "bottom" | "left" | "right";
  popoverAlign?: "start" | "center" | "end";
  popoverClassName?: string;
}

type View = { level: "providers" } | { level: "models"; providerId: string };

export function ModelPicker({
  selectedProviderId,
  selectedModel,
  onChange,
  disabled = false,
  placeholder = "Select model…",
  renderTrigger,
  popoverSide,
  popoverAlign = "start",
  popoverClassName,
}: ModelPickerProps) {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<View>({ level: "providers" });
  const [search, setSearch] = useState("");
  const [focusedIndex, setFocusedIndex] = useState(0);
  const [activeModels, setActiveModels] = useState<string[]>([]);
  const [loadingModels, setLoadingModels] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const dispatch = useAppDispatch();
  const providers = useAppSelector((s) => s.llmProviders.items) as LlmProvider[];

  // Fetch providers on mount
  useEffect(() => {
    dispatch(fetchLlmProviders());
  }, [dispatch]);

  // Filter providers that have models
  const filteredProviders = useMemo(() => {
    return providers.filter((p) => (p as any).countModels > 0 || (p.models?.length ?? 0) > 0);
  }, [providers]);

  // When popover opens, decide which view to show
  const handleOpenChange = useCallback(
    (nextOpen: boolean) => {
      if (nextOpen) {
        setSearch("");
        setActiveModels([]);
        // If already selected a provider, go directly to its models
        if (selectedProviderId) {
          const provider = providers.find((p) => p.id === selectedProviderId);
          if (provider) {
            setView({ level: "models", providerId: selectedProviderId });
            fetchModelsForProvider(provider);
          } else {
            setView({ level: "providers" });
          }
        } else {
          setView({ level: "providers" });
        }
      } else {
        setActiveModels([]);
      }
      setOpen(nextOpen);
    },
    [selectedProviderId, providers],
  );

  // Fetch models for a specific provider
  const fetchModelsForProvider = async (provider: LlmProvider) => {
    setActiveModels([]);
    setLoadingModels(true);
    try {
      const models = (await apiClient.get(`/api/providers/${provider.id}/models`)) as string[];
      setActiveModels(models);
    } catch {
      setActiveModels([]);
    } finally {
      setLoadingModels(false);
    }
  };

  // Focus search when entering models view
  useEffect(() => {
    if (open && view.level === "models") {
      setTimeout(() => searchRef.current?.focus(), 80);
    }
  }, [open, view]);

  // Derive display values
  const selectedProvider = providers.find((p) => p.id === selectedProviderId) ?? null;
  const providerMeta = selectedProvider ? PROVIDER_META[selectedProvider.provider] : null;

  // Current view provider (for level 2)
  const viewProvider = view.level === "models" ? (providers.find((p) => p.id === view.providerId) ?? null) : null;
  const viewProviderMeta = viewProvider ? PROVIDER_META[viewProvider.provider] : null;

  // Filtered models from fetched activeModels
  const filteredModels = useMemo(() => {
    if (!search) return activeModels;
    return activeModels.filter((m) => m.toLowerCase().includes(search.toLowerCase()));
  }, [activeModels, search]);

  // Reset focused index when search changes
  useEffect(() => {
    setFocusedIndex(0);
  }, [search]);

  // Scroll focused item into view
  useEffect(() => {
    if (listRef.current && focusedIndex >= 0) {
      const items = listRef.current.querySelectorAll<HTMLButtonElement>("[data-model-item]");
      items[focusedIndex]?.scrollIntoView({ block: "nearest" });
    }
  }, [focusedIndex]);

  const handleSearchKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setFocusedIndex((prev) => (prev < filteredModels.length - 1 ? prev + 1 : prev));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setFocusedIndex((prev) => (prev > 0 ? prev - 1 : 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (filteredModels.length > 0 && focusedIndex >= 0 && focusedIndex < filteredModels.length) {
        handleSelectModel(filteredModels[focusedIndex]);
      }
    }
  };

  const handleSelectProvider = (provider: LlmProvider) => {
    setSearch("");
    setView({ level: "models", providerId: provider.id });
    fetchModelsForProvider(provider);
  };

  const handleSelectModel = (model: string) => {
    if (view.level === "models") {
      onChange(view.providerId, model);
      setOpen(false);
    }
  };

  const handleBack = () => {
    setSearch("");
    setActiveModels([]);
    setView({ level: "providers" });
  };

  // ── Trigger ──
  const defaultTrigger = (
    <button
      type="button"
      disabled={disabled}
      className={cn(
        "w-full h-field-md px-3 rounded-md text-sm text-left",
        "bg-surface border border-border",
        "flex items-center justify-between gap-2",
        "transition-all duration-150 cursor-pointer outline-none",
        open ? "border-primary" : "hover:border-border-hover",
        disabled && "bg-surface-raised text-muted border-border cursor-not-allowed",
      )}
    >
      {selectedProvider && selectedModel ? (
        <span className="flex items-center gap-2 min-w-0">
          <ProviderIcon provider={selectedProvider.provider} size={14} />
          <span className="text-muted text-xs shrink-0">{providerMeta?.label ?? selectedProvider.label}</span>
          <span className="text-muted/40 shrink-0">/</span>
          <span className="text-main truncate font-mono text-xs">{shortModelName(selectedModel)}</span>
        </span>
      ) : (
        <span className="text-muted">{placeholder}</span>
      )}
      <svg
        width={13}
        height={13}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        className={cn("shrink-0 text-muted transition-transform duration-150", open && "rotate-180")}
      >
        <path d="m6 9 6 6 6-6" />
      </svg>
    </button>
  );

  const resolvedPopoverClassName = popoverClassName ?? "w-[var(--radix-popover-trigger-width)] p-0 overflow-hidden";

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>{renderTrigger ? renderTrigger({ provider: selectedProvider, model: selectedModel, open }) : defaultTrigger}</PopoverTrigger>

      <PopoverContent side={popoverSide} align={popoverAlign} sideOffset={6} className={resolvedPopoverClassName}>
        {view.level === "providers" ? (
          /* ══ Level 1: Providers ══ */
          <div className="flex flex-col h-80">
            <div className="px-3 py-2.5 border-b border-border">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-muted">Select Provider</span>
            </div>
            <div onWheel={(e) => e.stopPropagation()} className="flex-1 min-h-0 overflow-y-auto py-1 game-scrollbar">
              {filteredProviders.map((p) => {
                const isActive = p.id === selectedProviderId;
                const modelCount = (p as any).countModels ?? p.models?.length ?? 0;
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => handleSelectProvider(p)}
                    className={cn(
                      "w-full px-3 py-2 text-left flex items-center gap-2.5 transition-colors duration-100 cursor-pointer",
                      isActive ? "bg-primary-50 text-primary" : "text-soft hover:bg-surface-raised",
                    )}
                  >
                    <div className="w-8 h-8 rounded-md bg-surface-raised border border-border flex items-center justify-center shrink-0">
                      <ProviderIcon provider={p.provider} size={16} />
                    </div>

                    <span className={cn("flex-1 font-medium truncate block", isActive && "text-primary")}>{p.label}</span>
                    <span className="block text-[10px] text-muted mt-0.5">
                      {modelCount} model{modelCount !== 1 ? "s" : ""}
                    </span>
                  </button>
                );
              })}
              {filteredProviders.length === 0 && (
                <div className="px-3 py-6 text-xs text-muted text-center">
                  No providers available.
                  <br />
                  <span className="text-muted/60">Go to Settings → API Providers</span>
                </div>
              )}
            </div>
          </div>
        ) : (
          /* ══ Level 2: Models ══ */
          <div className="flex flex-col h-80">
            {/* Header with back button */}
            <div
              onClick={handleBack}
              className="flex items-center gap-2 pr-3 pl-1 py-2 border-b border-border cursor-pointer hover:bg-surface-raised transition-colors"
            >
              <div className="w-6 h-6 rounded-md flex items-center justify-center text-muted">
                <AltArrowLeft size={14} />
              </div>

              {viewProvider && (
                <div className="flex items-center gap-2 min-w-0">
                  <ProviderIcon provider={viewProvider.provider} size={14} />
                  <span className="font-semibold text-sm text-main truncate">{viewProviderMeta?.label ?? viewProvider.label}</span>
                </div>
              )}
            </div>

            {/* Search */}
            {activeModels.length > 5 && (
              <div className="px-2.5 py-2 border-b border-border">
                <div className="relative">
                  <Magnifier size={13} className="absolute top-1/2 -translate-y-1/2 text-muted pointer-events-none" />
                  <input
                    ref={searchRef}
                    type="text"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    onKeyDown={handleSearchKeyDown}
                    placeholder="Search models…"
                    className="w-full h-7 pl-7 pr-2.5 rounded-md text-sm bg-surface text-main placeholder:text-muted outline-none transition-colors"
                  />
                </div>
              </div>
            )}

            {/* Model list */}
            <div ref={listRef} onWheel={(e) => e.stopPropagation()} className="flex-1 min-h-0 overflow-y-auto py-1 game-scrollbar">
              {loadingModels && <div className="px-3 py-4 text-xs text-muted text-center">Loading models…</div>}

              {!loadingModels &&
                filteredModels.map((m, idx) => {
                  const isActive = m === selectedModel && view.level === "models" && view.providerId === selectedProviderId;
                  const isFocused = idx === focusedIndex;
                  return (
                    <button
                      key={m}
                      type="button"
                      data-model-item
                      onClick={() => handleSelectModel(m)}
                      onMouseEnter={() => setFocusedIndex(idx)}
                      className={cn(
                        "w-full px-3 py-[7px] text-left text-sm truncate transition-colors duration-100 cursor-pointer",
                        isActive ? "bg-primary-50 text-primary font-medium" : isFocused ? "bg-surface-raised text-main" : "text-soft hover:bg-surface-raised",
                      )}
                      title={m}
                    >
                      {shortModelName(m)}
                    </button>
                  );
                })}
              {!loadingModels && filteredModels.length === 0 && (
                <div className="px-3 py-4 text-xs text-muted text-center">{search ? "No models match your search" : "No models available"}</div>
              )}
            </div>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
