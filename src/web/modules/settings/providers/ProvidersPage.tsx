import { Eye, EyeClosed, Key, PenNewSquare, Refresh, TrashBinMinimalistic } from "@solar-icons/react";
import { useEffect, useState } from "react";
import { apiClient } from "src/common/api";
import type { LlmProvider } from "src/common/types";
import RenderIf from "src/components/ui/RenderIf";
import { Button } from "src/components/ui/button";
import { SimpleDialog } from "src/components/ui/dialog";
import { Input } from "src/components/ui/input";
import { Field } from "src/components/ui/label";
import { Select, type SelectOption } from "src/components/ui/select";
import { toast } from "src/components/ui/toast";
import {
  PROVIDER_META,
  PROVIDER_OPTIONS,
  createLlmProvider,
  deleteLlmProvider,
  generateLabel,
  refreshModels,
  updateLlmProvider,
} from "src/modules/llm-providers/common/llmProvidersSlice";
import { ProviderEmptyState } from "src/modules/llm-providers/components/ProviderEmptyState";
import { ProviderIcon } from "src/modules/llm-providers/components/ProviderIcon";
import { useAppDispatch, useAppSelector } from "src/store/store";

// ─── Add / Edit Dialog ───────────────────────────────────────────────────────

interface ProviderFormDialogProps {
  /** For edit mode: pass provider id + label to fetch detail */
  editId?: string;
  onClose: () => void;
}

