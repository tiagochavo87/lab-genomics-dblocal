import { useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Upload, Play, Download, FileSpreadsheet, AlertTriangle, CheckCircle2, Dna, BarChart3 } from "lucide-react";
import { toast } from "sonner";
import { readTextFile } from "@/lib/textEncoding";
import { downloadXlsx, type SheetSpec } from "@/lib/spreadsheet";
import { runLDAnalysis, DEFAULT_LD_PARAMS, type LDResults, type LDParams } from "@/lib/ldAnalysis";
import LDHeatmap from "@/components/LDHeatmap";
import ManhattanPlot from "@/components/ManhattanPlot";
import QQPlot from "@/components/QQPlot";

export default function LDAnalysisPage() {
  const [fileContent, setFileContent] = useState<string | null>(null);
  const [fileName, setFileName] = useState("");
  const [results, setResults] = useState<LDResults | null>(null);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState("");
  const [params, setParams] = useState<LDParams>(DEFAULT_LD_PARAMS);

  const handleFileUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setResults(null);

    readTextFile(file)
      .then((text) => {
        setFileContent(text);
        toast.success(`Arquivo "${file.name}" carregado`);
      })
      .catch(() => toast.error("Não foi possível ler o arquivo"));
  }, []);

  const handleRun = useCallback(async () => {
    if (!fileContent) { toast.error("Carregue um arquivo primeiro"); return; }
    setRunning(true);
    setProgress("Iniciando...");
    setResults(null);

    // Use setTimeout to allow UI updates
    setTimeout(() => {
      try {
        const res = runLDAnalysis(fileContent, params, setProgress);
        setResults(res);
        toast.success("Análise LD concluída!");
      } catch (err: unknown) {
        toast.error((err as Error).message || "Erro na análise");
        setProgress("");
      } finally {
        setRunning(false);
      }
    }, 50);
  }, [fileContent, params]);

  const exportResults = useCallback(() => {
    if (!results) return;
    const sheets: SheetSpec[] = [];

    // Summary
    sheets.push({ name: "Resumo", rows: [results.summary] });

    // QC
    const qcData = results.qc.map(q => ({
      Locus: q.locus,
      "N Válidos": q.nNonMissing,
      "N Missing": q.nMissing,
      "N Parcial": q.nPartialMissing,
      MAF: q.maf.toFixed(4),
      "Contagem Alelos": JSON.stringify(q.alleleCounts),
      "Freq. Alelos": JSON.stringify(q.alleleFreqs),
    }));
    sheets.push({ name: "QC", rows: qcData });

    // Haplotypes
    const hapData = results.haplotypes.map(h => ({
      Haplótipo: h.haplotype,
      Frequência: h.frequency.toFixed(6),
      "Obs. Direta": h.directlyObservable ? "Sim" : "Não",
    }));
    sheets.push({ name: "Haplótipos", rows: hapData });

    // LD details
    const ldData = results.ldDetails.map(d => ({
      Locus1: d.locus1, Locus2: d.locus2,
      Alelo1: d.allele1, Alelo2: d.allele2,
      pA: d.pA.toFixed(4), pB: d.pB.toFixed(4), pAB: d.pAB.toFixed(4),
      D: d.D.toFixed(6), "D'": d.dPrime.toFixed(4), "r²": d.r2.toFixed(4),
    }));
    sheets.push({ name: "LD Detalhado", rows: ldData });

    // r2 matrix
    const { loci, values: r2Vals } = results.r2Matrix;
    const r2Sheet = [["", ...loci], ...loci.map((l, i) => [l, ...r2Vals[i].map(v => Number.isNaN(v) ? "NA" : v.toFixed(4))])];
    sheets.push({ name: "Matriz r²", aoa: r2Sheet });

    // D' matrix
    const dpVals = results.dPrimeMatrix.values;
    const dpSheet = [["", ...loci], ...loci.map((l, i) => [l, ...dpVals[i].map(v => Number.isNaN(v) ? "NA" : v.toFixed(4))])];
    sheets.push({ name: "Matriz D'", aoa: dpSheet });

    void downloadXlsx(`LD_Analysis_${fileName || "results"}.xlsx`, sheets).catch(() => toast.error("Falha ao gerar o arquivo XLSX"));
    toast.success("Resultados exportados!");
  }, [results, fileName]);

  return (
    <div className="p-6 space-y-6">
      <div>
        <h2 className="text-2xl font-bold font-display flex items-center gap-2">
          <Dna className="h-6 w-6 text-primary" />
          Análise de Desequilíbrio de Ligação (LD)
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          Inferência de haplótipos por EM e cálculo de LD pairwise (D, D', r²) entre loci
        </p>
      </div>

      {/* Upload & Config */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Arquivo de Entrada (formato MLOCUS)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="border-2 border-dashed border-muted-foreground/25 rounded-lg p-6 text-center">
              <Upload className="h-8 w-8 mx-auto text-muted-foreground/50 mb-2" />
              <p className="text-sm text-muted-foreground mb-3">
                TXT/TSV tab-delimitado: ID + 2 colunas por locus (alelo1, alelo2)
              </p>
              <Input
                type="file"
                accept=".txt,.tsv,.csv,.tab"
                onChange={handleFileUpload}
                className="max-w-xs mx-auto"
              />
            </div>
            {fileName && (
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-primary" />
                <span className="text-sm font-medium">{fileName}</span>
              </div>
            )}

            <div className="text-xs text-muted-foreground bg-muted/50 rounded-lg p-3 space-y-1">
              <p className="font-semibold mb-1">Formato esperado:</p>
              <pre className="font-mono text-[10px] leading-relaxed">
{`ID\tSNP1A\tSNP1B\tSNP2A\tSNP2B\tSNP3A\tSNP3B
CONT421\t-9\t-9\t1\t1\t1\t2
CONT423\t\t\t1\t2\t1\t1
CONT424\t1\t1\t1\t1\t1\t1`}
              </pre>
              <p>Missing: <code>-9</code>, vazio, <code>NA</code>, <code>NaN</code>, <code>.</code>, <code>NULL</code></p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Parâmetros</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-xs">Máx. Iterações EM</Label>
              <Input
                type="number"
                value={params.maxIter}
                onChange={e => setParams(p => ({ ...p, maxIter: Number(e.target.value) || 2000 }))}
                className="h-8 text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Tolerância</Label>
              <Input
                type="text"
                value={params.tol}
                onChange={e => setParams(p => ({ ...p, tol: Number(e.target.value) || 1e-10 }))}
                className="h-8 text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Código de Missing</Label>
              <Input
                type="number"
                value={params.missingCode}
                onChange={e => setParams(p => ({ ...p, missingCode: Number(e.target.value) }))}
                className="h-8 text-sm"
              />
            </div>

            <Button
              onClick={handleRun}
              disabled={!fileContent || running}
              className="w-full gap-2"
            >
              {running ? (
                <>
                  <div className="h-4 w-4 rounded-full border-2 border-primary-foreground border-t-transparent animate-spin" />
                  Processando...
                </>
              ) : (
                <>
                  <Play className="h-4 w-4" />
                  Executar Análise
                </>
              )}
            </Button>

            {progress && (
              <p className="text-xs text-muted-foreground text-center">{progress}</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Results */}
      {results && (
        <>
          {/* Summary KPIs */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            {[
              { label: "Amostras", value: results.summary.nSamples },
              { label: "Loci", value: results.summary.nLoci },
              { label: "Haplótipos Possíveis", value: results.summary.nPossibleHaplotypes },
              { label: "Iterações EM", value: results.summary.emIterations },
              { label: "Log-Likelihood", value: results.summary.logLikelihood.toFixed(2) },
              { label: "Não Resolvíveis", value: results.summary.nUnresolvable },
            ].map(kpi => (
              <Card key={kpi.label}>
                <CardContent className="pt-4 pb-3 text-center">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">{kpi.label}</p>
                  <p className="text-lg font-bold font-display">{kpi.value}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          <Tabs defaultValue="heatmaps" className="space-y-4">
            <div className="flex items-center justify-between">
              <TabsList>
                <TabsTrigger value="heatmaps">Heatmaps</TabsTrigger>
                <TabsTrigger value="plots">
                  <BarChart3 className="h-3.5 w-3.5 mr-1" />
                  Manhattan / QQ
                </TabsTrigger>
                <TabsTrigger value="haplotypes">Haplótipos</TabsTrigger>
                <TabsTrigger value="ld_details">LD Detalhado</TabsTrigger>
                <TabsTrigger value="qc">QC</TabsTrigger>
              </TabsList>

              <Button variant="outline" size="sm" className="gap-1.5" onClick={exportResults}>
                <FileSpreadsheet className="h-4 w-4" />
                Exportar XLSX
              </Button>
            </div>

            {/* Heatmaps */}
            <TabsContent value="heatmaps">
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                <Card>
                  <CardContent className="pt-6">
                    <LDHeatmap matrix={results.r2Matrix} title="Heatmap de LD (r²)" colorScheme="r2" />
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-6">
                    <LDHeatmap matrix={results.dPrimeMatrix} title="Heatmap de LD (D')" colorScheme="dprime" />
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            {/* Manhattan & QQ Plots */}
            <TabsContent value="plots">
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                <Card>
                  <CardContent className="pt-6">
                    <ManhattanPlot ldDetails={results.ldDetails} nSamples={results.summary.nSamples} />
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-6">
                    <QQPlot ldDetails={results.ldDetails} nSamples={results.summary.nSamples} />
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            {/* Haplotypes */}
            <TabsContent value="haplotypes">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    Frequências Haplotípicas
                    <Badge variant="secondary">{results.haplotypes.length} haplótipos</Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="overflow-auto max-h-[500px]">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="text-xs">#</TableHead>
                          <TableHead className="text-xs font-mono">Haplótipo</TableHead>
                          <TableHead className="text-xs">Frequência</TableHead>
                          <TableHead className="text-xs">Obs. Direta</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {results.haplotypes.map((h, i) => (
                          <TableRow key={i}>
                            <TableCell className="text-xs text-muted-foreground">{i + 1}</TableCell>
                            <TableCell className="text-xs font-mono">{h.haplotype}</TableCell>
                            <TableCell className="text-xs">{h.frequency.toFixed(6)}</TableCell>
                            <TableCell>
                              {h.directlyObservable ? (
                                <Badge variant="default" className="text-[10px]">Sim</Badge>
                              ) : (
                                <Badge variant="outline" className="text-[10px]">Não</Badge>
                              )}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* LD Details */}
            <TabsContent value="ld_details">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    LD Pairwise Detalhado
                    <Badge variant="secondary">{results.ldDetails.length} pares</Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="overflow-auto max-h-[500px]">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="text-xs">Locus 1</TableHead>
                          <TableHead className="text-xs">Locus 2</TableHead>
                          <TableHead className="text-xs">A1</TableHead>
                          <TableHead className="text-xs">A2</TableHead>
                          <TableHead className="text-xs">pA</TableHead>
                          <TableHead className="text-xs">pB</TableHead>
                          <TableHead className="text-xs">pAB</TableHead>
                          <TableHead className="text-xs">D</TableHead>
                          <TableHead className="text-xs">D'</TableHead>
                          <TableHead className="text-xs">r²</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {results.ldDetails.map((d, i) => (
                          <TableRow key={i}>
                            <TableCell className="text-xs font-mono">{d.locus1}</TableCell>
                            <TableCell className="text-xs font-mono">{d.locus2}</TableCell>
                            <TableCell className="text-xs">{d.allele1}</TableCell>
                            <TableCell className="text-xs">{d.allele2}</TableCell>
                            <TableCell className="text-xs">{d.pA.toFixed(4)}</TableCell>
                            <TableCell className="text-xs">{d.pB.toFixed(4)}</TableCell>
                            <TableCell className="text-xs">{d.pAB.toFixed(4)}</TableCell>
                            <TableCell className="text-xs">{d.D.toFixed(6)}</TableCell>
                            <TableCell className="text-xs">{Number.isNaN(d.dPrime) ? "NA" : d.dPrime.toFixed(4)}</TableCell>
                            <TableCell className="text-xs">{Number.isNaN(d.r2) ? "NA" : d.r2.toFixed(4)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* QC */}
            <TabsContent value="qc">
              <div className="space-y-4">
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">Controle de Qualidade por Locus</CardTitle>
                  </CardHeader>
                  <CardContent className="p-0">
                    <div className="overflow-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="text-xs">Locus</TableHead>
                            <TableHead className="text-xs">N Válidos</TableHead>
                            <TableHead className="text-xs">N Missing</TableHead>
                            <TableHead className="text-xs">N Parcial</TableHead>
                            <TableHead className="text-xs">MAF</TableHead>
                            <TableHead className="text-xs">Alelos</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {results.qc.map((q) => (
                            <TableRow key={q.locus}>
                              <TableCell className="text-xs font-mono font-medium">{q.locus}</TableCell>
                              <TableCell className="text-xs">{q.nNonMissing}</TableCell>
                              <TableCell className="text-xs">
                                {q.nMissing > 0 ? (
                                  <span className="flex items-center gap-1">
                                    <AlertTriangle className="h-3 w-3 text-amber-500" />
                                    {q.nMissing}
                                  </span>
                                ) : q.nMissing}
                              </TableCell>
                              <TableCell className="text-xs">{q.nPartialMissing}</TableCell>
                              <TableCell className="text-xs">{Number.isNaN(q.maf) ? "NA" : q.maf.toFixed(4)}</TableCell>
                              <TableCell className="text-xs font-mono">
                                {Object.entries(q.alleleFreqs).map(([a, f]) => (
                                  <Badge key={a} variant="outline" className="text-[10px] mr-1">
                                    {a}: {(f as number).toFixed(3)}
                                  </Badge>
                                ))}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </CardContent>
                </Card>

                {/* Missing distribution */}
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">Distribuição de Loci Faltantes por Amostra</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="flex flex-wrap gap-3">
                      {Object.entries(results.missingLociDistribution)
                        .sort(([a], [b]) => Number(a) - Number(b))
                        .map(([nMissing, count]) => (
                          <div key={nMissing} className="text-center">
                            <p className="text-lg font-bold">{count}</p>
                            <p className="text-[10px] text-muted-foreground">
                              {nMissing === "0" ? "Completos" : `${nMissing} loci faltantes`}
                            </p>
                          </div>
                        ))}
                    </div>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>
          </Tabs>
        </>
      )}
    </div>
  );
}
