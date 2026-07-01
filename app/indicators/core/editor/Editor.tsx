// app/indicators/editor/IndicatorEditor.tsx

"use client"

import dynamic from "next/dynamic"
import { DEFAULT_INDICATOR_SCRIPT } from "./defaults"

const MonacoEditor = dynamic(
  () => import("@monaco-editor/react"),
  { ssr: false }
)

type IndicatorEditorProps = {
  value: string
  onChange: (value: string) => void
}

export function IndicatorEditor({
  value,
  onChange,
}: IndicatorEditorProps) {
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
        defaultLanguage="javascript"
        theme="vs-dark"
        value={value || DEFAULT_INDICATOR_SCRIPT}
        onChange={(next) => onChange(next ?? "")}
        options={{
          minimap: { enabled: false },
          fontSize: 12,
          lineNumbers: "on",
          wordWrap: "on",
          scrollBeyondLastLine: false,
          automaticLayout: true,
          tabSize: 2,
        }}
      />
    </div>
  )
}