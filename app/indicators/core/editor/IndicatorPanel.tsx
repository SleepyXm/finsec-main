// app/indicators/editor/IndicatorPanel.tsx

"use client"

import { useState } from "react"
import { IndicatorEditor } from "./Editor"
import { DEFAULT_INDICATOR_SCRIPT } from "./defaults"
import { compileFinScript } from "@/app/indicators/language/compiler"
import type { FinScriptDiagnostic, InputDescriptor } from "@/app/indicators/language/types"
import { FINSCRIPT_EXAMPLES } from "@/app/indicators/language/examples"
import { useChartContext } from "@/app/chart/chartcontext"

export function IndicatorPanel() {
  const { applyIndicator, removeIndicator, appliedIndicators } = useChartContext()
  const [script, setScript] = useState(DEFAULT_INDICATOR_SCRIPT)
  const [tab, setTab] = useState<"editor" | "export">("editor")
  const [diagnostics, setDiagnostics] = useState<FinScriptDiagnostic[]>([])
  const [status, setStatus] = useState<"idle" | "applied" | "error">("idle")
  const [inputDefinitions, setInputDefinitions] = useState<InputDescriptor[]>([])
  const [inputValues, setInputValues] = useState<Record<string, number | boolean | string>>({})
  const preview = appliedIndicators.find((entry) => entry.id === "editor-preview")

  const handleApply = () => {
    const result = compileFinScript(script)
    setDiagnostics(result.diagnostics)

    if (!result.ok) {
      setStatus("error")
      return
    }

    const nextInputs = Object.fromEntries(result.compiled.inputs.map((input) => [
      input.id,
      inputValues[input.id] ?? input.defaultValue,
    ]))
    setInputDefinitions(result.compiled.inputs)
    setInputValues(nextInputs)

    applyIndicator({
      id: "editor-preview",
      source: script,
      compiled: result.compiled,
      inputs: nextInputs,
      enabled: true,
    })
    setStatus("applied")
  }

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        background: "#090b10",
        borderLeft: "1px solid #1e2130",
        color: "#e2e8f0",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <div
        style={{
          height: 42,
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "0 12px",
          borderBottom: "1px solid #1e2130",
        }}
      >
        <TabButton
          label="Editor"
          active={tab === "editor"}
          onClick={() => setTab("editor")}
        />

        <TabButton
          label="Export"
          active={tab === "export"}
          onClick={() => setTab("export")}
        />

        <select
          aria-label="Load example indicator"
          defaultValue=""
          onChange={(event) => {
            const example = FINSCRIPT_EXAMPLES.find((entry) => entry.id === event.target.value)
            if (!example) return
            setScript(example.source)
            setDiagnostics([])
            setStatus("idle")
            setInputDefinitions([])
            setInputValues({})
            event.target.value = ""
          }}
          style={{
            maxWidth: 165,
            border: "1px solid #31384a",
            background: "#11151d",
            color: "#94a3b8",
            borderRadius: 4,
            padding: "5px 7px",
            fontSize: 11,
          }}
        >
          <option value="" disabled>Load example…</option>
          {FINSCRIPT_EXAMPLES.map((example) => (
            <option key={example.id} value={example.id}>{example.title}</option>
          ))}
        </select>

        <div style={{ flex: 1 }} />

        {preview && (
          <button
            type="button"
            onClick={() => removeIndicator("editor-preview")}
            style={actionButtonStyle("secondary")}
          >
            Remove
          </button>
        )}

        <button type="button" onClick={handleApply} style={actionButtonStyle("primary")}>
          Apply
        </button>
      </div>

      {inputDefinitions.length > 0 && (
        <div style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 10,
          padding: "8px 12px",
          borderBottom: "1px solid #1e2130",
          background: "#0d1017",
        }}>
          {inputDefinitions.map((input) => (
            <IndicatorInput
              key={input.id}
              input={input}
              value={inputValues[input.id] ?? input.defaultValue}
              onChange={(value) => {
                setInputValues((current) => ({ ...current, [input.id]: value }))
                setStatus("idle")
              }}
            />
          ))}
        </div>
      )}

      <div style={{ flex: 1, minHeight: 0, padding: 12 }}>
        {tab === "editor" && (
          <IndicatorEditor
            value={script}
            onChange={(value) => {
              setScript(value)
              setStatus("idle")
              setInputDefinitions([])
              setInputValues({})
            }}
            diagnostics={diagnostics}
          />
        )}

        {tab === "export" && (
          <textarea
            value={script}
            readOnly
            style={{
              width: "100%",
              height: "100%",
              resize: "none",
              background: "#0f1117",
              color: "#e2e8f0",
              border: "1px solid #1e2130",
              borderRadius: 4,
              padding: 10,
              fontFamily: "monospace",
              fontSize: 11,
              lineHeight: 1.5,
            }}
          />
        )}
      </div>

      {(status !== "idle" || diagnostics.length > 0) && (
        <div style={{
          flexShrink: 0,
          maxHeight: 120,
          overflowY: "auto",
          padding: "8px 12px",
          borderTop: "1px solid #1e2130",
          fontSize: 11,
        }}>
          {status === "applied" && diagnostics.length === 0 && (
            <div style={{ color: "#34d399" }}>Applied to the chart.</div>
          )}
          {diagnostics.map((entry, index) => (
            <div key={`${entry.code}-${entry.start}-${index}`} style={{
              color: entry.severity === "error" ? "#fb7185" : "#fbbf24",
              marginBottom: 3,
            }}>
              {entry.line}:{entry.column} {entry.message}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function IndicatorInput({
  input,
  value,
  onChange,
}: {
  input: InputDescriptor
  value: number | boolean | string
  onChange: (value: number | boolean | string) => void
}) {
  const controlStyle: React.CSSProperties = {
    width: input.type === "color" ? 34 : 82,
    height: 26,
    border: "1px solid #31384a",
    borderRadius: 4,
    background: "#11151d",
    color: "#e2e8f0",
    padding: input.type === "color" ? 2 : "3px 6px",
    fontSize: 11,
  }

  return (
    <label style={{ display: "flex", alignItems: "center", gap: 6, color: "#94a3b8", fontSize: 11 }}>
      <span>{input.title}</span>
      {input.type === "bool" ? (
        <input
          type="checkbox"
          checked={Boolean(value)}
          onChange={(event) => onChange(event.target.checked)}
        />
      ) : input.type === "color" ? (
        <input
          aria-label={input.title}
          type="color"
          value={typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value) ? value : "#2962ff"}
          onChange={(event) => onChange(event.target.value)}
          style={controlStyle}
        />
      ) : (
        <input
          aria-label={input.title}
          type="number"
          step={input.type === "int" ? 1 : "any"}
          value={Number(value)}
          onChange={(event) => onChange(input.type === "int"
            ? Math.trunc(event.target.valueAsNumber)
            : event.target.valueAsNumber)}
          style={controlStyle}
        />
      )}
    </label>
  )
}

function actionButtonStyle(kind: "primary" | "secondary"): React.CSSProperties {
  return {
    border: `1px solid ${kind === "primary" ? "#2563eb" : "#31384a"}`,
    background: kind === "primary" ? "#2563eb" : "transparent",
    color: kind === "primary" ? "#fff" : "#94a3b8",
    borderRadius: 4,
    padding: "5px 9px",
    cursor: "pointer",
    fontSize: 11,
  }
}

function TabButton({
  label,
  active,
  onClick,
}: {
  label: string
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      style={{
        border: "none",
        background: active ? "#1e2130" : "transparent",
        color: active ? "#e2e8f0" : "#6b7280",
        borderRadius: 4,
        padding: "5px 8px",
        cursor: "pointer",
        fontSize: 11,
      }}
    >
      {label}
    </button>
  )
}
