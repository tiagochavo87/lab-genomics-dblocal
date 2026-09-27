import { useEffect, useMemo, useState } from "react";
import DataSourcePicker, { LoadedData } from "@/components/analysis/DataSourcePicker";
import {
  ColumnChecklist, ColumnSelect, fmt, fmtOr, fmtP, MethodsNote, PBadge, uniqueValues, useColumnKinds, ValueSelect, xnum, fileBase,
} from "@/components/analysis/controls";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { associationForSnp, SnpAssociation } from "@/lib/stats/association";
import { MODEL_LABEL } from "@/lib/stats/genotype";
import { downloadXlsx, SheetSpec } from "@/lib/spreadsheet";
import { logActivity } from "@/lib/activityLog";
import { toast } from "sonner";
import { FileSpreadsheet, Users } from "lucide-react";

const METHODS_BASE =
  "A associação entre cada SNP e a condição (caso vs. controle) foi avaliada nos modelos genéticos codominante, dominante, " +
  "recessivo, sobredominante e log-aditivo, tendo o homozigoto do alelo mais frequente como referência. Odds ratios (OR) brutos " +
  "e intervalos de confiança de 95% foram calculados pelo método de Woolf (com correção de Haldane-Anscombe quando havia célula zero); " +
  "a significância foi avaliada pelo teste qui-quadrado de Pearson e pelo teste exato de Fisher (Freeman-Halton para tabelas 2×3). " +
  "O modelo log-aditivo foi ajustado por regressão logística, com p de Wald. O equilíbrio de Hardy-Weinberg foi verificado no grupo controle (teste exato).";

