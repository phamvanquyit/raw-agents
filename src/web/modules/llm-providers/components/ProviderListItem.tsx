import { AltArrowDown, AltArrowUp, Eye, EyeClosed, Refresh } from "@solar-icons/react";
import { Button, Form, Input, Modal } from "antd";

import { useEffect, useState } from "react";
import { apiClient } from "src/common/api";
import type { LlmProvider } from "src/common/types";
import { PROVIDER_META, deleteLlmProvider, refreshModels, updateLlmProvider } from "src/modules/llm-providers/common/llmProvidersSlice";
import { useAppDispatch } from "src/store/store";
import { ProviderIcon } from "./ProviderIcon";

interface ProviderListItemProps {
  item: LlmProvider;
}

function maskKey(key?: string) {
  if (!key) return "";
  if (key.length > 8) return `${key.slice(0, 4)}••••${key.slice(-4)}`;
  return "••••••••";
}

export function ProviderListItem({ item }: ProviderListItemProps) {
  const dispatch = useAppDispatch();

  const [expanded, setExpanded] = useState(false);
  const [showKey, setShowKey] = useState(false);
  const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const [detail, setDetail] = useState<LlmProvider | null>(null);
  const [draft, setDraft] = useState({
    label: item.label,
    apiKey: "",
    customBaseUrl: "",
  });

  const meta = PROVIDER_META[item.provider] ?? PROVIDER_META.custom;
  const models: string[] = Array.isArray(detail?.models) ? detail.models : [];
  const modelCount = models.length || (item as any).countModels || 0;

  useEffect(() => {
    if (expanded && !detail) {
      apiClient.get<LlmProvider>(`/api/providers/${item.id}`).then((res) => {
        setDetail(res);
        setDraft({
          label: res.label,
          apiKey: res.apiKey ?? "",
          customBaseUrl: res.customBaseUrl ?? "",
        });
      });
    }
  }, [expanded, detail, item.id]);

  const handleSave = async () => {
    if (!draft.label.trim() || !draft.apiKey.trim()) return;
    setSaving(true);
    try {
      await dispatch(updateLlmProvider({ id: item.id, ...draft })).unwrap();
      setExpanded(false);
    } catch (err: unknown) {
      console.error(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  const handleDiscard = () => {
    setDraft({
      label: detail?.label ?? item.label,
      apiKey: detail?.apiKey ?? "",
      customBaseUrl: detail?.customBaseUrl ?? "",
    });
    setShowKey(false);
    setExpanded(false);
  };

  const handleRefreshModels = async () => {
    setRefreshing(true);
    setRefreshError(null);
    try {
      await dispatch(refreshModels(item.id)).unwrap();
    } catch (err) {
      setRefreshError(err instanceof Error ? err.message : String(err));
    } finally {
      setRefreshing(false);
    }
  };

  const handleDelete = () => {
    Modal.confirm({
      title: "Delete this item?",
      content: `Remove "${item.label}" and all its configuration.`,
      okText: "Delete",
      okButtonProps: { danger: true },
      cancelText: "Cancel",
      onOk: () => dispatch(deleteLlmProvider(item.id)),
    });
  };

  return (
    <div
      className={[
        "rounded-lg border overflow-hidden transition-all duration-200",
        expanded ? "border-border bg-card" : "border-border bg-card hover:border-border",
      ].join(" ")}
    >
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex items-center gap-3 px-3 py-2.5 w-full cursor-pointer bg-transparent hover:bg-muted text-left transition-colors outline-none border-none"
      >
        <div className="w-8 h-8 rounded-lg bg-muted border border-border flex items-center justify-center shrink-0">
          <ProviderIcon provider={item.provider} size={16} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold text-foreground truncate">{item.label}</div>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="text-[10px] text-muted-foreground font-mono truncate">{maskKey(item.apiKey)}</span>
            {modelCount > 0 && (
              <span className="text-2xs text-muted-foreground bg-muted rounded-full px-1.5 py-0.5 font-medium shrink-0">
                {modelCount} model{modelCount !== 1 ? "s" : ""}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-muted-foreground">{expanded ? <AltArrowUp className="w-3.5 h-3.5" /> : <AltArrowDown className="w-3.5 h-3.5" />}</span>
        </div>
      </button>

      {expanded && (
        <div className="flex flex-col gap-3 px-3.5 pb-3.5 pt-3 border-t border-border bg-muted/50">
          <Form.Item
            label={
              <span className="text-muted-foreground">
                Label<span className="text-destructive"> *</span>
              </span>
            }
            className="!mb-0"
            layout="vertical"
          >
            <Input value={draft.label} onChange={(e) => setDraft((d) => ({ ...d, label: e.target.value }))} placeholder={meta.label} />
          </Form.Item>

          <Form.Item
            label={
              <span className="text-muted-foreground">
                API Key<span className="text-destructive"> *</span>
              </span>
            }
            className="!mb-0"
            layout="vertical"
          >
            <div className="flex items-center gap-2">
              <Input
                type={showKey ? "text" : "password"}
                value={draft.apiKey}
                onChange={(e) => setDraft((d) => ({ ...d, apiKey: e.target.value }))}
                placeholder={meta.keyPlaceholder}
              />
              <button
                type="button"
                onClick={() => setShowKey((v) => !v)}
                className="shrink-0 w-field-md h-field-md rounded-md bg-muted border border-border flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-border transition-colors cursor-pointer"
              >
                {showKey ? <EyeClosed className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              </button>
            </div>
          </Form.Item>

          <Form.Item
            label={
              <span className="text-muted-foreground">
                Base URL <span className="font-normal text-muted-foreground">(optional)</span>
              </span>
            }
            className="!mb-0"
            layout="vertical"
          >
            <Input
              value={draft.customBaseUrl}
              onChange={(e) => setDraft((d) => ({ ...d, customBaseUrl: e.target.value }))}
              placeholder={meta.defaultBase || "https://…"}
            />
          </Form.Item>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs font-bold text-muted-foreground">Models{models.length > 0 ? ` (${models.length})` : ""}</span>
              <Button type="text" size="small" loading={refreshing} icon={<Refresh size={11} />} onClick={handleRefreshModels}>
                Refresh
              </Button>
            </div>

            <div className="rounded-xl bg-card overflow-hidden">
              {refreshError && <div className="px-3 py-2 text-2xs text-destructive bg-destructive/5 border-b border-destructive/20">{refreshError}</div>}
              {models.length > 0 ? (
                <div className="max-h-40 overflow-y-auto divide-y divide-border/40">
                  {models.map((m) => (
                    <div key={m} className="px-3 py-1.5 text-xs text-foreground truncate" title={m}>
                      {m}
                    </div>
                  ))}
                </div>
              ) : (
                !refreshing && <div className="p-3 text-xs text-muted-foreground text-center">No models — click Refresh</div>
              )}
            </div>
          </div>

          <div className="flex items-center justify-between pt-1">
            <Button type="primary" danger size="small" onClick={handleDelete}>
              Delete
            </Button>

            <div className="flex gap-2">
              <Button type="text" size="small" onClick={handleDiscard}>
                Cancel
              </Button>

              <Button type="primary" size="small" loading={saving} onClick={handleSave}>
                {saving ? "Saving…" : "Save"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
