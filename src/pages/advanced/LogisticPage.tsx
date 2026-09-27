import { useMemo, useState } from "react";
import BackToHub from "@/components/analysis/BackToHub";
import DataSourcePicker, { LoadedData, Row } from "@/components/analysis/DataSourcePicker";
import {
  ColumnChecklist, ColumnSelect, fmt, fmtOr, MethodsNote, PBadge, uniqueValues, useColumnKinds, ValueSelect, xnum, fileBase,
} from "@/components/analysis/controls";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { isMissingValue } from "@/lib/stats/missing";
import { buildCovariates } from "@/lib/stats/association";
import { chiSquareSurvival } from "@/lib/stats/distributions";
import { altDosage, encodeModel, GeneticModel, inspectSnp, MODEL_LABEL, SnpInfo } from "@/lib/stats/genotype";
import { logisticRegression, LogisticResult } from "@/lib/stats/tests";
import { downloadXlsx } from "@/lib/spreadsheet";
import { logActivity } from "@/lib/activityLog";
import { toast } from "sonner";
import { FileSpreadsheet, LineChart } from "lucide-react";

const OTHERS = "__demais__";
const isMissing = isMissingValue;

interface VarGroup { variable: string; kind: string; terms: string[]; pGlobal: number; reference: string }

interface Outcome {
  result: LogisticResult;
  groups: VarGroup[];
  nTotal: number;
  nExcluded: number;
  caseLabel: string;
  controlLabel: string;
  model: GeneticModel;
}

function methodsText(o: Outcome) {
  return (
    `Foi ajustado um modelo de regressão logística binária por máxima verossimilhança (algoritmo IRLS), tendo como desfecho ` +
    `"${o.caseLabel}" (codificado 1) versus "${o.controlLabel}" (codificado 0). Os preditores entraram simultaneamente no modelo ` +
    `(análise multivariada), de modo que cada razão de chances (OR) está ajustada pelas demais variáveis. Variáveis numéricas entraram ` +
    `na escala original (OR por unidade); variáveis categóricas foram codificadas como indicadoras, com a categoria mais frequente como ` +
    `referência; SNPs foram codificados no modelo ${MODEL_LABEL[o.model].toLowerCase()}, com o alelo mais frequente como referência. ` +
    `Os intervalos de confiança de 95% e os valores de p de cada termo foram obtidos pelo teste de Wald; para variáveis com mais de um ` +
    `termo, o p global foi obtido pelo teste da razão de verossimilhança. Foram analisados apenas os indivíduos sem dados faltantes ` +
    `nas variáveis do modelo (análise de casos completos).`
  );
}

