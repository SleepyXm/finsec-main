import { checkFinScript } from "./checker"
import { lexFinScript } from "./lexer"
import { parseFinScript } from "./parser"
import type {
  CallExpression,
  CompiledIndicator,
  FinScriptDiagnostic,
  InputDescriptor,
  LiteralExpression,
} from "./types"

export type CompileResult =
  | { ok: true; compiled: CompiledIndicator; diagnostics: FinScriptDiagnostic[] }
  | { ok: false; diagnostics: FinScriptDiagnostic[] }

const literalValue = (expression: CallExpression, name: string, index: number) => {
  const argument = expression.args.find((arg) => arg.name === name) ?? expression.args.filter((arg) => !arg.name)[index]
  return argument?.value.kind === "literal" ? (argument.value as LiteralExpression).value : undefined
}

export function compileFinScript(source: string): CompileResult {
  const lexed = lexFinScript(source)
  const parsed = parseFinScript(lexed.tokens)
  const checked = checkFinScript(parsed.program)
  const diagnostics = [...lexed.diagnostics, ...parsed.diagnostics, ...checked.diagnostics]

  if (diagnostics.some((entry) => entry.severity === "error")) {
    return { ok: false, diagnostics }
  }

  let title = "Untitled Indicator"
  let overlay = true
  const inputs: InputDescriptor[] = []

  for (const statement of parsed.program.statements) {
    const expression = statement.kind === "expression" ? statement.expression : statement.value
    if (expression.kind === "call" && expression.callee === "indicator") {
      const nextTitle = literalValue(expression, "title", 0)
      const nextOverlay = literalValue(expression, "overlay", 1)
      if (typeof nextTitle === "string") title = nextTitle
      if (typeof nextOverlay === "boolean") overlay = nextOverlay
    }

    if (statement.kind === "assignment" && expression.kind === "call" && expression.callee.startsWith("input.")) {
      const defaultValue = literalValue(expression, "default", 0)
      const inputTitle = literalValue(expression, "title", 1)
      if (typeof defaultValue === "number" || typeof defaultValue === "boolean") {
        inputs.push({
          id: statement.name,
          title: typeof inputTitle === "string" ? inputTitle : statement.name,
          type: expression.callee === "input.bool" ? "bool" : expression.callee === "input.int" ? "int" : "float",
          defaultValue,
        })
      }
    }
  }

  return {
    ok: true,
    diagnostics,
    compiled: {
      languageVersion: 1,
      metadata: { title, overlay },
      inputs,
      program: parsed.program,
    },
  }
}

