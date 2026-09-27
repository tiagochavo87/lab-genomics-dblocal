import { useMemo, useState } from "react";
import BackToHub from "@/components/analysis/BackToHub";
import DataSourcePicker, { LoadedData } from "@/components/analysis/DataSourcePicker";
import {
  ColumnChecklist, ColumnSelect, fmt, fmtP, MethodsNote, PBadge, uniqueValues, useColumnKinds, xnum, fileBase,
} from "@/components/analysis/controls";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { altDosage, inspectSnp } from "@/lib/stats/genotype";
import { hardyWeinberg, HweResult } from "@/lib/stats/tests";
import { downloadXlsx } from "@/lib/spreadsheet";
import { logActivity } from "@/lib/activityLog";
import { toast } from "sonner";
import { FileSpreadsheet, Scale } from "lucide-react";

const ALL = "__todos__";

interface Line {
  snp: string;
  group: string;
  labels: [string, string, string];
  alt: string;
  r: HweResult;
  warn?: string;
}

const METHODS =
  "O equilíbrio de Hardy-Weinberg foi avaliado para cada SNP bialélico pelo teste qui-quadrado de Pearson com 1 grau de liberdade " +
  "(sem correção de continuidade) e pelo teste exato de Wigginton, Cutler e Abecasis (2005). Frequências genotípicas esperadas " +
  "foram calculadas a partir das frequências alélicas observadas. Em estudos caso-controle, recomenda-se avaliar o equilíbrio no grupo controle.";

