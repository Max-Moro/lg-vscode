import type { RunResult } from "./runner/LgLocator";

/** Текущая ожидаемая версия JSON-протокола CLI */
export const EXPECTED_PROTOCOL = 4;

export class ProtocolMismatchError extends Error {
  constructor(public actual: number) {
    super(
      `Listing Generator protocol mismatch: expected ${EXPECTED_PROTOCOL}, got ${actual}. ` +
      `Please update the CLI (and/or the VS Code extension).`
    );
    this.name = "ProtocolMismatchError";
  }
}

/** Лёгкая проверка только обязательного поля protocol */
export function assertProtocol<T extends { protocol?: number }>(obj: T, kind: "report" | "diag"): void {
  const p = obj?.protocol;
  if (typeof p !== "number") {
    throw new Error(`Invalid ${kind} payload: missing 'protocol' field`);
  }
  if (p !== EXPECTED_PROTOCOL) {
    throw new ProtocolMismatchError(p);
  }
}

