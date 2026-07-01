// app/indicators/editor/IndicatorPanel.tsx

"use client"

import { useState } from "react"
import { IndicatorEditor } from "./Editor"
import { DEFAULT_INDICATOR_SCRIPT } from "./defaults"

export function IndicatorPanel() {
  const [script, setScript] = useState(DEFAULT_INDICATOR_SCRIPT)
  const [tab, setTab] = useState<"editor" | "export">("editor")

  return (
    <div
      style={{
        width: 460,
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
      </div>

      <div style={{ flex: 1, padding: 12 }}>
        {tab === "editor" && (
          <IndicatorEditor value={script} onChange={setScript} />
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
    </div>
  )
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