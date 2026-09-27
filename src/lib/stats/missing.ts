/** Valores tratados como "dado faltante" nas análises (comparação sem diferenciar maiúsculas). */
const MISSING_TOKENS = new Set(["", "na", "n/a", "n.a.", "nd", "n/d", "nan", "null", "none", ".", "-", "--", "?", "sem informação", "sem informacao", "ignorado"]);

export function isMissingValue(v: unknown): boolean {
  if (v === null || v === undefined) return true;
  if (typeof v === "number") return !Number.isFinite(v);
  return MISSING_TOKENS.has(String(v).trim().toLowerCase());
}