function ProviderFormDialog({ editId, onClose }: ProviderFormDialogProps) {
  const dispatch = useAppDispatch();
  const providers = useAppSelector((s) => s.llmProviders.items) as LlmProvider[];
  const isEdit = !!editId;

  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    provider: "openai",
    label: generateLabel("openai", providers),
    apiKey: "",
    customBaseUrl: "",
  });
  const [showKey, setShowKey] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // Fetch full detail when editing
  useEffect(() => {
    if (!editId) return;
    setLoading(true);
    apiClient
      .get<LlmProvider>(`/api/providers/${editId}`)
      .then((detail) => {
        setForm({
          provider: detail.provider,
          label: detail.label,
          apiKey: detail.apiKey ?? "",
          customBaseUrl: detail.customBaseUrl ?? "",
        });
      })
      .catch(() => {
        toast.error("Failed to load provider details");
        onClose();
      })
      .finally(() => setLoading(false));
  }, [editId, onClose]);

  const providerOptions: SelectOption[] = PROVIDER_OPTIONS.map((o) => ({
    value: o.value,
    label: o.label,
  }));

  const meta = PROVIDER_META[form.provider] ?? PROVIDER_META.custom;

  const handleSubmit = async () => {
    if (!form.label.trim() || !form.apiKey.trim()) {
      setError("Please fill in all required fields");
      return;
    }
    setSaving(true);
    setError("");
    try {
      if (isEdit) {
        await dispatch(
          updateLlmProvider({
            id: editId,
            label: form.label.trim(),
            apiKey: form.apiKey,
            customBaseUrl: form.customBaseUrl.trim(),
          }),
        ).unwrap();
        toast.success(`Provider "${form.label}" updated`);
      } else {
        await dispatch(
          createLlmProvider({
            provider: form.provider,
            label: form.label.trim(),
            apiKey: form.apiKey,
            customBaseUrl: form.customBaseUrl.trim(),
            models: [],
          }),
        ).unwrap();
        toast.success(`Provider "${form.label}" added`);
      }
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <SimpleDialog
      open
      onClose={onClose}
      title={isEdit ? "Edit Provider" : "Add Provider"}
      icon={isEdit ? <PenNewSquare size={16} /> : <Key size={16} />}
      width={460}
      footer={
        <div className="flex items-center justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" size="sm" loading={saving} disabled={loading} onClick={handleSubmit}>
            {isEdit ? "Save" : "Add Provider"}
          </Button>
        </div>
      }
    >
      {loading ? (
        <div className="flex items-center justify-center h-40 gap-1.5">
          {[0, 1, 2].map((i) => (
            <span key={i} className="w-1.5 h-1.5 rounded-full bg-primary animate-bounce" style={{ animationDelay: `${i * 150}ms` }} />
          ))}
        </div>
      ) : (
        <div className="flex flex-col gap-3.5">
          {!isEdit && (
            <Field label="Provider">
              <Select
                value={form.provider}
                onChange={(v) => {
                  setForm((f) => ({ ...f, provider: v, label: generateLabel(v, providers) }));
                  setError("");
                }}
                options={providerOptions}
              />
            </Field>
          )}

          <Field label="Label" required>
            <Input
              value={form.label}
              onChange={(e) => {
                setForm((f) => ({ ...f, label: e.target.value }));
                setError("");
              }}
              placeholder="e.g. My OpenAI Key"
            />
          </Field>

          <Field label="API Key" required>
            <div className="flex items-center gap-2">
              <Input
                type={showKey ? "text" : "password"}
                value={form.apiKey}
                onChange={(e) => {
                  setForm((f) => ({ ...f, apiKey: e.target.value }));
                  setError("");
                }}
                placeholder={meta.keyPlaceholder}
              />
              <button
                type="button"
                onClick={() => setShowKey((v) => !v)}
                className="shrink-0 w-field-md h-field-md rounded-md bg-surface-raised border border-border flex items-center justify-center text-muted hover:text-main hover:bg-border transition-colors cursor-pointer"
              >
                {showKey ? <EyeClosed className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              </button>
            </div>
          </Field>

          <Field label="Base URL" optional>
            <Input
              value={form.customBaseUrl}
              onChange={(e) => setForm((f) => ({ ...f, customBaseUrl: e.target.value }))}
              placeholder={meta.defaultBase || "https://…"}
            />
          </Field>

          <RenderIf condition={!!error}>
            <div className="px-3 py-2 rounded-lg bg-danger/10 border border-danger/20">
              <p className="text-xs text-danger font-medium">{error}</p>
            </div>
          </RenderIf>
        </div>
      )}
    </SimpleDialog>
  );
}

// ─── Delete Confirm Dialog ───────────────────────────────────────────────────

interface DeleteProviderDialogProps {
  provider: LlmProvider;
  onClose: () => void;
}

function DeleteProviderDialog({ provider, onClose }: DeleteProviderDialogProps) {
  const dispatch = useAppDispatch();
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await dispatch(deleteLlmProvider(provider.id)).unwrap();
      toast.success(`Deleted provider "${provider.label}"`);
      onClose();
    } catch (err: any) {
      toast.error(err?.message || "Failed to delete provider");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <SimpleDialog
      open
      onClose={onClose}
      title="Delete Provider"
      icon={<TrashBinMinimalistic size={16} />}
      width={380}
      footer={
        <div className="flex items-center justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="danger" size="sm" onClick={handleDelete} loading={deleting}>
            Delete
          </Button>
        </div>
      }
    >
      <p className="text-sm text-soft leading-relaxed">
        Remove <strong className="text-main">"{provider.label}"</strong> and all its configuration? This action cannot be undone.
      </p>
    </SimpleDialog>
  );
}

// ─── Main Page ───────────────────────────────────────────────────────────────

