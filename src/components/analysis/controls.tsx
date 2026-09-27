import { useMemo } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { parseGenotype } from "@/lib/stats/genotype";
import { isMissingValue } from "@/lib/stats/missing";
import type { Row } from "./DataSourcePicker";

export function toNumber(v: unknown): number | null {
  if (isMissingValue(v)) return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const n = Number(String(v).trim().replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

const ALLELE_RE = /^([ACGTN]+|[ID]|INS|DEL|\d{1,2})$/i;

export type ColumnKind = "genotipo" | "numerica" | "categorica" | "identificador";

/** Classifica a coluna pelos valores: genótipo, numérica ou categórica. */
export function columnKind(rows: Row[], col: string): ColumnKind {
  const vals = rows.map((r) => r[col]).filter((v) => !isMissingValue(v));
  if (!vals.length) return "categorica";
  const genos = vals.filter((v) => {
    if (typeof v !== "string") return false;
    const g = parseGenotype(v);
    // alelos plausíveis: bases (A, C, G, T), I/D, INS/DEL ou códigos numéricos curtos com separador (ex.: 1/2)
    return g !== null && /[A-Za-z]|[/|]/.test(v) && g.every((a) => ALLELE_RE.test(a));
  }).length;
  if (genos / vals.length >= 0.8) return "genotipo";
  const nums = vals.filter((v) => toNumber(v) !== null).length;
  const distinct = new Set(vals.map(String)).size;
  // texto com valor diferente em quase toda linha (ex.: código da amostra) = identificador
  if (nums / vals.length < 0.95 && vals.length >= 20 && distinct >= 0.9 * vals.length) return "identificador";
  if (nums / vals.length >= 0.95 && distinct > 2) return "numerica";
  return "categorica";
}

export function uniqueValues(rows: Row[], col: string): string[] {
  const freq = new Map<string, number>();
  for (const r of rows) {
    const v = r[col];
    if (isMissingValue(v)) continue;
    freq.set(String(v), (freq.get(String(v)) || 0) + 1);
  }
  return [...freq.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([k]) => k);
}

export function useColumnKinds(rows: Row[], columns: string[]) {
  return useMemo(() => Object.fromEntries(columns.map((c) => [c, columnKind(rows, c)])) as Record<string, ColumnKind>, [rows, columns]);
}

const KIND_LABEL: Record<ColumnKind, string> = { genotipo: "genótipo", numerica: "numérica", categorica: "categórica", identificador: "identificador" };

export function ColumnSelect({ label, value, onChange, columns, kinds, placeholder = "Escolha a coluna", filter, labelOf }: {
  label: string; value: string; onChange: (v: string) => void; columns: string[];
  kinds?: Record<string, ColumnKind>; placeholder?: string; filter?: (c: string) => boolean;
  labelOf?: (c: string) => string | null;
}) {
  const list = filter ? columns.filter(filter) : columns;
  return (
    <div className="space-y-1.5 min-w-[220px]">
      <Label className="text-xs text-muted-foreground uppercase tracking-wider">{label}</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="w-full"><SelectValue placeholder={placeholder} /></SelectTrigger>
        <SelectContent>
          {list.map((c) => (
            <SelectItem key={c} value={c}>{labelOf?.(c) ?? `${c}${kinds?.[c] ? ` (${KIND_LABEL[kinds[c]]})` : ""}`}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

export function ValueSelect({ label, value, onChange, values }: { label: string; value: string; onChange: (v: string) => void; values: string[] }) {
  return (
    <div className="space-y-1.5 min-w-[180px]">
      <Label className="text-xs text-muted-foreground uppercase tracking-wider">{label}</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="w-full"><SelectValue placeholder="Escolha o valor" /></SelectTrigger>
        <SelectContent>{values.map((v) => <SelectItem key={v} value={v}>{v}</SelectItem>)}</SelectContent>
      </Select>
    </div>
  );
}

export function ColumnChecklist({ label, columns, selected, onChange, kinds, filter }: {
  label: string; columns: string[]; selected: string[]; onChange: (v: string[]) => void;
  kinds?: Record<string, ColumnKind>; filter?: (c: string) => boolean;
}) {
  const list = filter ? columns.filter(filter) : columns;
  const toggle = (c: string) => onChange(selected.includes(c) ? selected.filter((x) => x !== c) : [...selected, c]);
  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-muted-foreground uppercase tracking-wider">{label}</Label>
      {list.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhuma coluna compatível.</p>
      ) : (
        <div className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3 max-h-56 overflow-auto rounded-md border p-2">
          {list.map((c) => (
            <label key={c} className="flex items-center gap-2 text-sm cursor-pointer">
              <Checkbox checked={selected.includes(c)} onCheckedChange={() => toggle(c)} />
              <span className="truncate">{c}</span>
              {kinds && <span className="text-[10px] text-muted-foreground">{KIND_LABEL[kinds[c]]}</span>}
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

/** Formatação de números e p-valores (com vírgula decimal). */
export function fmt(v: number, digits = 2): string {
  if (!Number.isFinite(v)) return "–";
  return v.toLocaleString("pt-BR", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

export function fmtP(p: number): string {
  if (!Number.isFinite(p)) return "–";
  if (p < 0.001) return "< 0,001";
  return p.toLocaleString("pt-BR", { minimumFractionDigits: 3, maximumFractionDigits: 3 });
}

export function fmtOr(or: number, lo: number, hi: number): string {
  if (!Number.isFinite(or)) return "–";
  return `${fmt(or)} (${fmt(lo)}–${fmt(hi)})`;
}

/** Número arredondado para exportação (Excel), ou "NA". */
export function xnum(v: number, digits = 6): number | string {
  if (!Number.isFinite(v)) return "NA";
  // valores muito pequenos (ex.: p = 1,2e-10) mantêm 4 algarismos significativos em vez de virar 0
  if (v !== 0 && Math.abs(v) < 10 ** -Math.min(digits - 1, 3)) return Number(v.toPrecision(4));
  return Number(v.toFixed(digits));
}

export function PBadge({ p }: { p: number }) {
  const sig = Number.isFinite(p) && p < 0.05;
  return <span className={sig ? "font-semibold text-primary" : ""}>{fmtP(p)}</span>;
}

export function MethodsNote({ text }: { text: string }) {
  return (
    <div className="rounded-md bg-muted/50 p-3 text-xs text-muted-foreground leading-relaxed">
      <span className="font-semibold text-foreground">Métodos (para citar): </span>{text}
    </div>
  );
}

/** Nome-base para o arquivo exportado (sem a extensão do arquivo de origem). */
export function fileBase(label: string | undefined): string {
  return (label || "dados").replace(/\.(xlsx|xls|csv|txt|tsv)$/i, "");
}
