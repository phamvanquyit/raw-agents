import { useCallback, useRef } from "react";

import type { EditorProps, Monaco, DiffEditorProps as MonacoDiffEditorProps } from "@monaco-editor/react";
import MonacoReactEditor, { DiffEditor as MonacoReactDiffEditor, loader } from "@monaco-editor/react";
import * as monaco from "monaco-editor";
import type { editor as editorNS } from "monaco-editor";
import EditorWorker from "monaco-editor/esm/vs/editor/editor.worker?worker";
import JsonWorker from "monaco-editor/esm/vs/language/json/json.worker?worker";
import TsWorker from "monaco-editor/esm/vs/language/typescript/ts.worker?worker";

(self as unknown as { MonacoEnvironment: unknown }).MonacoEnvironment = {
  getWorker(_: unknown, label: string) {
    if (label === "json") return new JsonWorker();
    if (label === "typescript" || label === "javascript") return new TsWorker();
    return new EditorWorker();
  },
};

loader.config({ monaco });

export type EditorInstance = editorNS.IStandaloneCodeEditor;
export type { Monaco };

let scriptDtsRegistered = false;

function ensureScriptDts(monacoInstance: Monaco) {
  if (scriptDtsRegistered) return;
  scriptDtsRegistered = true;
  const defaults = monacoInstance.languages.typescript.typescriptDefaults;
  defaults.setCompilerOptions({
    ...defaults.getCompilerOptions(),
    target: monacoInstance.languages.typescript.ScriptTarget.ESNext,
    module: monacoInstance.languages.typescript.ModuleKind.ESNext,
    moduleResolution: monacoInstance.languages.typescript.ModuleResolutionKind.NodeJs,
    allowNonTsExtensions: true,
  });
  defaults.addExtraLib(
    `declare module "rawagents" {
  const rawagents: any;
  export default rawagents;
}

declare const process: {
  env: Record<string, string | undefined>;
  exit(code?: number): never;
  stdout: { write(chunk: string | Uint8Array): boolean };
  stderr: { write(chunk: string | Uint8Array): boolean };
};

declare const Bun: any;
`,
    "ts:job-script.d.ts",
  );
}

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

export interface MonacoEditorProps extends Omit<EditorProps, "loading" | "theme"> {
  theme?: string;
  height?: string | number;
  options?: editorNS.IStandaloneEditorConstructionOptions;
  onSave?: () => void;
}

export function MonacoEditor({ theme = "vs-dark", options, height = "100%", onSave, onMount, ...props }: MonacoEditorProps) {
  const onSaveRef = useRef(onSave);
  onSaveRef.current = onSave;

  const handleMount: EditorProps["onMount"] = useCallback(
    (editor: EditorInstance, monacoInstance: Monaco) => {
      ensureScriptDts(monacoInstance);
      editor.addCommand(monacoInstance.KeyMod.CtrlCmd | monacoInstance.KeyCode.KeyS, () => {
        onSaveRef.current?.();
      });
      onMount?.(editor, monacoInstance);
    },
    [onMount],
  );

  return <MonacoReactEditor height={height} theme={theme} options={{ ...DEFAULT_OPTIONS, ...options }} onMount={handleMount} {...props} />;
}

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

export function MonacoDiffEditor({ theme = "vs-dark", options, height = "100%", onMount, ...props }: DiffEditorComponentProps) {
  const handleMount: NonNullable<MonacoDiffEditorProps["onMount"]> = useCallback(
    (editor, monacoInstance) => {
      ensureScriptDts(monacoInstance);
      onMount?.(editor, monacoInstance);
    },
    [onMount],
  );

  return <MonacoReactDiffEditor height={height} theme={theme} options={{ ...DEFAULT_DIFF_OPTIONS, ...options }} onMount={handleMount} {...props} />;
}
