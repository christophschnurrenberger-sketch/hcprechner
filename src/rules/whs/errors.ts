/**
 * Fachlicher Eingabefehler: Die Berechnung ist mit den vorhandenen Daten nach
 * dem Regelwerk nicht möglich. `code` wird in der UI in einen Text übersetzt.
 */
export class WhsInputError extends Error {
  readonly code: string;
  readonly params?: Record<string, string | number>;

  constructor(code: string, params?: Record<string, string | number>) {
    super(code + (params ? " " + JSON.stringify(params) : ""));
    this.name = "WhsInputError";
    this.code = code;
    this.params = params;
  }
}

export function isWhsInputError(error: unknown): error is WhsInputError {
  return error instanceof WhsInputError;
}
