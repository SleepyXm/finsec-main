// app/indicators/editor/IndicatorPanel.tsx

"use client"

import { useCallback, useEffect, useState } from "react"
import { IndicatorEditor } from "./Editor"
import { DEFAULT_INDICATOR_SCRIPT } from "./defaults"
import { compileFinScript } from "@/app/features/indicators/language/compiler"
import { FinScriptDiagnostic, InputDescriptor } from "@/app/features/indicators/language/types";
import { FINSCRIPT_EXAMPLES } from "@/app/features/indicators/language/examples"
import { useChartContext } from "@/app/(pages)/chart/chartcontext"
import { useSavedIndicators } from "@/app/components/hooks/useIndicators"

const DEFAULT_RESULT = compileFinScript(DEFAULT_INDICATOR_SCRIPT)
const DEFAULT_INPUTS = DEFAULT_RESULT.ok
  ? Object.fromEntries(DEFAULT_RESULT.compiled.inputs.map((input) => [input.id, input.defaultValue]))
  : {}

export function IndicatorPanel() {
  const { applyIndicator, removeIndicator, appliedIndicators } = useChartContext()
  const savedIndicators = useSavedIndicators()
  const [script, setScript] = useState(DEFAULT_INDICATOR_SCRIPT)
  const [diagnostics, setDiagnostics] = useState<FinScriptDiagnostic[]>(DEFAULT_RESULT.diagnostics)
  const [status, setStatus] = useState<"idle" | "applied" | "saved" | "error">(DEFAULT_RESULT.ok ? "applied" : "error")
  const [inputDefinitions, setInputDefinitions] = useState<InputDescriptor[]>(DEFAULT_RESULT.ok ? DEFAULT_RESULT.compiled.inputs : [])
  const [inputValues, setInputValues] = useState<Record<string, number | boolean | string>>(DEFAULT_INPUTS)
  const [selectedSavedIndicatorId, setSelectedSavedIndicatorId] = useState<string | null>(null)
  const activeIndicatorId = selectedSavedIndicatorId ?? "editor-preview"
  const activeIndicator = appliedIndicators.find((entry) => entry.id === activeIndicatorId)
  const selectedSavedIndicator = savedIndicators.items.find((entry) => entry.id === selectedSavedIndicatorId)

  const applySource = useCallback((
    source: string,
    id: string,
    values: Record<string, number | boolean | string> = {},
  ) => {
    const result = compileFinScript(source)
    setDiagnostics(result.diagnostics)

    if (!result.ok) {
      setInputDefinitions([])
      setInputValues({})
      setStatus("error")
      return
    }

    const nextInputs = Object.fromEntries(result.compiled.inputs.map((input) => [
      input.id,
      values[input.id] ?? input.defaultValue,
    ]))
    setInputDefinitions(result.compiled.inputs)
    setInputValues(nextInputs)

    applyIndicator({
      id,
      source,
      compiled: result.compiled,
      inputs: nextInputs,
      enabled: true,
    })
    setStatus("applied")
  }, [applyIndicator])

  useEffect(() => {
    if (!DEFAULT_RESULT.ok) return
    applyIndicator({
      id: "editor-preview",
      source: DEFAULT_INDICATOR_SCRIPT,
      compiled: DEFAULT_RESULT.compiled,
      inputs: DEFAULT_INPUTS,
      enabled: true,
    })
  }, [applyIndicator])

  const handleSave = async () => {
    try {
      const result = await savedIndicators.saveSource(script)
      setDiagnostics(result.diagnostics)
      setStatus(result.ok ? "saved" : "error")
    } catch {
      setStatus("error")
    }
  }

  const handleLoadSaved = async (id: string) => {
    try {
      const saved = await savedIndicators.loadSaved(id)
      setScript(saved.source)
      applySource(saved.source, saved.id)
    } catch {
      setStatus("error")
    }
  }

  const handleDeleteSaved = async () => {
    if (!selectedSavedIndicator) return
    try {
      await savedIndicators.deleteSaved(selectedSavedIndicator.id)
      removeIndicator(selectedSavedIndicator.id)
      setSelectedSavedIndicatorId(null)
      setStatus("idle")
    } catch {
      setStatus("error")
    }
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
          minHeight: 42,
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "8px 12px",
          borderBottom: "1px solid #1e2130",
        }}
      >
        <select
          aria-label="Choose indicator source"
          defaultValue=""
          disabled={savedIndicators.busyId !== null}
          onChange={(event) => {
            const selection = event.currentTarget.value
            event.target.value = ""

            if (selection.startsWith("example:")) {
              const example = FINSCRIPT_EXAMPLES.find((entry) => entry.id === selection.slice(8))
              if (!example) return
              setSelectedSavedIndicatorId(null)
              setScript(example.source)
              applySource(example.source, "editor-preview")
              return
            }

            if (selection.startsWith("saved:")) {
              const id = selection.slice(6)
              setSelectedSavedIndicatorId(id)
              void handleLoadSaved(id)
            }
          }}
          style={{
            minWidth: 0,
            width: 140,
            border: "1px solid #31384a",
            background: "#11151d",
            color: "#94a3b8",
            borderRadius: 4,
            padding: "5px 7px",
            fontSize: 11,
          }}
        >
          <option value="" disabled>Choose indicator…</option>
          <optgroup label="Examples">
            {FINSCRIPT_EXAMPLES.map((example) => (
              <option key={example.id} value={`example:${example.id}`}>{example.title}</option>
            ))}
          </optgroup>
          {savedIndicators.items.length > 0 && (
            <optgroup label="Saved">
              {savedIndicators.items.map((item) => (
                <option key={item.id} value={`saved:${item.id}`}>{item.name}</option>
              ))}
            </optgroup>
          )}
        </select>

        {activeIndicator && (
          <button
            type="button"
            onClick={() => removeIndicator(activeIndicatorId)}
            style={actionButtonStyle()}
          >
            Remove
          </button>
        )}

        <button
          type="button"
          disabled={savedIndicators.busyId !== null}
          onClick={handleSave}
          style={{ ...actionButtonStyle(), opacity: savedIndicators.busyId !== null ? 0.45 : 1 }}
        >
          Save
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
                const nextValues = { ...inputValues, [input.id]: value }
                setInputValues(nextValues)
                applySource(script, activeIndicatorId, nextValues)
              }}
            />
          ))}
        </div>
      )}

      <div style={{ flex: 1, minHeight: 0, padding: 12 }}>
        <IndicatorEditor
          value={script}
          onChange={(value) => {
            setScript(value)
            applySource(value, activeIndicatorId, inputValues)
          }}
          diagnostics={diagnostics}
        />
      </div>

      {(status !== "idle" || diagnostics.length > 0 || savedIndicators.error || selectedSavedIndicator) && (
        <div style={{
          flexShrink: 0,
          maxHeight: 120,
          overflowY: "auto",
          padding: "8px 12px",
          borderTop: "1px solid #1e2130",
          fontSize: 11,
        }}>
          {selectedSavedIndicator && (
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 5 }}>
              <span style={{ flex: 1, minWidth: 0, color: "#94a3b8", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {selectedSavedIndicator.name}
              </span>
              <button
                type="button"
                disabled={savedIndicators.busyId !== null}
                onClick={() => void handleDeleteSaved()}
                style={{
                  border: 0,
                  background: "transparent",
                  color: "#fb7185",
                  padding: 0,
                  fontSize: 10,
                  cursor: savedIndicators.busyId === null ? "pointer" : "wait",
                  opacity: savedIndicators.busyId === null ? 1 : 0.45,
                }}
              >
                Delete saved
              </button>
            </div>
          )}
          {status === "applied" && diagnostics.length === 0 && (
            <div style={{ color: "#34d399" }}>Applied to the chart.</div>
          )}
          {status === "saved" && diagnostics.length === 0 && (
            <div style={{ color: "#34d399" }}>Saved to your indicators.</div>
          )}
          {savedIndicators.error && (
            <div style={{ color: "#fb7185", marginBottom: 3 }}>{savedIndicators.error}</div>
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

function actionButtonStyle(): React.CSSProperties {
  return {
    border: "1px solid #31384a",
    background: "transparent",
    color: "#94a3b8",
    borderRadius: 4,
    padding: "5px 9px",
    cursor: "pointer",
    fontSize: 11,
  }
}
