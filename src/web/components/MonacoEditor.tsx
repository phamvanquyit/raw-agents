import { useCallback, useRef } from "react";

import type { EditorProps, Monaco, DiffEditorProps as MonacoDiffEditorProps } from "@monaco-editor/react";
import MonacoReactEditor, { DiffEditor as MonacoReactDiffEditor, loader } from "@monaco-editor/react";
import * as monaco from "monaco-editor";
import type { editor as editorNS } from "monaco-editor";
// @ts-expect-error deep monaco language path has no types
import { conf as markdownConf, language as markdownLanguage } from "monaco-editor/esm/vs/basic-languages/markdown/markdown.js";
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

const RAW_DARK_THEME = "raw-dark";
let rawDarkThemeRegistered = false;
let scriptDtsRegistered = false;
let markdownTokensRegistered = false;

function ensureMarkdownLanguage(monacoInstance: Monaco) {
  if (markdownTokensRegistered) return;
  markdownTokensRegistered = true;
  monacoInstance.languages.setMonarchTokensProvider("markdown", markdownLanguage);
  monacoInstance.languages.setLanguageConfiguration("markdown", markdownConf);
}

function ensureRawDarkTheme(monacoInstance: Monaco) {
  monacoInstance.editor.defineTheme(RAW_DARK_THEME, {
    base: "vs-dark",
    inherit: true,
    rules: [
      { token: "keyword.md", foreground: "599ce7", fontStyle: "bold" },
      { token: "strong.md", foreground: "ebebeb", fontStyle: "bold" },
      { token: "emphasis.md", foreground: "8c8c8c", fontStyle: "italic" },
      { token: "comment.md", foreground: "636363", fontStyle: "italic" },
      { token: "string.md", foreground: "0ac864" },
      { token: "variable.md", foreground: "f1b467" },
      { token: "string.link.md", foreground: "599ce7" },
      { token: "variable.source.md", foreground: "8c8c8c" },
      { token: "meta.separator.md", foreground: "636363" },
      { token: "tag.md", foreground: "dd7627" },
      { token: "keyword.table.header.md", foreground: "599ce7", fontStyle: "bold" },
    ],
    colors: {
      "editor.lineHighlightBackground": "#ffffff0a",
      "editor.lineHighlightBorder": "#00000000",
    },
  });
  if (!rawDarkThemeRegistered) {
    rawDarkThemeRegistered = true;
  }
}

function prepareMonaco(monacoInstance: Monaco) {
  ensureRawDarkTheme(monacoInstance);
  ensureMarkdownLanguage(monacoInstance);
}

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
    `declare module "rawagents"{
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
    verticalScrollbarSize: 6,
    horizontalScrollbarSize: 6,
    horizontal: "visible",
  },
  stickyScroll: { enabled: false },
  renderLineHighlight: "line",
  unicodeHighlight: {
    ambiguousCharacters: false,
    invisibleCharacters: false,
    nonBasicASCII: false,
  },
};

export interface MonacoEditorProps extends Omit<EditorProps, "loading" | "theme"> {
  theme?: string;
  height?: string | number;
  options?: editorNS.IStandaloneEditorConstructionOptions;
  onSave?: () => void;
}

export function MonacoEditor({ theme = RAW_DARK_THEME, options, height = "100%", onSave, onMount, ...props }: MonacoEditorProps) {
  const onSaveRef = useRef(onSave);
  onSaveRef.current = onSave;

  const handleMount: EditorProps["onMount"] = useCallback(
    (editor: EditorInstance, monacoInstance: Monaco) => {
      prepareMonaco(monacoInstance);
      ensureScriptDts(monacoInstance);
      monacoInstance.editor.setTheme(theme);
      editor.updateOptions({
        unicodeHighlight: {
          ambiguousCharacters: false,
          invisibleCharacters: false,
          nonBasicASCII: false,
        },
      });
      editor.addCommand(monacoInstance.KeyMod.CtrlCmd | monacoInstance.KeyCode.KeyS, () => {
        onSaveRef.current?.();
      });
      onMount?.(editor, monacoInstance);
    },
    [onMount, theme],
  );

  return (
    <MonacoReactEditor
      height={height}
      theme={theme}
      options={{ ...DEFAULT_OPTIONS, ...options }}
      onMount={handleMount}
      beforeMount={prepareMonaco}
      {...props}
    />
  );
}

const DEFAULT_DIFF_OPTIONS: editorNS.IDiffEditorConstructionOptions = {
  fontSize: 13,
  minimap: { enabled: false },
  scrollBeyondLastLine: false,
  padding: { top: 10, bottom: 10 },
  wordWrap: "off",
  automaticLayout: true,
  scrollbar: {
    verticalScrollbarSize: 6,
    horizontalScrollbarSize: 6,
    horizontal: "visible",
  },
  stickyScroll: { enabled: false },
  readOnly: true,
  renderSideBySide: false,
  unicodeHighlight: {
    ambiguousCharacters: false,
    invisibleCharacters: false,
    nonBasicASCII: false,
  },
};

export interface DiffEditorComponentProps extends Omit<MonacoDiffEditorProps, "loading" | "theme"> {
  theme?: string;
  height?: string | number;
  options?: editorNS.IDiffEditorConstructionOptions;
}

export function MonacoDiffEditor({ theme = RAW_DARK_THEME, options, height = "100%", onMount, ...props }: DiffEditorComponentProps) {
  const handleMount: NonNullable<MonacoDiffEditorProps["onMount"]> = useCallback(
    (editor, monacoInstance) => {
      prepareMonaco(monacoInstance);
      ensureScriptDts(monacoInstance);
      onMount?.(editor, monacoInstance);
    },
    [onMount],
  );

  return (
    <MonacoReactDiffEditor
      height={height}
      theme={theme}
      options={{ ...DEFAULT_DIFF_OPTIONS, ...options }}
      onMount={handleMount}
      beforeMount={prepareMonaco}
      {...props}
    />
  );
}
