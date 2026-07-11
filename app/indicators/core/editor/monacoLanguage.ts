import type { Monaco } from "@monaco-editor/react"
import type { editor, Position } from "monaco-editor"
import { LANGUAGE_DEFINITIONS } from "@/app/indicators/language/definitions"

let configured = false

export function configureFinScriptMonaco(monaco: Monaco) {
  if (configured) return
  configured = true

  monaco.languages.register({ id: "finscript" })
  monaco.languages.setLanguageConfiguration("finscript", {
    comments: { lineComment: "//" },
    brackets: [["(", ")"], ["[", "]"]],
    autoClosingPairs: [
      { open: "(", close: ")" },
      { open: "[", close: "]" },
      { open: '"', close: '"' },
    ],
  })

  monaco.languages.setMonarchTokensProvider("finscript", {
    tokenizer: {
      root: [
        [/\/\/.*$/, "comment"],
        [/\b(indicator|plot|plotshape|fill|alertcondition)\b/, "keyword"],
        [/\b(input|ta|math|color|array|barstate|shape|location|display)\b(?=\.)/, "namespace"],
        [/\b(true|false|and|or|not|if|else|while|for|to|na|nz)\b/, "keyword"],
        [/\b(open|high|low|close|volume|hl2|hlc3|ohlc4|hlcc4|bar_index)\b/, "variable.predefined"],
        [/#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{4}|[0-9a-fA-F]{3})\b/, "number.hex"],
        [/\d+(?:\.\d+)?/, "number"],
        [/[A-Za-z_][A-Za-z0-9_]*/, "identifier"],
        [/(?:=>|:=|==|!=|<=|>=|[?:=+\-*/%<>])/, "operator"],
        [/"([^"\\]|\\.)*$/, "string.invalid"],
        [/"/, { token: "string.quote", bracket: "@open", next: "@string" }],
      ],
      string: [
        [/[^\\"]+/, "string"],
        [/\\./, "string.escape"],
        [/"/, { token: "string.quote", bracket: "@close", next: "@pop" }],
      ],
    },
  })

  monaco.languages.registerCompletionItemProvider("finscript", {
    triggerCharacters: ["."],
    provideCompletionItems(model: editor.ITextModel, position: Position) {
      const word = model.getWordUntilPosition(position)
      const range = {
        startLineNumber: position.lineNumber,
        endLineNumber: position.lineNumber,
        startColumn: word.startColumn,
        endColumn: word.endColumn,
      }

      return {
        suggestions: Object.entries(LANGUAGE_DEFINITIONS).map(([name, definition]) => ({
          label: name,
          kind: definition.kind === "variable" || definition.kind === "constant"
            ? monaco.languages.CompletionItemKind.Variable
            : monaco.languages.CompletionItemKind.Function,
          insertText: definition.kind === "variable" || definition.kind === "constant"
            ? name
            : `${name}($0)`,
          insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          detail: definition.kind,
          documentation: definition.description,
          range,
        })),
      }
    },
  })
}
