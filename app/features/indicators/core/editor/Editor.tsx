// app/indicators/editor/IndicatorEditor.tsx

"use client"

import dynamic from "next/dynamic"
import { useEffect, useRef } from "react"
import { Monaco, OnMount } from "@monaco-editor/react";
import { DEFAULT_INDICATOR_SCRIPT } from "./defaults"
import { configureFinScriptMonaco } from "./monacoLanguage"
import { FinScriptDiagnostic } from "@/app/features/indicators/language/types";

const MonacoEditor = dynamic(
  () => import("@monaco-editor/react"),
  { ssr: false }
)

type IndicatorEditorProps = {
  value: string
  onChange: (value: string) => void
  diagnostics?: FinScriptDiagnostic[]
}

export function IndicatorEditor({
  value,
  onChange,
  diagnostics = [],
}: IndicatorEditorProps) {
  const editorRef = useRef<Parameters<OnMount>[0] | null>(null)
  const monacoRef = useRef<Monaco | null>(null)

  const handleMount: OnMount = (editor, monaco) => {
    editorRef.current = editor
    monacoRef.current = monaco
  }

  useEffect(() => {
    const editor = editorRef.current
    const monaco = monacoRef.current
    const model = editor?.getModel()
    if (!editor || !monaco || !model) return

    monaco.editor.setModelMarkers(
      model,
      "finscript",
      diagnostics.map((entry) => ({
        severity: entry.severity === "error"
          ? monaco.MarkerSeverity.Error
          : monaco.MarkerSeverity.Warning,
        message: entry.message,
        code: entry.code,
        startLineNumber: entry.line,
        startColumn: entry.column,
        endLineNumber: entry.line,
        endColumn: Math.max(entry.column + 1, entry.column + (entry.end - entry.start)),
      })),
    )
  }, [diagnostics])

  return (
    <div
      style={{
        height: "100%",
        width: "100%",
        background: "#0f1117",
        border: "1px solid #1e2130",
      }}
    >
      <MonacoEditor
        height="100%"
        defaultLanguage="finscript"
        theme="vs-dark"
        value={value || DEFAULT_INDICATOR_SCRIPT}
        onChange={(next) => onChange(next ?? "")}
        beforeMount={configureFinScriptMonaco}
        onMount={handleMount}
        options={{
          minimap: { enabled: false },
          fontSize: 12,
          lineNumbers: "on",
          wordWrap: "on",
          scrollBeyondLastLine: false,
          automaticLayout: true,
          tabSize: 2,
          suggestOnTriggerCharacters: true,
        }}
      />
    </div>
  )
}