export default function LogisticPage() {
  const [data, setData] = useState<LoadedData | null>(null);
  const [outcomeCol, setOutcomeCol] = useState("");
  const [caseValue, setCaseValue] = useState("");
  const [controlValue, setControlValue] = useState(OTHERS);
  const [predictors, setPredictors] = useState<string[]>([]);
  const [model, setModel] = useState<GeneticModel>("dominante");
  const [out, setOut] = useState<Outcome | null>(null);
  const [error, setError] = useState("");

  const rows = data?.rows ?? [];
  const columns = data?.columns ?? [];
  const kinds = useColumnKinds(rows, columns);
  const outcomeValues = useMemo(() => (outcomeCol ? uniqueValues(rows, outcomeCol) : []), [rows, outcomeCol]);
  const hasGenotype = predictors.some((p) => kinds[p] === "genotipo");

  const reset = () => { setOut(null); setError(""); };

  const run = () => {
    reset();
    const others = controlValue === OTHERS;
    const genoCols = predictors.filter((p) => kinds[p] === "genotipo");
    const otherCols = predictors.filter((p) => kinds[p] !== "genotipo");
    const snpInfo: Record<string, SnpInfo> = {};
    for (const g of genoCols) snpInfo[g] = inspectSnp(rows, g);

    // 1) linhas do desfecho escolhido e sem dados faltantes (casos completos)
    const inOutcome = rows.filter((r) => {
      const v = isMissing(r[outcomeCol]) ? null : String(r[outcomeCol]);
      return v !== null && (v === caseValue || (others ? true : v === controlValue));
    });
    const complete = inOutcome.filter((r) =>
      genoCols.every((g) => altDosage(r[g], snpInfo[g]) !== null) && otherCols.every((c) => !isMissing(r[c])),
    );
    if (complete.length < 10) { setError("Menos de 10 indivíduos com todos os dados preenchidos; não é possível ajustar o modelo."); return; }

    // 2) codificação
    const cov = buildCovariates(complete, otherCols);
    const X: number[][] = [];
    const y: number[] = [];
    let names: string[] = [];
    const encodeRow = (r: Row) => {
      const vals: number[] = [];
      const nm: string[] = [];
      for (const g of genoCols) {
        const e = encodeModel(altDosage(r[g], snpInfo[g]) as number, model, snpInfo[g]);
        vals.push(...e.values); nm.push(...e.names);
      }
      const c = cov.encode(r);
      if (!c) return null;
      return { vals: [...vals, ...c], names: [...nm, ...cov.names] };
    };
    for (const r of complete) {
      const e = encodeRow(r);
      if (!e) continue;
      X.push(e.vals); names = e.names;
      y.push(String(r[outcomeCol]) === caseValue ? 1 : 0);
    }
    const events = y.reduce((s, v) => s + v, 0);
    if (events === 0 || events === y.length) { setError("Todos os indivíduos analisados pertencem ao mesmo grupo do desfecho. Verifique os valores de caso e controle."); return; }
    if (!names.length) { setError("Escolha ao menos uma variável preditora."); return; }

    const result = logisticRegression(X, y, names);

    // 3) p global (razão de verossimilhança) por variável
    const groups: VarGroup[] = [];
    const termsOf = (variable: string) =>
      names.map((n, i) => ({ n, i })).filter(({ n }) => n === variable || n.startsWith(`${variable}: `));
    for (const v of predictors) {
      const t = termsOf(v);
      let pGlobal = t.length === 1 ? result.terms[t[0].i].p : NaN;
      if (t.length > 1) {
        const keep = names.map((_, i) => i).filter((i) => !t.some((x) => x.i === i));
        const reduced = keep.length
          ? logisticRegression(X.map((row) => keep.map((i) => row[i])), y, keep.map((i) => names[i]))
          : null;
        const llReduced = reduced ? reduced.logLik : result.logLikNull;
        pGlobal = chiSquareSurvival(2 * (result.logLik - llReduced), t.length);
      }
      const kind = kinds[v];
      const reference = kind === "genotipo"
        ? `ref. ${model === "recessivo" ? `${snpInfo[v].labels[0]}+${snpInfo[v].labels[1]}` : model === "sobredominante" ? `${snpInfo[v].labels[0]}+${snpInfo[v].labels[2]}` : model === "log-aditivo" ? `0 cópias de ${snpInfo[v].alt}` : snpInfo[v].labels[0]}`
        : t.length === 1 && t[0].n === v ? "OR por unidade"
          : `ref. ${uniqueValues(complete, v)[0] ?? ""}`;
      groups.push({ variable: v, kind, terms: t.map((x) => x.n), pGlobal, reference });
    }

    setOut({
      result, groups, nTotal: inOutcome.length, nExcluded: inOutcome.length - y.length,
      caseLabel: caseValue, controlLabel: others ? `demais valores de ${outcomeCol}` : controlValue, model,
    });
    void logActivity("analysis_logistic_regression", "analysis", undefined, { preditores: predictors.length, fonte: data?.source });
  };

  const exportXlsx = () => {
    if (!out) return;
    const r = out.result;
    const termRows = out.groups.flatMap((g) => g.terms.map((name) => {
      const t = r.terms.find((x) => x.name === name)!;
      return {
        Variável: g.variable, Termo: name, Referência: g.reference, Beta: xnum(t.beta), EP: xnum(t.se), z: xnum(t.z, 4),
        OR: xnum(t.or, 4), "IC95% inferior": xnum(t.lower, 4), "IC95% superior": xnum(t.upper, 4),
        "p (Wald)": xnum(t.p), "p global (RV)": g.terms.length > 1 ? xnum(g.pGlobal) : "",
      };
    }));
    const fit = [
      ["Indicador", "Valor"],
      ["Desfecho (1)", out.caseLabel], ["Comparação (0)", out.controlLabel],
      ["Indivíduos analisados", r.n], ["Casos (desfecho = 1)", r.nEvents], ["Controles (desfecho = 0)", r.n - r.nEvents],
      ["Excluídos por dados faltantes", out.nExcluded],
      ["Razão de verossimilhança (χ²)", xnum(r.lrStatistic, 4)], ["gl", r.lrDf], ["p do modelo", xnum(r.lrP)],
      ["Log-verossimilhança", xnum(r.logLik, 4)], ["AIC", xnum(r.aic, 3)], ["R² de McFadden", xnum(r.mcFaddenR2, 4)],
      ["Convergiu", r.converged ? "sim" : "não"], ["Iterações", r.iterations],
      ...r.warnings.map((w) => ["Aviso", w]),
    ];
    void downloadXlsx(`Regressao_logistica_${fileBase(data?.label)}.xlsx`, [
      { name: "Coeficientes", rows: termRows },
      { name: "Ajuste do modelo", aoa: fit },
      { name: "Métodos", aoa: [["Métodos"], [methodsText(out)], [""], ["Fonte dos dados", data?.label ?? ""]] },
    ]).then(() => toast.success("Arquivo exportado!")).catch((e) => toast.error("Falha ao gerar o XLSX: " + (e?.message || e)));
  };

  return (
    <div className="p-6 space-y-6">
      <div>
        <BackToHub />
        <h2 className="text-2xl font-bold font-display flex items-center gap-2"><LineChart className="h-6 w-6 text-primary" />Regressão Logística</h2>
        <p className="text-sm text-muted-foreground">Estima a chance de um desfecho (ex.: ser caso, ter nefrite) conforme várias variáveis ao mesmo tempo, com ORs ajustadas.</p>
      </div>

      <DataSourcePicker onData={(d) => { setData(d); setOutcomeCol(""); setCaseValue(""); setControlValue(OTHERS); setPredictors([]); reset(); }} />

      {data && (
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-base">2. Configuração</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-4 items-end">
              <ColumnSelect label="Desfecho" value={outcomeCol} kinds={kinds} columns={columns}
                filter={(c) => kinds[c] === "categorica"}
                onChange={(v) => { setOutcomeCol(v); setCaseValue(""); setControlValue(OTHERS); setPredictors((p) => p.filter((x) => x !== v)); reset(); }} />
              {outcomeCol && (
                <>
                  <ValueSelect label="Valor que conta como desfecho (1)" value={caseValue} values={outcomeValues} onChange={(v) => { setCaseValue(v); reset(); }} />
                  <div className="space-y-1.5 min-w-[200px]">
                    <Label className="text-xs text-muted-foreground uppercase tracking-wider">Comparar com (0)</Label>
                    <Select value={controlValue} onValueChange={(v) => { setControlValue(v); reset(); }}>
                      <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value={OTHERS}>Todos os demais valores</SelectItem>
                        {outcomeValues.filter((v) => v !== caseValue).map((v) => <SelectItem key={v} value={v}>{v}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </>
              )}
            </div>
            {outcomeCol && (
              <ColumnChecklist label="Variáveis preditoras (entram juntas no modelo)" columns={columns} kinds={kinds}
                selected={predictors} onChange={(v) => { setPredictors(v); reset(); }} filter={(c) => c !== outcomeCol && kinds[c] !== "identificador"} />
            )}
            <div className="flex flex-wrap gap-4 items-end">
              {hasGenotype && (
                <div className="space-y-1.5 min-w-[200px]">
                  <Label className="text-xs text-muted-foreground uppercase tracking-wider">Modelo genético dos SNPs</Label>
                  <Select value={model} onValueChange={(v) => { setModel(v as GeneticModel); reset(); }}>
                    <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {(Object.keys(MODEL_LABEL) as GeneticModel[]).map((m) => <SelectItem key={m} value={m}>{MODEL_LABEL[m]}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <Button onClick={run} disabled={!outcomeCol || !caseValue || !predictors.length}>Ajustar modelo</Button>
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
          </CardContent>
        </Card>
      )}

      {out && (
        <Card>
          <CardHeader className="pb-3 flex-row items-center justify-between">
            <CardTitle className="text-base">3. Resultados</CardTitle>
            <Button variant="outline" size="sm" className="gap-1.5" onClick={exportXlsx}><FileSpreadsheet className="h-4 w-4" />Exportar XLSX</Button>
          </CardHeader>
          <CardContent className="space-y-4 overflow-x-auto">
            <div className="flex flex-wrap gap-2 text-xs">
              <Badge variant="secondary">Desfecho: {out.caseLabel} ({out.result.nEvents}) × {out.controlLabel} ({out.result.n - out.result.nEvents})</Badge>
              <Badge variant="outline">N analisado: {out.result.n}{out.nExcluded ? ` (${out.nExcluded} excluídos por dados faltantes)` : ""}</Badge>
              <Badge variant="outline">Modelo: χ² {fmt(out.result.lrStatistic, 2)}, gl {out.result.lrDf}, p <PBadge p={out.result.lrP} /></Badge>
              <Badge variant="outline">AIC {fmt(out.result.aic, 1)}</Badge>
              <Badge variant="outline">R² McFadden {fmt(out.result.mcFaddenR2, 3)}</Badge>
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Variável</TableHead><TableHead>Termo</TableHead><TableHead>OR ajustada (IC 95%)</TableHead>
                  <TableHead>p</TableHead><TableHead>p global</TableHead><TableHead>β (EP)</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {out.groups.flatMap((g) => g.terms.map((name, k) => {
                  const t = out.result.terms.find((x) => x.name === name)!;
                  const label = name === g.variable ? g.reference : name.slice(g.variable.length + 2);
                  return (
                    <TableRow key={name}>
                      {k === 0 && <TableCell rowSpan={g.terms.length} className="font-medium align-top">{g.variable}<div className="text-[11px] text-muted-foreground font-normal">{name === g.variable ? "" : g.reference}</div></TableCell>}
                      <TableCell className="text-xs">{label}</TableCell>
                      <TableCell className="whitespace-nowrap">{fmtOr(t.or, t.lower, t.upper)}</TableCell>
                      <TableCell><PBadge p={t.p} /></TableCell>
                      {k === 0 && <TableCell rowSpan={g.terms.length} className="align-top">{g.terms.length > 1 ? <PBadge p={g.pGlobal} /> : ""}</TableCell>}
                      <TableCell className="text-xs text-muted-foreground whitespace-nowrap">{fmt(t.beta, 3)} ({fmt(t.se, 3)})</TableCell>
                    </TableRow>
                  );
                }))}
              </TableBody>
            </Table>
            {out.result.warnings.map((w) => <p key={w} className="text-xs text-amber-600">⚠ {w}</p>)}
            <p className="text-xs text-muted-foreground">
              OR &gt; 1: a variável aumenta a chance do desfecho; OR &lt; 1: diminui. Se o intervalo de confiança inclui 1,00, o efeito não é
              estatisticamente significativo. Para variáveis numéricas, a OR vale para cada 1 unidade a mais (ex.: 1 ano de idade).
            </p>
            <MethodsNote text={methodsText(out)} />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
