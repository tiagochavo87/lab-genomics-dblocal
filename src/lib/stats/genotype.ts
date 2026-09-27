/**
 * Leitura de genótipos em uma coluna ("AA", "AG", "A/G", "A|G", "A G",
 * "1/2", "0/1"...) e codificação para os modelos genéticos.
 */

const MISSING = new Set(["", "-9", "na", "nan", "n/a", "nd", ".", "null", "0/0?", "?", "-", "--", "00", "0 0"]);

/** Converte um valor de genótipo em par de alelos ordenado, ou null se faltante/ilegível. */
export function parseGenotype(value: unknown): [string, string] | null {
  if (value === null || value === undefined) return null;
  const raw = String(value).trim().toUpperCase();
  if (MISSING.has(raw.toLowerCase())) return null;
  let parts: string[];
  if (/[/|:\s,;-]/.test(raw)) parts = raw.split(/[/|:\s,;-]+/).filter(Boolean);
  else if (raw.length === 2) parts = [raw[0], raw[1]];
  else return null;
  if (parts.length !== 2) return null;
  const [a, b] = parts;
  if (!a || !b) return null;
  return a <= b ? [a, b] : [b, a];
}

export interface SnpInfo {
  column: string;
  alleles: string[];
  /** Alelo de referência (por padrão o mais frequente). */
  ref: string;
  /** Alelo de risco/alternativo (o outro). */
  alt: string;
  altFreq: number;
  nTyped: number;
  nMissing: number;
  nUnparsed: number;
  /** Rótulos dos genótipos na ordem ref/ref, ref/alt, alt/alt. */
  labels: [string, string, string];
  biallelic: boolean;
}

export function inspectSnp(rows: Record<string, unknown>[], column: string, refOverride?: string): SnpInfo {
  const counts = new Map<string, number>();
  let nTyped = 0;
  let nMissing = 0;
  let nUnparsed = 0;
  for (const r of rows) {
    const v = r[column];
    const g = parseGenotype(v);
    if (!g) {
      const s = String(v ?? "").trim().toLowerCase();
      if (MISSING.has(s)) nMissing++; else nUnparsed++;
      continue;
    }
    nTyped++;
    for (const a of g) counts.set(a, (counts.get(a) || 0) + 1);
  }
  const alleles = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([a]) => a);
  const ref = refOverride && alleles.includes(refOverride) ? refOverride : alleles[0] ?? "";
  const alt = alleles.find((a) => a !== ref) ?? "";
  const total = [...counts.values()].reduce((s, x) => s + x, 0);
  const altFreq = total ? (counts.get(alt) || 0) / total : NaN;
  const fmt = (a: string, b: string) => (a.length === 1 && b.length === 1 ? a + b : `${a}/${b}`);
  return {
    column, alleles, ref, alt, altFreq, nTyped, nMissing, nUnparsed,
    labels: [fmt(ref, ref), fmt(ref, alt), fmt(alt, alt)],
    biallelic: alleles.length === 2,
  };
}

/** Número de cópias do alelo alternativo (0, 1, 2) ou null. */
export function altDosage(value: unknown, snp: SnpInfo): number | null {
  const g = parseGenotype(value);
  if (!g) return null;
  if (!g.every((a) => a === snp.ref || a === snp.alt)) return null;
  return g.filter((a) => a === snp.alt).length;
}

export type GeneticModel = "codominante" | "dominante" | "recessivo" | "sobredominante" | "log-aditivo";

export const MODEL_LABEL: Record<GeneticModel, string> = {
  codominante: "Codominante",
  dominante: "Dominante",
  recessivo: "Recessivo",
  sobredominante: "Sobredominante",
  "log-aditivo": "Log-aditivo",
};

/**
 * Codifica a dose (0/1/2) conforme o modelo, devolvendo as colunas de
 * preditores e seus nomes (referência = homozigoto ref/ref, ou a categoria
 * "sem" o genótipo de interesse).
 */
export function encodeModel(dosage: number, model: GeneticModel, snp: SnpInfo): { values: number[]; names: string[] } {
  const [rr, ra, aa] = snp.labels;
  switch (model) {
    case "codominante":
      return { values: [dosage === 1 ? 1 : 0, dosage === 2 ? 1 : 0], names: [`${snp.column}: ${ra} vs ${rr}`, `${snp.column}: ${aa} vs ${rr}`] };
    case "dominante":
      return { values: [dosage >= 1 ? 1 : 0], names: [`${snp.column}: ${ra}+${aa} vs ${rr}`] };
    case "recessivo":
      return { values: [dosage === 2 ? 1 : 0], names: [`${snp.column}: ${aa} vs ${rr}+${ra}`] };
    case "sobredominante":
      return { values: [dosage === 1 ? 1 : 0], names: [`${snp.column}: ${ra} vs ${rr}+${aa}`] };
    case "log-aditivo":
      return { values: [dosage], names: [`${snp.column}: por alelo ${snp.alt}`] };
  }
}

export interface MlocusConversion {
  text: string;
  /** Codificação usada: 1 = alelo mais frequente, 2 = o outro. */
  legend: Array<{ snp: string; allele1: string; allele2: string; biallelic: boolean }>;
  nSamples: number;
}

/**
 * Converte uma tabela com genótipos (ex.: "AG", "A/G") para o formato MLOCUS
 * usado na análise de LD: ID + 2 colunas por locus, alelos 1/2, faltante -9.
 * SNPs com mais de dois alelos ficam de fora (o LD é calculado para bialélicos).
 */
export function toMlocus(rows: Record<string, unknown>[], idColumn: string | null, snpColumns: string[]): MlocusConversion {
  const infos = snpColumns.map((c) => inspectSnp(rows, c));
  const usable = infos.filter((i) => i.biallelic);
  const clean = (s: string) => s.replace(/[\t\r\n]+/g, " ").trim();
  const header = ["ID", ...usable.flatMap((i) => [`${clean(i.column)}_1`, `${clean(i.column)}_2`])];
  const lines = [header.join("\t")];
  rows.forEach((r, idx) => {
    const idRaw = idColumn ? r[idColumn] : null;
    const id = idRaw === null || idRaw === undefined || String(idRaw).trim() === "" ? `S${idx + 1}` : clean(String(idRaw));
    const cells = usable.flatMap((info) => {
      const g = parseGenotype(r[info.column]);
      if (!g || !g.every((a) => a === info.ref || a === info.alt)) return ["-9", "-9"];
      return g.map((a) => (a === info.ref ? "1" : "2")).sort();
    });
    lines.push([id, ...cells].join("\t"));
  });
  return {
    text: lines.join("\n"),
    legend: infos.map((i) => ({ snp: i.column, allele1: i.ref, allele2: i.alt, biallelic: i.biallelic })),
    nSamples: rows.length,
  };
}
