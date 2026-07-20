import { Eye, EyeClosed, Key, Magnifier, PenNewSquare, Refresh, TrashBinMinimalistic } from "@solar-icons/react";
import { useEffect, useMemo, useState } from "react";
import { apiClient } from "src/common/api";
import type { LlmProvider } from "src/common/types";
import RenderIf from "src/components/ui/RenderIf";
import { Badge } from "src/components/ui/badge";
import { Button } from "src/components/ui/button";
import { Card, CardContent } from "src/components/ui/card";
import { SimpleDialog } from "src/components/ui/dialog";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "src/components/ui/empty";
import { Field } from "src/components/ui/form-field";
import { Input } from "src/components/ui/input";
import { Select, type SelectOption } from "src/components/ui/options-select";
import { Skeleton } from "src/components/ui/skeleton";
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
import { ProviderIcon } from "src/modules/llm-providers/components/ProviderIcon";
import { useAppDispatch, useAppSelector } from "src/store/store";

// ─── Add / Edit Dialog ───────────────────────────────────────────────────────

interface ProviderFormDialogProps {
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
                className="shrink-0 w-field-md h-field-md rounded-md bg-muted border border-border flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-border transition-colors cursor-pointer"
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
            <div className="px-3 py-2 rounded-lg bg-destructive/10 border border-destructive/20">
              <p className="text-xs text-destructive font-medium">{error}</p>
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
      <p className="text-sm text-muted-foreground leading-relaxed">
        Remove <strong className="text-foreground">"{provider.label}"</strong> and all its configuration? This action cannot be undone.
      </p>
    </SimpleDialog>
  );
}

// ─── Models Dialog ───────────────────────────────────────────────────────────

interface ModelsDialogProps {
  provider: LlmProvider;
  onClose: () => void;
}

function ModelsDialog({ provider, onClose }: ModelsDialogProps) {
  const dispatch = useAppDispatch();
  const [models, setModels] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState("");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    apiClient
      .get(`/api/providers/${provider.id}/models`)
      .then((list) => {
        if (!cancelled) setModels(Array.isArray(list) ? (list as string[]) : []);
      })
      .catch(() => {
        if (!cancelled) {
          toast.error("Failed to load models");
          setModels([]);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [provider.id]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return models;
    return models.filter((m) => m.toLowerCase().includes(q));
  }, [models, search]);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      const updated = await dispatch(refreshModels(provider.id)).unwrap();
      setModels(Array.isArray(updated.models) ? updated.models : []);
      toast.success("Models refreshed");
    } catch (err: any) {
      toast.error(err?.message || "Failed to refresh models");
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <SimpleDialog
      open
      onClose={onClose}
      title={provider.label}
      icon={<ProviderIcon provider={provider.provider} size={16} />}
      width={480}
      noPadding
      footer={
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs text-muted-foreground tabular-nums">
            {loading ? "…" : `${filtered.length}${search.trim() ? ` / ${models.length}` : ""} model${filtered.length !== 1 ? "s" : ""}`}
          </span>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={onClose}>
              Close
            </Button>
            <Button variant="secondary" size="sm" loading={refreshing} icon={<Refresh />} onClick={handleRefresh}>
              Sync
            </Button>
          </div>
        </div>
      }
    >
      <div className="flex flex-col gap-3 px-5 py-4">
        <div className="relative">
          <Magnifier width={14} height={14} className="pointer-events-none absolute left-2.5 top-1/2 z-[1] -translate-y-1/2 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search models…" className="pl-8" autoFocus />
        </div>

        <div className="max-h-[360px] overflow-y-auto rounded-lg border border-border-subtle bg-muted/40">
          <RenderIf condition={loading}>
            <div className="flex flex-col gap-2 p-3">
              {[0, 1, 2, 3, 4].map((i) => (
                <Skeleton key={i} className="h-7 w-full" />
              ))}
            </div>
          </RenderIf>

          <RenderIf condition={!loading && filtered.length === 0}>
            <div className="px-3 py-8 text-center text-sm text-muted-foreground">
              {models.length === 0 ? "No models synced yet — click Sync to fetch." : "No models match your search."}
            </div>
          </RenderIf>

          <RenderIf condition={!loading && filtered.length > 0}>
            {() => (
              <ul className="m-0 list-none divide-y divide-border-subtle p-0">
                {filtered.map((model) => (
                  <li key={model} className="px-3 py-2 font-mono text-xs text-foreground truncate" title={model}>
                    {model}
                  </li>
                ))}
              </ul>
            )}
          </RenderIf>
        </div>
      </div>
    </SimpleDialog>
  );
}

// ─── Provider Card ───────────────────────────────────────────────────────────

interface ProviderCardProps {
  provider: LlmProvider;
  refreshing: boolean;
  onRefresh: () => void;
  onViewModels: () => void;
  onEdit: () => void;
  onDelete: () => void;
}