export function ProvidersPage() {
  const dispatch = useAppDispatch();
  const providers = useAppSelector((s) => s.llmProviders.items) as LlmProvider[];

  // Dialog states
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [editProviderId, setEditProviderId] = useState<string | null>(null);
  const [deleteProvider, setDeleteProvider] = useState<LlmProvider | null>(null);
  const [refreshingId, setRefreshingId] = useState<string | null>(null);

  const handleRefreshModels = async (id: string) => {
    setRefreshingId(id);
    try {
      await dispatch(refreshModels(id)).unwrap();
      toast.success("Models refreshed");
    } catch (err: any) {
      toast.error(err?.message || "Failed to refresh models");
    } finally {
      setRefreshingId(null);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-main">AI Providers</h3>
          <p className="text-[11px] text-muted mt-0.5">Configure API keys for LLM providers</p>
        </div>
        <Button id="settings-add-provider" variant="primary" size="sm" icon={<Key width={11} height={11} />} onClick={() => setShowAddDialog(true)}>
          Add Provider
        </Button>
      </div>

      {/* Empty state */}
      <RenderIf condition={providers.length === 0}>
        <div className="rounded-lg border border-border bg-surface">
          <ProviderEmptyState onAdd={() => setShowAddDialog(true)} />
        </div>
      </RenderIf>

      {/* Table */}
      <RenderIf condition={providers.length > 0}>
        {() => (
          <div className="rounded-lg border border-border overflow-hidden">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-surface-raised/50">
                  <th className="text-[11px] font-medium text-muted uppercase tracking-wider px-4 py-2.5">Provider</th>
                  <th className="text-[11px] font-medium text-muted uppercase tracking-wider px-4 py-2.5">API Key</th>
                  <th className="text-[11px] font-medium text-muted uppercase tracking-wider px-4 py-2.5">Models</th>
                  <th className="text-[11px] font-medium text-muted uppercase tracking-wider px-4 py-2.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {providers.map((p) => {
                  const modelCount = Array.isArray(p.models) ? p.models.length : (p as any).countModels || 0;
                  const masked = (p as any).maskedApiKey || "••••••••";
                  return (
                    <tr key={p.id} className="group hover:bg-white/[0.02] transition-colors">
                      {/* Provider */}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2.5">
                          <div className="w-7 h-7 rounded-md bg-surface-raised border border-border flex items-center justify-center shrink-0">
                            <ProviderIcon provider={p.provider} size={14} />
                          </div>
                          <div className="min-w-0">
                            <span className="text-[13px] font-medium text-main block truncate">{p.label}</span>
                            <span className="text-[11px] text-muted block">{PROVIDER_META[p.provider]?.label ?? p.provider}</span>
                          </div>
                        </div>
                      </td>
                      {/* API Key (masked) */}
                      <td className="px-4 py-3">
                        <span className="text-[12px] text-muted font-mono">{masked}</span>
                      </td>
                      {/* Models */}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span className="text-[13px] text-soft tabular-nums">{modelCount}</span>
                          <button
                            type="button"
                            onClick={() => handleRefreshModels(p.id)}
                            disabled={refreshingId === p.id}
                            className="text-muted hover:text-primary transition-colors cursor-pointer bg-transparent border-none p-0 disabled:opacity-50"
                          >
                            <Refresh width={12} height={12} className={refreshingId === p.id ? "animate-spin" : ""} />
                          </button>
                        </div>
                      </td>
                      {/* Actions */}
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                          <Button
                            variant="ghost"
                            size="sm"
                            icon={<PenNewSquare width={13} height={13} />}
                            onClick={() => setEditProviderId(p.id)}
                            className="!px-1.5"
                          />
                          <Button
                            variant="ghost"
                            size="sm"
                            icon={<TrashBinMinimalistic width={13} height={13} />}
                            onClick={() => setDeleteProvider(p)}
                            className="!px-1.5 text-danger hover:text-danger"
                          />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </RenderIf>

      {/* Dialogs */}
      <RenderIf condition={showAddDialog}>
        <ProviderFormDialog onClose={() => setShowAddDialog(false)} />
      </RenderIf>

      <RenderIf condition={!!editProviderId}>{() => <ProviderFormDialog editId={editProviderId!} onClose={() => setEditProviderId(null)} />}</RenderIf>

      <RenderIf condition={!!deleteProvider}>
        {() => <DeleteProviderDialog provider={deleteProvider as LlmProvider} onClose={() => setDeleteProvider(null)} />}
      </RenderIf>
    </div>
  );
}
