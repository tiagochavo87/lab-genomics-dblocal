import { useMemo, useState } from "react";
import DataSourcePicker, { LoadedData, Row } from "@/components/analysis/DataSourcePicker";
import {
  ColumnChecklist, ColumnSelect, fmt, MethodsNote, PBadge, toNumber, uniqueValues, useColumnKinds, xnum, fileBase,
} from "@/components/analysis/controls";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { altDosage, GeneticModel, inspectSnp, MODEL_LABEL } from "@/lib/stats/genotype";
import {
  chiSquareTable, describe, Describe, fisherExact2xK, kruskalWallis, mannWhitney, oneWayAnova, TestResult, welchT,
} from "@/lib/stats/tests";
import { isMissingValue } from "@/lib/stats/missing";
import { downloadXlsx, SheetSpec } from "@/lib/spreadsheet";
import { logActivity } from "@/lib/activityLog";
import { toast } from "sonner";
import { FileSpreadsheet, GitCompare } from "lucide-react";

type Outcome =
  | { kind: "numerica"; variable: string; groups: string[]; stats: Describe[]; nonParam: TestResult; param: TestResult }
  | { kind: "categorica"; variable: string; groups: string[]; levels: string[]; counts: number[][]; chi2: number; pChi2: number; pFisher: number; lowExpected: boolean };

const METHODS =
  "Variáveis numéricas foram descritas por média ± desvio-padrão e mediana [intervalo interquartil] e comparadas entre os grupos " +
  "pelo teste de Mann-Whitney (2 grupos) ou Kruskal-Wallis (3 ou mais grupos); como alternativa paramétrica são mostrados o teste t " +
  "de Welch e a ANOVA de um fator. Variáveis categóricas foram comparadas pelo teste qui-quadrado de Pearson e, em tabelas 2×2 e 2×3, " +
  "também pelo teste exato de Fisher (Freeman-Halton).";

const MODEL_GROUPS: Record<GeneticModel, (d: number, l: [string, string, string]) => string> = {
  codominante: (d, l) => l[d],
  dominante: (d, l) => (d === 0 ? l[0] : `${l[1]}+${l[2]}`),
  recessivo: (d, l) => (d === 2 ? l[2] : `${l[0]}+${l[1]}`),
  sobredominante: (d, l) => (d === 1 ? l[1] : `${l[0]}+${l[2]}`),
  "log-aditivo": (d, l) => l[d],
};

