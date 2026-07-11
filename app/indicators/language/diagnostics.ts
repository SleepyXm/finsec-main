import type { FinScriptDiagnostic, SourceLocation } from "./types"

export function diagnostic(
  code: string,
  message: string,
  location: SourceLocation,
  severity: FinScriptDiagnostic["severity"] = "error",
): FinScriptDiagnostic {
  return { code, message, severity, ...location }
}

export const EMPTY_LOCATION: SourceLocation = {
  line: 1,
  column: 1,
  start: 0,
  end: 0,
}