function ProviderCard({ provider, refreshing, onRefresh, onViewModels, onEdit, onDelete }: ProviderCardProps) {
  const meta = PROVIDER_META[provider.provider] ?? PROVIDER_META.custom;
  const modelCount = Array.isArray(provider.models) ? provider.models.length : (provider as any).countModels || 0;
  const masked = (provider as any).maskedApiKey || "••••••••";

  return (
    <Card className="group relative overflow-hidden border border-border-subtle transition-colors hover:border-border">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-brand/40 to-transparent opacity-0 transition-opacity group-hover:opacity-100" />
      <div className="flex items-center gap-3">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted">
          <ProviderIcon provider={provider.provider} size={18} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="m-0 truncate text-base font-semibold leading-5 text-foreground">{provider.label}</p>
          <p className="m-0 mt-0.5 text-sm text-muted-foreground">{meta.label}</p>
        </div>
      </div>
      <CardContent className="flex flex-col gap-3">
        <div className="flex items-center gap-2 rounded-md bg-muted/60 px-2.5 py-2">
          <Key width={12} height={12} className="shrink-0 text-muted-foreground" />
          <code className="min-w-0 truncate font-mono text-xs text-tertiary-foreground">{masked}</code>
        </div>
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1">
            <button type="button" onClick={onViewModels} className="cursor-pointer border-0 bg-transparent p-0">
              <Badge variant="secondary" className="rounded-md tabular-nums hover:bg-secondary/80 transition-colors">
                {modelCount} model{modelCount !== 1 ? "s" : ""}
              </Badge>
            </button>
            <Button variant="ghost" size="sm" loading={refreshing} icon={<Refresh />} onClick={onRefresh}>
              Sync
            </Button>
          </div>
          <div className="flex items-center gap-0.5">
            <Button variant="ghost" size="icon-sm" icon={<PenNewSquare />} onClick={onEdit} aria-label="Edit provider" />
            <Button
              variant="ghost"
              size="icon-sm"
              icon={<TrashBinMinimalistic />}
              onClick={onDelete}
              aria-label="Delete provider"
              className="text-destructive hover:text-destructive"
            />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Main Page ───────────────────────────────────────────────────────────────

export function ProvidersPage() {
  const dispatch = useAppDispatch();
  const providers = useAppSelector((s) => s.llmProviders.items) as LlmProvider[];

  const [showAddDialog, setShowAddDialog] = useState(false);
  const [editProviderId, setEditProviderId] = useState<string | null>(null);
  const [deleteProvider, setDeleteProvider] = useState<LlmProvider | null>(null);
  const [modelsProvider, setModelsProvider] = useState<LlmProvider | null>(null);
  const [refreshingId, setRefreshingId] = useState<string | null>(null);

  const totalModels = useMemo(
    () => providers.reduce((sum, p) => sum + (Array.isArray(p.models) ? p.models.length : (p as any).countModels || 0), 0),
    [providers],
  );

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
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <span className="tabular-nums">{providers.length} connected</span>
          <span className="text-border">·</span>
          <span className="tabular-nums">{totalModels} models</span>
        </div>
        <Button id="settings-add-provider" variant="primary" icon={<Key width={14} height={14} />} onClick={() => setShowAddDialog(true)}>
          Add Provider
        </Button>
      </div>

      <RenderIf condition={providers.length === 0}>
        <Empty className="rounded-xl border border-dashed border-border bg-card">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Key />
            </EmptyMedia>
            <EmptyTitle>No providers yet</EmptyTitle>
            <EmptyDescription>Add an AI provider to power your agents with models and API keys.</EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button variant="primary" size="sm" icon={<Key width={12} height={12} />} onClick={() => setShowAddDialog(true)}>
              Add Your First Provider
            </Button>
          </EmptyContent>
        </Empty>
      </RenderIf>

      <RenderIf condition={providers.length > 0}>
        {() => (
          <div className="grid gap-3 sm:grid-cols-2">
            {providers.map((p) => (
              <ProviderCard
                key={p.id}
                provider={p}
                refreshing={refreshingId === p.id}
                onRefresh={() => handleRefreshModels(p.id)}
                onViewModels={() => setModelsProvider(p)}
                onEdit={() => setEditProviderId(p.id)}
                onDelete={() => setDeleteProvider(p)}
              />
            ))}
          </div>
        )}
      </RenderIf>

      <RenderIf condition={showAddDialog}>
        <ProviderFormDialog onClose={() => setShowAddDialog(false)} />
      </RenderIf>

      <RenderIf condition={!!editProviderId}>{() => <ProviderFormDialog editId={editProviderId!} onClose={() => setEditProviderId(null)} />}</RenderIf>

      <RenderIf condition={!!deleteProvider}>
        {() => <DeleteProviderDialog provider={deleteProvider as LlmProvider} onClose={() => setDeleteProvider(null)} />}
      </RenderIf>

      <RenderIf condition={!!modelsProvider}>
        {() => <ModelsDialog provider={modelsProvider as LlmProvider} onClose={() => setModelsProvider(null)} />}
      </RenderIf>
    </div>
  );
}