export default function AssociationPage() {
  const [data, setData] = useState<LoadedData | null>(null);
  const [groupCol, setGroupCol] = useState("");
  const [caseValue, setCaseValue] = useState("");
  const [controlValue, setControlValue] = useState("");
  const [snps, setSnps] = useState<string[]>([]);
  const [covs, setCovs] = useState<string[]>([]);
  const [results, setResults] = useState<SnpAssociation[] | null>(null);

  const rows = data?.rows ?? [];
  const columns = data?.columns ?? [];
  const kinds = useColumnKinds(rows, columns);
  const groupValues = useMemo(() => (groupCol ? uniqueValues(rows, groupCol) : []), [rows, groupCol]);

  useEffect(() => {
    setCaseValue(groupValues[0] ?? "");
    setControlValue(groupValues[1] ?? "");
  }, [groupValues]);

  const methods = covs.length
    ? `${METHODS_BASE} Na análise ajustada, os ORs de todos os modelos foram estimados por regressão logística incluindo ${covs.join(", ")} como covariáveis; no modelo codominante, o p corresponde ao teste da razão de verossimilhança com 2 graus de liberdade.`
    : METHODS_BASE;

  const run = () => {
    const out = snps.map((s) => associationForSnp({ rows, snpColumn: s, groupColumn: groupCol, caseValue, controlValue, covariates: covs }));
    setResults(out);
    void logActivity("analysis_association", "analysis", undefined, { snps: snps.length, covariaveis: covs.length, fonte: data?.source });
  };

  const exportXlsx = () => {
    if (!results) return;
    const summary: Record<string, unknown>[] = [];
    for (const r of results) {
      summary.push({
        SNP: r.snp.column, Modelo: "Alélico", Categoria: `${r.snp.alt} vs ${r.snp.ref}`,
        "Casos (n)": `${r.genotypeCases[1] + 2 * r.genotypeCases[2]}/${2 * r.nCases} alelos`,
        "Controles (n)": `${r.genotypeControls[1] + 2 * r.genotypeControls[2]}/${2 * r.nControls} alelos`,
        OR: xnum(r.allelic.or.or, 4), "IC95% inf": xnum(r.allelic.or.lower, 4), "IC95% sup": xnum(r.allelic.or.upper, 4),
        "p (qui-quadrado)": xnum(r.allelic.pChi2), "p (Fisher)": xnum(r.allelic.pFisher), "p (logístico)": "NA",
      });
      for (const m of r.models) {
        m.categories.forEach((cat, i) => {
          const orRow = i === 0 ? null : m.ors[i - 1] ?? (m.model !== "codominante" && m.model !== "log-aditivo" ? m.ors[0] : null);
          summary.push({
            SNP: r.snp.column, Modelo: MODEL_LABEL[m.model] + (m.adjusted ? " (ajustado)" : ""), Categoria: cat,
            "Casos (n)": m.cases[i], "Controles (n)": m.controls[i],
            OR: i === 0 ? (m.model === "log-aditivo" ? "" : 1) : orRow ? xnum(orRow.or, 4) : "",
            "IC95% inf": orRow ? xnum(orRow.lower, 4) : "", "IC95% sup": orRow ? xnum(orRow.upper, 4) : "",
            "p (qui-quadrado)": i === 0 ? xnum(m.pChi2) : "", "p (Fisher)": i === 0 ? xnum(m.pFisher) : "", "p (logístico)": i === 0 ? xnum(m.pLogistic) : "",
          });
        });
      }
    }
    const freq = results.map((r) => ({
      SNP: r.snp.column, "Alelo ref": r.snp.ref, "Alelo alt": r.snp.alt,
      "Casos N": r.nCases, "Controles N": r.nControls,
      "Freq. alt casos": xnum(r.altFreqCases, 4), "Freq. alt controles": xnum(r.altFreqControls, 4),
      "HWE controles p (exato)": xnum(r.hweControls.pExact), Avisos: r.warnings.join(" | "),
    }));
    const sheets: SheetSpec[] = [
      { name: "Associação", rows: summary },
      { name: "Frequências e HWE", rows: freq },
      { name: "Métodos", aoa: [["Métodos"], [methods], [""], ["Grupo", `${groupCol}: caso = ${caseValue}, controle = ${controlValue}`], ["Covariáveis", covs.join(", ") || "nenhuma"], ["Fonte dos dados", data?.label ?? ""]] },
    ];
    void downloadXlsx(`Associacao_${fileBase(data?.label)}.xlsx`, sheets)
      .then(() => toast.success("Arquivo exportado!"))
      .catch((e) => toast.error("Falha ao gerar o XLSX: " + (e?.message || e)));
  };

  const pct = (x: number, tot: number) => (tot ? ` (${fmt((100 * x) / tot, 1)}%)` : "");

  return (
    <div className="p-6 space-y-6">
      <div>
        <h2 className="text-2xl font-bold font-display flex items-center gap-2"><Users className="h-6 w-6 text-primary" />Associação Caso-Controle</h2>
        <p className="text-sm text-muted-foreground">Compara genótipos e alelos entre casos e controles, com OR e IC 95% em cada modelo genético.</p>
      </div>

      <DataSourcePicker onData={(d) => { setData(d); setSnps([]); setCovs([]); setGroupCol(""); setResults(null); }} />

      {data && (
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-base">2. Configuração</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-4">
              <ColumnSelect label="Coluna do grupo (caso/controle)" value={groupCol} onChange={setGroupCol} columns={columns} kinds={kinds} filter={(c) => kinds[c] === "categorica"} />
              {groupCol && <ValueSelect label="Valor que indica CASO" value={caseValue} onChange={setCaseValue} values={groupValues} />}
              {groupCol && <ValueSelect label="Valor que indica CONTROLE" value={controlValue} onChange={setControlValue} values={groupValues} />}
            </div>
            <ColumnChecklist label="SNPs a testar" columns={columns} kinds={kinds} selected={snps} onChange={setSnps} filter={(c) => kinds[c] === "genotipo"} />
            <ColumnChecklist label="Ajustar por (opcional): covariáveis como idade e sexo" columns={columns} kinds={kinds} selected={covs} onChange={setCovs} filter={(c) => c !== groupCol && !snps.includes(c) && kinds[c] !== "genotipo" && kinds[c] !== "identificador"} />
            <Button onClick={run} disabled={!snps.length || !groupCol || !caseValue || !controlValue || caseValue === controlValue}>Calcular</Button>
          </CardContent>
        </Card>
      )}

      {results && (
        <Card>
          <CardHeader className="pb-3 flex-row items-center justify-between">
            <CardTitle className="text-base">3. Resultados</CardTitle>
            <Button variant="outline" size="sm" className="gap-1.5" onClick={exportXlsx}><FileSpreadsheet className="h-4 w-4" />Exportar XLSX</Button>
          </CardHeader>
          <CardContent className="space-y-8">
            {results.map((r) => (
              <div key={r.snp.column} className="space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="font-semibold">{r.snp.column}</h3>
                  <Badge variant="outline">ref {r.snp.ref} · alt {r.snp.alt}</Badge>
                  <Badge variant="outline">{r.nCases} casos · {r.nControls} controles</Badge>
                  <Badge variant="outline">freq. {r.snp.alt}: casos {fmt(r.altFreqCases, 3)} · controles {fmt(r.altFreqControls, 3)}</Badge>
                  <Badge variant={r.hweControls.pExact < 0.05 ? "destructive" : "secondary"}>HWE controles p {fmtP(r.hweControls.pExact)}</Badge>
                </div>
                {r.warnings.map((w) => <p key={w} className="text-xs text-amber-600">⚠ {w}</p>)}
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Modelo</TableHead><TableHead>Genótipo</TableHead><TableHead>Casos</TableHead><TableHead>Controles</TableHead>
                        <TableHead>OR (IC 95%)</TableHead><TableHead>p χ²</TableHead><TableHead>p Fisher</TableHead><TableHead>p logístico</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      <TableRow className="bg-muted/30">
                        <TableCell className="font-medium">Alélico</TableCell>
                        <TableCell>{r.snp.alt} vs {r.snp.ref}</TableCell>
                        <TableCell>{r.genotypeCases[1] + 2 * r.genotypeCases[2]} / {2 * r.nCases}</TableCell>
                        <TableCell>{r.genotypeControls[1] + 2 * r.genotypeControls[2]} / {2 * r.nControls}</TableCell>
                        <TableCell>{fmtOr(r.allelic.or.or, r.allelic.or.lower, r.allelic.or.upper)}</TableCell>
                        <TableCell><PBadge p={r.allelic.pChi2} /></TableCell>
                        <TableCell><PBadge p={r.allelic.pFisher} /></TableCell>
                        <TableCell>–</TableCell>
                      </TableRow>
                      {r.models.map((m) =>
                        m.categories.map((cat, i) => {
                          const totC = m.cases.reduce((s, x) => s + x, 0);
                          const totK = m.controls.reduce((s, x) => s + x, 0);
                          const orRow = i === 0 ? null : m.ors[i - 1] ?? (m.model !== "codominante" && m.model !== "log-aditivo" ? m.ors[0] : null);
                          return (
                            <TableRow key={`${m.model}-${i}`} className={i === 0 ? "border-t-2" : ""}>
                              <TableCell className="font-medium">{i === 0 ? MODEL_LABEL[m.model] + (m.adjusted ? " (ajust.)" : "") : ""}</TableCell>
                              <TableCell>{cat}</TableCell>
                              <TableCell>{m.cases[i]}{pct(m.cases[i], totC)}</TableCell>
                              <TableCell>{m.controls[i]}{pct(m.controls[i], totK)}</TableCell>
                              <TableCell>
                                {m.model === "log-aditivo"
                                  ? (i === 1 && m.ors[0] ? `${fmtOr(m.ors[0].or, m.ors[0].lower, m.ors[0].upper)} por alelo` : "")
                                  : i === 0 ? "1,00 (ref.)" : orRow ? fmtOr(orRow.or, orRow.lower, orRow.upper) + (orRow.corrected ? "*" : "") : "–"}
                              </TableCell>
                              <TableCell>{i === 0 ? <PBadge p={m.pChi2} /> : ""}</TableCell>
                              <TableCell>{i === 0 ? <PBadge p={m.pFisher} /> : ""}</TableCell>
                              <TableCell>{i === 0 ? <PBadge p={m.pLogistic} /> : ""}</TableCell>
                            </TableRow>
                          );
                        }),
                      )}
                    </TableBody>
                  </Table>
                </div>
              </div>
            ))}
            <p className="text-xs text-muted-foreground">
              {results.some((r) => r.models.some((m) => m.ors.some((o) => o.corrected))) && "* OR calculado com correção de 0,5 por haver célula zero. "}
              Com vários SNPs e modelos, considere correção para múltiplos testes.
            </p>
            <MethodsNote text={methods} />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
