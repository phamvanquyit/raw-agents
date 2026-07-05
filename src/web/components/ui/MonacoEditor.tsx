/**
 * MonacoEditor — Base Monaco Editor component dùng chung toàn app.
 *
 * - Configure MonacoEnvironment (workers) + loader (bypass CDN)
 * - Re-export type EditorInstance để consumer dùng với useRef
 *
 * Usage:
 *   import { MonacoEditor, type EditorInstance } from "src/components/ui/MonacoEditor";
 *   const ref = useRef<EditorInstance>(null);
 *   <MonacoEditor language="python" value={code} onChange={...} onMount={...} />
 */

import { useCallback, useRef } from "react";

import type { EditorProps, Monaco, DiffEditorProps as MonacoDiffEditorProps } from "@monaco-editor/react";
import MonacoReactEditor, { DiffEditor as MonacoReactDiffEditor, loader } from "@monaco-editor/react";
import * as monaco from "monaco-editor";
import type { editor as editorNS } from "monaco-editor";
import EditorWorker from "monaco-editor/esm/vs/editor/editor.worker?worker";
import JsonWorker from "monaco-editor/esm/vs/language/json/json.worker?worker";

// ── Worker setup ──────────────────────────────────────────────────────────────
(self as unknown as { MonacoEnvironment: unknown }).MonacoEnvironment = {
  getWorker(_: unknown, label: string) {
    if (label === "json") return new JsonWorker();
    return new EditorWorker();
  },
};

// Bypass CDN — dùng monaco-editor đã bundle local qua Vite
loader.config({ monaco });

// ── Types ─────────────────────────────────────────────────────────────────────

export type EditorInstance = editorNS.IStandaloneCodeEditor;
export type { Monaco };

// ── Default options ───────────────────────────────────────────────────────────

const DEFAULT_OPTIONS: editorNS.IStandaloneEditorConstructionOptions = {
  fontSize: 13,
  minimap: { enabled: false },
  scrollBeyondLastLine: false,
  padding: { top: 10, bottom: 10 },
  tabSize: 2,
  wordWrap: "off",
  automaticLayout: true,
  scrollbar: {
    verticalScrollbarSize: 4,
    horizontalScrollbarSize: 4,
    horizontal: "visible",
  },
  stickyScroll: { enabled: false },
};

// ── Component ─────────────────────────────────────────────────────────────────

export interface MonacoEditorProps extends Omit<EditorProps, "loading" | "theme"> {
  /** Monaco theme — default: "vs-dark" */
  theme?: string;
  height?: string | number;
  options?: editorNS.IStandaloneEditorConstructionOptions;
  /** Called when user presses Cmd+S / Ctrl+S — also prevents browser "Save Page" */
  onSave?: () => void;
}

export function MonacoEditor({ theme = "vs-dark", options, height = "100%", onSave, onMount, ...props }: MonacoEditorProps) {
  const onSaveRef = useRef(onSave);
  onSaveRef.current = onSave;

  const handleMount: EditorProps["onMount"] = useCallback(
    (editor: EditorInstance, monacoInstance: Monaco) => {
      // Register Cmd+S / Ctrl+S keybinding
      editor.addCommand(monacoInstance.KeyMod.CtrlCmd | monacoInstance.KeyCode.KeyS, () => {
        onSaveRef.current?.();
      });
      onMount?.(editor, monacoInstance);
    },
    [onMount],
  );

  return <MonacoReactEditor height={height} theme={theme} options={{ ...DEFAULT_OPTIONS, ...options }} onMount={handleMount} {...props} />;
}

// ── Diff Editor ───────────────────────────────────────────────────────────────

const DEFAULT_DIFF_OPTIONS: editorNS.IDiffEditorConstructionOptions = {
  fontSize: 13,
  minimap: { enabled: false },
  scrollBeyondLastLine: false,
  padding: { top: 10, bottom: 10 },
  wordWrap: "off",
  automaticLayout: true,
  scrollbar: {
    verticalScrollbarSize: 4,
    horizontalScrollbarSize: 4,
    horizontal: "visible",
  },
  stickyScroll: { enabled: false },
  readOnly: true,
  renderSideBySide: false,
};

export interface DiffEditorComponentProps extends Omit<MonacoDiffEditorProps, "loading" | "theme"> {
  theme?: string;
  height?: string | number;
  options?: editorNS.IDiffEditorConstructionOptions;
}

export function MonacoDiffEditor({ theme = "vs-dark", options, height = "100%", ...props }: DiffEditorComponentProps) {
  return <MonacoReactDiffEditor height={height} theme={theme} options={{ ...DEFAULT_DIFF_OPTIONS, ...options }} {...props} />;
}
