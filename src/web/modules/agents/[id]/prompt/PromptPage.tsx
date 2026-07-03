import { useCallback, useEffect, useRef, useState } from "react";

import { apiClient } from "src/common/api";
import { SettingKey } from "src/common/enum";
import { AgentEditor, type EditorInstance, type ToolActionEvent } from "src/components/ui/agent_editor";
import { fetchLlmProviders } from "src/modules/llm-providers/common/llmProvidersSlice";
import { useAppDispatch, useAppSelector } from "src/store/store";
import { useAgentDetailContext } from "../common/agentDetailContext";

import { PROMPT_AI_SYSTEM_PROMPT } from "../common/promptConstants";
import { UPDATE_PROMPT_TOOL_NAME, makeUpdatePromptTool } from "../common/promptTools";

// ─── Prompt Page ──────────────────────────────────────────────────────────────

export function PromptPage() {
  const { systemPrompt, setSystemPrompt, name } = useAgentDetailContext();

  const editorRef = useRef<EditorInstance | null>(null);
  const promptRef = useRef(systemPrompt);
  promptRef.current = systemPrompt;

  // ── Provider / model (persisted) ──
  const dispatch = useAppDispatch();
  const providerItems = useAppSelector((s) => s.llmProviders.items);
  const providersLoaded = useAppSelector((s) => s.llmProviders.items.length > 0 || s.llmProviders.total === 0);
  const settings = useAppSelector((s) => s.settings.data);
  const [providerId, setProviderId] = useState<string | undefined>(undefined);
  const [model, setModel] = useState("");
  const initializedRef = useRef(false);

  useEffect(() => {
    dispatch(fetchLlmProviders());
  }, [dispatch]);

  useEffect(() => {
    if (!providersLoaded || providerItems.length === 0) return;
    if (initializedRef.current) return;
    initializedRef.current = true;
    const savedProvider = settings[SettingKey.PromptAssistantProvider] ?? "";
    const match = providerItems.find((p) => p.id === savedProvider) ?? providerItems[0];
    setProviderId(match.id);
    const savedModel = settings[SettingKey.PromptAssistantModel] ?? "";
    if (savedModel) setModel(savedModel);
  }, [providersLoaded, providerItems, settings]);

  // ── Apply prompt via executeEdits (preserves undo history) ──
  const applyPrompt = useCallback(
    (newPrompt: string) => {
      const editor = editorRef.current;
      const monacoModel = editor?.getModel();
      if (!editor || !monacoModel) {
        setSystemPrompt(newPrompt);
        return;
      }
      if (newPrompt === monacoModel.getValue()) return;
      editor.executeEdits("ai-update", [
        {
          range: monacoModel.getFullModelRange(),
          text: newPrompt,
        },
      ]);
      setSystemPrompt(newPrompt);
    },
    [setSystemPrompt],
  );

  // ── update_prompt tool (FE-only) ──
  const [tools] = useState(() => ({
    [UPDATE_PROMPT_TOOL_NAME]: makeUpdatePromptTool(applyPrompt),
  }));

  // ── System prompt with current context ──
  const currentPrompt = systemPrompt.trim();
  const agentCtx = name ? `\nAgent being edited: "${name}".` : "";
  const aiSystemPrompt = [
    PROMPT_AI_SYSTEM_PROMPT,
    agentCtx,
    currentPrompt
      ? `\nCURRENT system prompt in the editor (for reference and improvement):\n\`\`\`\n${currentPrompt}\n\`\`\``
      : "\nEditor is currently empty — please write a new system prompt based on user requirements.",
  ].join("\n");

  // ── Handle tool events ──
  const handleToolAction = useCallback(
    (event: ToolActionEvent) => {
      if (event.type === "tool-call" && event.toolName === UPDATE_PROMPT_TOOL_NAME) {
        const input = event.input as { prompt: string };
        if (input?.prompt) applyPrompt(input.prompt);
      }
    },
    [applyPrompt],
  );

  return (
    <AgentEditor
      language="markdown"
      value={systemPrompt}
      onChange={(v) => setSystemPrompt(v ?? "")}
      monacoTheme="neon-dark"
      monacoLoadingBg="#121317"
      editorPlaceholder={"Write your system prompt here...\n\nDefine the agent's personality, behavior, and instructions."}
      onMount={(editor) => {
        editorRef.current = editor;
      }}
      chatMode="floating"
      monacoOptions={{
        fontSize: 14,
        lineHeight: 1.7,
        padding: { top: 14, bottom: 14 },
        lineNumbers: "off",
        folding: false,
        renderLineHighlight: "none",
        overviewRulerLanes: 0,
        hideCursorInOverviewRuler: true,
      }}
      systemPrompt={aiSystemPrompt}
      tools={tools}
      maxSteps={6}
      aiProviderId={providerId}
      aiModel={model}
      onToolAction={handleToolAction}
      onChangeAiProvider={(id) => {
        setProviderId(id);
        setModel("");
        void apiClient.patch("/api/settings", {
          [SettingKey.PromptAssistantProvider]: id,
        });
      }}
      onChangeModel={(m) => {
        setModel(m);
        void apiClient.patch("/api/settings", {
          [SettingKey.PromptAssistantModel]: m,
        });
      }}
      assistantLabel="Prompt AI"
      chatPlaceholder="Describe your request... (Enter to send)"
    />
  );
}