export default function HardyWeinbergPage() {
  const [data, setData] = useState<LoadedData | null>(null);
  const [snps, setSnps] = useState<string[]>([]);
  const [groupCol, setGroupCol] = useState(ALL);
  const [lines, setLines] = useState<Line[] | null>(null);

  const rows = data?.rows ?? [];
  const columns = data?.columns ?? [];
  const kinds = useColumnKinds(rows, columns);

  const run = () => {
    const out: Line[] = [];
    const groups = groupCol === ALL ? [ALL] : uniqueValues(rows, groupCol);
    for (const snp of snps) {
      for (const g of groups) {
        const subset = g === ALL ? rows : rows.filter((r) => String(r[groupCol] ?? "") === g);
        const info = inspectSnp(rows, snp); // alelos definidos na amostra toda
        const c: [number, number, number] = [0, 0, 0];
        for (const r of subset) {
          const d = altDosage(r[snp], info);
          if (d !== null) c[d]++;
        }
        const res = hardyWeinberg(c[0], c[1], c[2]);
        out.push({
          snp, group: g === ALL ? "Todos" : g, labels: info.labels, alt: info.alt, r: res,
          warn: !info.biallelic ? `não bialélico (${info.alleles.join(", ")})` : res.n < 20 ? "amostra pequena" : undefined,
        });
      }
    }
    setLines(out);
    void logActivity("analysis_hardy_weinberg", "analysis", undefined, { snps: snps.length, fonte: data?.source });
  };

  const exportXlsx = () => {
    if (!lines) return;
    const rowsX = lines.map((l) => ({
      SNP: l.snp, Grupo: l.group, N: l.r.n, "Genótipos (hom. ref / het / hom. alt)": l.labels.join(" / "),
      "Obs. hom. ref": l.r.nAA, "Obs. het": l.r.nAB, "Obs. hom. alt": l.r.nBB,
      "Esp. hom. ref": xnum(l.r.expAA, 2), "Esp. het": xnum(l.r.expAB, 2), "Esp. hom. alt": xnum(l.r.expBB, 2),
      "Alelo menor/alt": l.alt, "Freq. alelo alt": xnum(1 - l.r.freqA, 4),
      "Qui-quadrado": xnum(l.r.chi2, 4), "p (qui-quadrado)": xnum(l.r.pChi2), "p (exato)": xnum(l.r.pExact),
      Observação: l.warn ?? "",
    }));
    void downloadXlsx(`Hardy-Weinberg_${fileBase(data?.label)}.xlsx`, [
      { name: "Hardy-Weinberg", rows: rowsX },
      { name: "Métodos", aoa: [["Métodos"], [METHODS], [""], ["Fonte dos dados", data?.label ?? ""]] },
    ]).then(() => toast.success("Arquivo exportado!")).catch((e) => toast.error("Falha ao gerar o XLSX: " + (e?.message || e)));
  };

  const groupOptions = useMemo(() => columns.filter((c) => kinds[c] === "categorica"), [columns, kinds]);

  return (
    <div className="p-6 space-y-6">
      <div>
        <BackToHub />
        <h2 className="text-2xl font-bold font-display flex items-center gap-2"><Scale className="h-6 w-6 text-primary" />Equilíbrio de Hardy-Weinberg</h2>
        <p className="text-sm text-muted-foreground">Testa se as frequências genotípicas de cada SNP estão de acordo com o esperado pelo equilíbrio de Hardy-Weinberg.</p>
      </div>

      <DataSourcePicker onData={(d) => { setData(d); setSnps([]); setLines(null); setGroupCol(ALL); }} />

      {data && (
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-base">2. Configuração</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <ColumnChecklist label="SNPs (colunas de genótipo)" columns={columns} kinds={kinds} selected={snps} onChange={setSnps} filter={(c) => kinds[c] === "genotipo"} />
            <div className="flex flex-wrap gap-4 items-end">
              <ColumnSelect label="Separar por grupo (opcional)" value={groupCol} onChange={setGroupCol} columns={[ALL, ...groupOptions]} placeholder="Todos juntos" labelOf={(c) => (c === ALL ? "Não separar (todos juntos)" : null)} />
              <Button onClick={run} disabled={!snps.length}>Calcular</Button>
            </div>
            {groupCol === ALL && <p className="text-xs text-muted-foreground">Dica: em estudo caso-controle, separe pelo grupo e olhe o equilíbrio nos controles.</p>}
          </CardContent>
        </Card>
      )}

      {lines && (
        <Card>
          <CardHeader className="pb-3 flex-row items-center justify-between">
            <CardTitle className="text-base">3. Resultados</CardTitle>
            <Button variant="outline" size="sm" className="gap-1.5" onClick={exportXlsx}><FileSpreadsheet className="h-4 w-4" />Exportar XLSX</Button>
          </CardHeader>
          <CardContent className="space-y-3 overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>SNP</TableHead><TableHead>Grupo</TableHead><TableHead>N</TableHead>
                  <TableHead>Observado (esperado)</TableHead><TableHead>Freq. alelo alt.</TableHead>
                  <TableHead>χ²</TableHead><TableHead>p (χ²)</TableHead><TableHead>p (exato)</TableHead><TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {lines.map((l, i) => (
                  <TableRow key={i}>
                    <TableCell className="font-medium">{l.snp}</TableCell>
                    <TableCell>{l.group}</TableCell>
                    <TableCell>{l.r.n}</TableCell>
                    <TableCell className="text-xs whitespace-nowrap">
                      {l.labels[0]} {l.r.nAA} ({fmt(l.r.expAA, 1)}) · {l.labels[1]} {l.r.nAB} ({fmt(l.r.expAB, 1)}) · {l.labels[2]} {l.r.nBB} ({fmt(l.r.expBB, 1)})
                    </TableCell>
                    <TableCell>{l.alt} {fmt(1 - l.r.freqA, 3)}</TableCell>
                    <TableCell>{fmt(l.r.chi2, 3)}</TableCell>
                    <TableCell><PBadge p={l.r.pChi2} /></TableCell>
                    <TableCell><PBadge p={l.r.pExact} /></TableCell>
                    <TableCell className="text-xs text-amber-600">{l.warn}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <p className="text-xs text-muted-foreground">p &lt; 0,05 (em destaque) indica desvio do equilíbrio. Com vários SNPs, considere correção para múltiplos testes (ex.: Bonferroni: 0,05 ÷ {snps.length} = {fmtP(0.05 / Math.max(1, snps.length))}).</p>
            <MethodsNote text={METHODS} />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
