import { useState } from "react";

import type { LlmProvider } from "src/common/types";
import { Button } from "src/components/ui/button";
import { Field } from "src/components/ui/form-field";
import { Input } from "src/components/ui/input";
import { Select, type SelectOption } from "src/components/ui/options-select";
import { PROVIDER_META, PROVIDER_OPTIONS, createLlmProvider, generateLabel } from "src/modules/llm-providers/common/llmProvidersSlice";
import { useAppDispatch, useAppSelector } from "src/store/store";

// ─── Provider Add Form ────────────────────────────────────────────────────────
// Game-styled form for adding a new AI provider credential.

interface ProviderAddFormProps {
  onClose: () => void;
}

export function ProviderAddForm({ onClose }: ProviderAddFormProps) {
  const dispatch = useAppDispatch();

  const providers = useAppSelector((s) => s.llmProviders.items) as LlmProvider[];

  const [provider, setProvider] = useState("openai");
  const [label, setLabel] = useState(() => generateLabel("openai", providers));
  const [apiKey, setApiKey] = useState("");
  const [customBaseUrl, setCustomBaseUrl] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const providerOptions: SelectOption[] = PROVIDER_OPTIONS.map((o) => ({
    value: o.value,
    label: o.label,
  }));

  const handleAdd = async () => {
    if (!label.trim() || !apiKey.trim()) {
      setError("Please fill in all required fields");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await dispatch(
        createLlmProvider({
          provider,
          label: label.trim(),
          apiKey,
          customBaseUrl: customBaseUrl.trim(),
          models: [],
        }),
      ).unwrap();

      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    setError("");
    setApiKey("");
    setCustomBaseUrl("");
    onClose();
  };

  return (
    <div className="p-3.5 rounded-lg border border-border bg-muted/60">
      <div className="text-xs font-bold text-muted-foreground mb-3">New Provider</div>
      <div className="flex flex-col gap-3">
        <Field label="Provider">
          <Select
            value={provider}
            onChange={(v) => {
              setProvider(v);
              setLabel(generateLabel(v, providers));
              setError("");
            }}
            options={providerOptions}
          />
        </Field>
        <Field label="Label" required>
          <Input
            id="settings-provider-label"
            value={label}
            onChange={(e) => {
              setLabel(e.target.value);
              setError("");
            }}
            placeholder="e.g. My OpenAI Key"
          />
        </Field>
        <Field label="API Key" required>
          <Input
            id="settings-provider-key"
            type="password"
            value={apiKey}
            onChange={(e) => {
              setApiKey(e.target.value);
              setError("");
            }}
            placeholder={PROVIDER_META[provider]?.keyPlaceholder ?? "sk-..."}
          />
        </Field>
        <Field label="Base URL" optional>
          <Input
            id="settings-provider-base-url"
            value={customBaseUrl}
            onChange={(e) => setCustomBaseUrl(e.target.value)}
            placeholder={PROVIDER_META[provider]?.defaultBase || "https://…"}
          />
        </Field>
        {error && <div className="text-2xs text-destructive font-medium">{error}</div>}
        <div className="flex items-center justify-end gap-2 pt-1">
          <Button variant="ghost" size="sm" onClick={handleCancel}>
            Cancel
          </Button>
          <Button variant="primary" size="sm" loading={saving} onClick={handleAdd}>
            {saving ? "Adding…" : "Add Provider"}
          </Button>
        </div>
      </div>
    </div>
  );
}
