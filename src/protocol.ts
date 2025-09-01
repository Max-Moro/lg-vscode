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

export function assertProtocol<T extends { protocol?: number }>(obj: T, kind: "report" | "diag"): void {
  const p = obj?.protocol;
  if (typeof p !== "number") {
    throw new Error(`Invalid ${kind} payload: missing 'protocol' field`);
  }
  if (p !== EXPECTED_PROTOCOL) {
    throw new ProtocolMismatchError(p);
  }
}

/** Централизованный тип отчёта (из run_result.schema.json) */
export type RunResult = {
  protocol: number;
  scope: "context" | "section";
  target: string;
  model: string;
  encoder: string;
  ctxLimit: number;
  total: {
    sizeBytes: number;
    tokensProcessed: number;
    tokensRaw: number;
    savedTokens: number;
    savedPct: number;
    ctxShare: number;
    renderedTokens?: number;
    renderedOverheadTokens?: number;
    metaSummary: Record<string, number>;
  };
  files: Array<{
    path: string;
    sizeBytes: number;
    tokensRaw: number;
    tokensProcessed: number;
    savedTokens: number;
    savedPct: number;
    promptShare: number;
    ctxShare: number;
    meta: Record<string, string | number | boolean>;
  }>;
  context?: {
    templateName: string;
    sectionsUsed: Record<string, number>;
    finalRenderedTokens?: number;
    templateOnlyTokens?: number;
    templateOverheadPct?: number;
    finalCtxShare?: number;
  };
};