export default function ComparisonPage() {
  const [data, setData] = useState<LoadedData | null>(null);
  const [groupCol, setGroupCol] = useState("");
  const [model, setModel] = useState<GeneticModel>("codominante");
  const [vars, setVars] = useState<string[]>([]);
  const [outcomes, setOutcomes] = useState<Outcome[] | null>(null);

  const rows = data?.rows ?? [];
  const columns = data?.columns ?? [];
  const kinds = useColumnKinds(rows, columns);
  const isGenotypeGroup = groupCol !== "" && kinds[groupCol] === "genotipo";

  /** Rótulo do grupo de cada linha (ou null se faltante). */
  const groupOf = useMemo(() => {
    if (!groupCol) return () => null;
    if (isGenotypeGroup) {
      const info = inspectSnp(rows, groupCol);
      return (r: Row) => {
        const d = altDosage(r[groupCol], info);
        return d === null ? null : MODEL_GROUPS[model](d, info.labels);
      };
    }
    return (r: Row) => {
      const v = r[groupCol];
      return isMissingValue(v) ? null : String(v);
    };
  }, [rows, groupCol, isGenotypeGroup, model]);

  const run = () => {
    const labelled = rows.map((r) => ({ r, g: groupOf(r) })).filter((x) => x.g !== null) as Array<{ r: Row; g: string }>;
    let groups = [...new Set(labelled.map((x) => x.g))];
    if (isGenotypeGroup) {
      const info = inspectSnp(rows, groupCol);
      const order = [0, 1, 2].map((d) => MODEL_GROUPS[model](d, info.labels));
      groups = order.filter((g, i) => order.indexOf(g) === i && groups.includes(g));
    } else {
      const byFreq = uniqueValues(rows, groupCol);
      groups = byFreq.filter((g) => groups.includes(g));
    }
    const out: Outcome[] = [];
    for (const v of vars) {
      if (kinds[v] === "numerica") {
        const values = groups.map((g) => labelled.filter((x) => x.g === g).map((x) => toNumber(x.r[v])).filter((n): n is number => n !== null));
        const valid = values.map((vals, i) => ({ vals, g: groups[i] })).filter((x) => x.vals.length > 0);
        const gs = valid.map((x) => x.g);
        const vs = valid.map((x) => x.vals);
        const two = vs.length === 2;
        out.push({
          kind: "numerica", variable: v, groups: gs, stats: vs.map(describe),
          nonParam: vs.length < 2 ? { statistic: NaN, p: NaN, method: "–" } : two ? mannWhitney(vs[0], vs[1]) : kruskalWallis(vs),
          param: vs.length < 2 || vs.some((x) => x.length < 2) ? { statistic: NaN, p: NaN, method: "–" } : two ? welchT(vs[0], vs[1]) : oneWayAnova(vs),
        });
      } else {
        const levels = uniqueValues(labelled.map((x) => x.r), v);
        const counts = groups.map((g) => levels.map((l) => labelled.filter((x) => x.g === g && String(x.r[v] ?? "") === l).length));
        const t = chiSquareTable(counts);
        // Fisher: tabela 2×k com as categorias da variável nas linhas quando há 2 grupos
        let pFisher = NaN;
        if (groups.length === 2 && levels.length <= 3) pFisher = fisherExact2xK(counts);
        else if (levels.length === 2 && groups.length <= 3) pFisher = fisherExact2xK(levels.map((_, j) => counts.map((row) => row[j])));
        out.push({ kind: "categorica", variable: v, groups, levels, counts, chi2: t.statistic, pChi2: t.p, pFisher, lowExpected: t.lowExpectedFraction > 0.2 });
      }
    }
    setOutcomes(out);
    void logActivity("analysis_group_comparison", "analysis", undefined, { variaveis: vars.length, fonte: data?.source });
  };

  const groupLabel = isGenotypeGroup ? `${groupCol} (modelo ${MODEL_LABEL[model].toLowerCase()})` : groupCol;

  const exportXlsx = () => {
    if (!outcomes) return;
    const num: Record<string, unknown>[] = [];
    const cat: Record<string, unknown>[] = [];
    for (const o of outcomes) {
      if (o.kind === "numerica") {
        o.groups.forEach((g, i) => num.push({
          Variável: o.variable, Grupo: g, N: o.stats[i].n, Média: xnum(o.stats[i].mean, 4), DP: xnum(o.stats[i].sd, 4),
          Mediana: xnum(o.stats[i].median, 4), Q1: xnum(o.stats[i].q1, 4), Q3: xnum(o.stats[i].q3, 4),
          "Teste não paramétrico": i === 0 ? o.nonParam.method : "", "p (não param.)": i === 0 ? xnum(o.nonParam.p) : "",
          "Teste paramétrico": i === 0 ? o.param.method : "", "p (param.)": i === 0 ? xnum(o.param.p) : "",
        }));
      } else {
        const totals = o.groups.map((_, i) => o.counts[i].reduce((s, x) => s + x, 0));
        o.levels.forEach((l, j) => {
          const row: Record<string, unknown> = { Variável: j === 0 ? o.variable : "", Categoria: l };
          o.groups.forEach((g, i) => {
            row[`${g} (n)`] = o.counts[i][j];
            row[`${g} (%)`] = xnum(totals[i] ? (100 * o.counts[i][j]) / totals[i] : NaN, 2);
          });
          row["p (qui-quadrado)"] = j === 0 ? xnum(o.pChi2) : "";
          row["p (Fisher)"] = j === 0 ? xnum(o.pFisher) : "";
          cat.push(row);
        });
      }
    }
    const sheets: SheetSpec[] = [];
    if (num.length) sheets.push({ name: "Numéricas", rows: num });
    if (cat.length) sheets.push({ name: "Categóricas", rows: cat });
    sheets.push({ name: "Métodos", aoa: [["Métodos"], [METHODS], [""], ["Grupos", groupLabel], ["Fonte dos dados", data?.label ?? ""]] });
    void downloadXlsx(`Comparacao_${fileBase(data?.label)}.xlsx`, sheets)
      .then(() => toast.success("Arquivo exportado!"))
      .catch((e) => toast.error("Falha ao gerar o XLSX: " + (e?.message || e)));
  };

  return (
    <div className="p-6 space-y-6">
      <div>
        <h2 className="text-2xl font-bold font-display flex items-center gap-2"><GitCompare className="h-6 w-6 text-primary" />Comparação entre Grupos</h2>
        <p className="text-sm text-muted-foreground">Compara variáveis clínicas (ex.: C3, idade, sexo) entre grupos ou entre genótipos de um SNP.</p>
      </div>

      <DataSourcePicker onData={(d) => { setData(d); setVars([]); setGroupCol(""); setOutcomes(null); }} />

      {data && (
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-base">2. Configuração</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-4">
              <ColumnSelect label="Separar os grupos por" value={groupCol} onChange={setGroupCol} columns={columns} kinds={kinds} filter={(c) => kinds[c] === "categorica" || kinds[c] === "genotipo"} />
              {isGenotypeGroup && (
                <div className="space-y-1.5 min-w-[200px]">
                  <Label className="text-xs text-muted-foreground uppercase tracking-wider">Agrupar genótipos (modelo)</Label>
                  <Select value={model} onValueChange={(v) => setModel(v as GeneticModel)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {(["codominante", "dominante", "recessivo", "sobredominante"] as GeneticModel[]).map((m) => <SelectItem key={m} value={m}>{MODEL_LABEL[m]}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
            <ColumnChecklist label="Variáveis a comparar" columns={columns} kinds={kinds} selected={vars} onChange={setVars} filter={(c) => c !== groupCol && kinds[c] !== "genotipo" && kinds[c] !== "identificador"} />
            <Button onClick={run} disabled={!groupCol || !vars.length}>Calcular</Button>
          </CardContent>
        </Card>
      )}

      {outcomes && (
        <Card>
          <CardHeader className="pb-3 flex-row items-center justify-between">
            <CardTitle className="text-base">3. Resultados — grupos: {groupLabel}</CardTitle>
            <Button variant="outline" size="sm" className="gap-1.5" onClick={exportXlsx}><FileSpreadsheet className="h-4 w-4" />Exportar XLSX</Button>
          </CardHeader>
          <CardContent className="space-y-8">
            {outcomes.map((o) => (
              <div key={o.variable} className="space-y-2 overflow-x-auto">
                <h3 className="font-semibold">{o.variable}</h3>
                {o.kind === "numerica" ? (
                  <>
                    <Table>
                      <TableHeader><TableRow><TableHead>Grupo</TableHead><TableHead>N</TableHead><TableHead>Média ± DP</TableHead><TableHead>Mediana [Q1–Q3]</TableHead></TableRow></TableHeader>
                      <TableBody>
                        {o.groups.map((g, i) => (
                          <TableRow key={g}>
                            <TableCell>{g}</TableCell><TableCell>{o.stats[i].n}</TableCell>
                            <TableCell>{fmt(o.stats[i].mean)} ± {fmt(o.stats[i].sd)}</TableCell>
                            <TableCell>{fmt(o.stats[i].median)} [{fmt(o.stats[i].q1)}–{fmt(o.stats[i].q3)}]</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                    <p className="text-sm">{o.nonParam.method}: p = <PBadge p={o.nonParam.p} /> · {o.param.method}: p = <PBadge p={o.param.p} /></p>
                  </>
                ) : (
                  <>
                    <Table>
                      <TableHeader><TableRow><TableHead>Grupo</TableHead>{o.levels.map((l) => <TableHead key={l}>{l}</TableHead>)}</TableRow></TableHeader>
                      <TableBody>
                        {o.groups.map((g, i) => {
                          const tot = o.counts[i].reduce((s, x) => s + x, 0);
                          return (
                            <TableRow key={g}>
                              <TableCell>{g} (n={tot})</TableCell>
                              {o.counts[i].map((c, j) => <TableCell key={j}>{c} ({fmt(tot ? (100 * c) / tot : NaN, 1)}%)</TableCell>)}
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                    <p className="text-sm">Qui-quadrado: p = <PBadge p={o.pChi2} />{Number.isFinite(o.pFisher) && <> · Fisher exato: p = <PBadge p={o.pFisher} /></>}</p>
                    {o.lowExpected && <p className="text-xs text-amber-600">⚠ Frequências esperadas baixas: prefira o teste exato de Fisher quando disponível.</p>}
                  </>
                )}
              </div>
            ))}
            <MethodsNote text={METHODS} />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
