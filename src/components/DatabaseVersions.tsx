import { useState, useEffect, useMemo } from "react";
import { api } from "@/integrations/api/client";
import { useAuth } from "@/contexts/AuthContext";
import { useAdminCheck } from "@/hooks/useAdminCheck";
import { getIdentifyingColumns } from "@/lib/dataMasking";
import { logSensitiveAccess } from "@/lib/sensitiveAccessLog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Upload, Download, FileSpreadsheet, FileText, Calendar, Layers, Columns3, ChevronLeft, ChevronRight, GitCompare, Search, X, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { downloadXlsx, type SheetSpec } from "@/lib/spreadsheet";
import { logActivity } from "@/lib/activityLog";
import { parseUploadedFile } from "@/lib/fileParser";
import FilePreview from "@/components/FilePreview";
import { createVersionBackup, createSingleVersionBackup, restoreFromBackup } from "@/lib/backupService";

interface Version {
  id: string;
  database_id: string;
  name: string;
  version_number: string;
  row_count: number;
  data: Record<string, unknown>[];
  created_by: string;
  created_at: string;
}

interface Variable {
  id: string;
  name: string;
  category: string;
  variable_type: string;
}

const PAGE_SIZES = [10, 25, 50];

export default function DatabaseVersions({ databaseId }: { databaseId: string }) {
  const { user } = useAuth();
  const { isAdmin } = useAdminCheck();
  const [versions, setVersions] = useState<Version[]>([]);
  const [variables, setVariables] = useState<Variable[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [selectedVersion, setSelectedVersion] = useState<Version | null>(null);
  const [compareOpen, setCompareOpen] = useState(false);
  const [compareVersionA, setCompareVersionA] = useState<string>("");
  const [compareVersionB, setCompareVersionB] = useState<string>("");

  // Create form
  const [versionName, setVersionName] = useState("");
  const [versionNumber, setVersionNumber] = useState("1.0");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewData, setPreviewData] = useState<Record<string, unknown>[]>([]);
  const [previewColumns, setPreviewColumns] = useState<string[]>([]);

  // Data view
  const [visibleColumns, setVisibleColumns] = useState<Set<string>>(new Set());
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(25);
  const [searchData, setSearchData] = useState("");

  // Filter
  const [filterVersionId, setFilterVersionId] = useState<string>("all");
  const [filterDate, setFilterDate] = useState("");

  const fetchData = async () => {
    const [versionsRes, varsRes] = await Promise.all([
      api.from("database_versions").select("*").eq("database_id", databaseId).order("created_at", { ascending: false }),
      api.from("database_variables").select("*").eq("database_id", databaseId).order("sort_order"),
    ]);
    if (versionsRes.data) {
      const parsed = versionsRes.data.map(v => ({
        ...v,
        data: Array.isArray(v.data) ? v.data as Record<string, unknown>[] : [],
      }));
      setVersions(parsed);
    }
    if (varsRes.data) setVariables(varsRes.data);
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, [databaseId]);

  useEffect(() => {
    if (variables.length > 0 && visibleColumns.size === 0) {
      setVisibleColumns(new Set(variables.slice(0, 10).map(v => v.name)));
    }
  }, [variables]);

  const handleFileUpload = async () => {
    if (!user || previewData.length === 0) return;

    // AUTO BACKUP: Backup all existing versions before creating new one
    if (versions.length > 0) {
      await createVersionBackup(databaseId, "pre_new_version");
      toast.info("Backup automático das versões existentes criado!");
    }

    const finalName = versionName.trim() || `v${versionNumber} - ${selectedFile?.name.replace(/\.[^.]+$/, '') ?? "upload"}`;

    const { error } = await api.from("database_versions").insert({
      database_id: databaseId,
      name: finalName,
      version_number: versionNumber.trim() || "1.0",
      row_count: previewData.length,
      data: previewData as any,
      created_by: user.id,
    });

    if (error) {
      console.error("Version insert error:", error);
      toast.error("Erro ao criar versão: " + error.message);
    } else {
      toast.success(`Versão "${finalName}" criada com ${previewData.length} registros!`);
      await logActivity("version_created", "version", undefined, { name: finalName, records: previewData.length });

      if (variables.length === 0 && previewColumns.length > 0) {
        const variableInserts = previewColumns.map((col, i) => ({
          database_id: databaseId,
          name: col,
          variable_type: "text",
          category: "Geral",
          description: "",
          sort_order: i,
        }));
        const { error: varError } = await api.from("database_variables").insert(variableInserts);
        if (varError) console.error("Auto-create variables error:", varError);
      }

      setVersionName(""); setVersionNumber("1.0"); setSelectedFile(null); setPreviewData([]); setPreviewColumns([]);
      setCreateOpen(false);
      fetchData();
    }
  };

  // Filtered versions
  const filteredVersions = useMemo(() => {
    let result = versions;
    if (filterVersionId !== "all") result = result.filter(v => v.id === filterVersionId);
    if (filterDate) result = result.filter(v => v.created_at.startsWith(filterDate));
    return result;
  }, [versions, filterVersionId, filterDate]);

  const activeVersion = selectedVersion || (filteredVersions.length > 0 ? filteredVersions[0] : null);
  
  const activeData = useMemo(() => {
    const raw = activeVersion?.data || [];
    // Já vem mascarado do servidor para quem não tem permissão.
    const masked = raw;
    if (!searchData.trim()) return masked;
    const q = searchData.toLowerCase();
    return masked.filter(row =>
      Object.values(row).some(val => val != null && String(val).toLowerCase().includes(q))
    );
  }, [activeVersion, searchData, isAdmin]);

  const allColumns = variables.map(v => v.name);
  const orderedVisible = allColumns.filter(c => visibleColumns.has(c));
  const identifyingCols = useMemo(() => getIdentifyingColumns(allColumns, variables), [allColumns, variables]);
  const totalPages = Math.ceil(activeData.length / pageSize);
  const pageData = activeData.slice(page * pageSize, (page + 1) * pageSize);

  const toggleColumn = (col: string) => {
    setVisibleColumns(prev => {
      const next = new Set(prev);
      if (next.has(col)) next.delete(col);
      else next.add(col);
      return next;
    });
  };

  const groupedVars = variables.reduce<Record<string, Variable[]>>((acc, v) => {
    (acc[v.category] = acc[v.category] || []).push(v);
    return acc;
  }, {});

  const toggleCategory = (vars: Variable[]) => {
    const names = vars.map(v => v.name);
    const allSelected = names.every(n => visibleColumns.has(n));
    setVisibleColumns(prev => {
      const next = new Set(prev);
      names.forEach(n => allSelected ? next.delete(n) : next.add(n));
      return next;
    });
  };

  const exportData = (format: "xlsx" | "txt") => {
    if (!activeData.length || !orderedVisible.length) {
      toast.error("Selecione variáveis e uma versão com dados");
      return;
    }
    const exportRows = activeData.map(row => {
      const obj: Record<string, unknown> = {};
      orderedVisible.forEach(col => { obj[col] = row[col] ?? ""; });
      return obj;
    });

    if (format === "xlsx") {
      const sheets: SheetSpec[] = [];
      sheets.push({ name: "Dados", rows: exportRows });
      void downloadXlsx(`${activeVersion?.name || "dados"}.xlsx`, sheets).catch(() => toast.error("Falha ao gerar o arquivo XLSX"));
      toast.success("Arquivo XLS exportado!");
    } else {
      const header = orderedVisible.join("\t");
      const rows = exportRows.map(r => orderedVisible.map(c => String(r[c] ?? "")).join("\t"));
      const content = [header, ...rows].join("\n");
      const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${activeVersion?.name || "dados"}.txt`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Arquivo TXT exportado!");
    }
    logActivity("data_exported", "version", activeVersion?.id, { format, records: activeData.length });
    logSensitiveAccess("export", "version", activeVersion?.id, { format, records: activeData.length, masked: !isAdmin });
  };

  // Version comparison
  const versionA = versions.find(v => v.id === compareVersionA);
  const versionB = versions.find(v => v.id === compareVersionB);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h3 className="text-lg font-semibold font-display">Versões & Dados</h3>
          <p className="text-sm text-muted-foreground">{versions.length} versões disponíveis</p>
        </div>
        <div className="flex gap-2">
          {versions.length >= 2 && (
            <Button variant="outline" size="sm" className="gap-2" onClick={() => setCompareOpen(true)}>
              <GitCompare className="h-4 w-4" /> Comparar
            </Button>
          )}
          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="gap-2"><Plus className="h-4 w-4" /> Nova Versão</Button>
            </DialogTrigger>
            <DialogContent className="max-h-[90vh] overflow-y-auto">
              <DialogHeader><DialogTitle>Upload de Nova Versão</DialogTitle></DialogHeader>
              <div className="space-y-4 pt-2">
                <label
                  htmlFor="version-file-upload"
                  className="flex flex-col items-center justify-center rounded-lg border-2 border-dashed p-6 cursor-pointer hover:border-primary/50 transition-colors"
                >
                  <Upload className="h-8 w-8 text-muted-foreground mb-2" />
                  <p className="text-sm font-medium">{selectedFile ? selectedFile.name : "Clique para selecionar arquivo"}</p>
                  <p className="text-xs text-muted-foreground">.xlsx, .xls, .csv, .txt (tab-separado)</p>
                  <input id="version-file-upload" type="file" accept=".csv,.xlsx,.xls,.txt" className="hidden" onChange={e => {
                    if (e.target.files?.[0]) {
                      setSelectedFile(e.target.files[0]);
                      if (!versionName.trim()) {
                        const fname = e.target.files[0].name.replace(/\.[^.]+$/, '');
                        setVersionName(fname);
                      }
                    }
                  }} />
                </label>
                {selectedFile && (
                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary" className="text-xs">{selectedFile.name}</Badge>
                      <Button variant="ghost" size="sm" className="text-xs h-6 px-2" onClick={() => { setSelectedFile(null); setPreviewData([]); setPreviewColumns([]); }}>
                        <X className="h-3 w-3" /> Remover
                      </Button>
                    </div>
                    <FilePreview
                      file={selectedFile}
                      onParsed={(data, cols) => { setPreviewData(data); setPreviewColumns(cols); }}
                    />
                  </div>
                )}
                <Input placeholder="Nome da versão (opcional - gerado do arquivo)" value={versionName} onChange={e => setVersionName(e.target.value)} />
                <Input placeholder="Número (ex: 1.0, 2.1)" value={versionNumber} onChange={e => setVersionNumber(e.target.value)} />
                <Button onClick={handleFileUpload} disabled={previewData.length === 0} className="w-full gap-2">
                  <FileSpreadsheet className="h-4 w-4" /> Criar Versão ({previewData.length} registros)
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="py-3 px-4">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <Layers className="h-4 w-4 text-muted-foreground" />
              <Select value={filterVersionId} onValueChange={v => { setFilterVersionId(v); setPage(0); setSelectedVersion(v === "all" ? null : versions.find(ver => ver.id === v) || null); }}>
                <SelectTrigger className="w-[220px] h-8 text-sm"><SelectValue placeholder="Todas as versões" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas as versões</SelectItem>
                  {versions.map(v => <SelectItem key={v.id} value={v.id}>{v.name} ({v.version_number})</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-muted-foreground" />
              <Input type="date" className="h-8 w-[160px] text-sm" value={filterDate} onChange={e => { setFilterDate(e.target.value); setPage(0); }} />
            </div>

            {/* Data search */}
            <div className="relative flex-1 min-w-[150px]">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input placeholder="Buscar nos dados..." value={searchData} onChange={e => { setSearchData(e.target.value); setPage(0); }} className="h-8 pl-8 text-sm" />
              {searchData && (
                <button className="absolute right-2 top-1/2 -translate-y-1/2" onClick={() => setSearchData("")}>
                  <X className="h-3.5 w-3.5 text-muted-foreground" />
                </button>
              )}
            </div>

            {/* Variable selector */}
            <Sheet>
              <SheetTrigger asChild>
                <Button variant="outline" size="sm" className="gap-2 ml-auto">
                  <Columns3 className="h-4 w-4" /> Variáveis ({visibleColumns.size})
                </Button>
              </SheetTrigger>
              <SheetContent className="w-[360px] overflow-y-auto">
                <SheetHeader><SheetTitle>Selecionar Variáveis</SheetTitle></SheetHeader>
                <div className="flex gap-2 my-4">
                  <Button size="sm" variant="secondary" onClick={() => setVisibleColumns(new Set(allColumns))}>Todas</Button>
                  <Button size="sm" variant="secondary" onClick={() => setVisibleColumns(new Set())}>Limpar</Button>
                </div>
                <div className="space-y-4">
                  {Object.entries(groupedVars).map(([cat, vars]) => {
                    const names = vars.map(v => v.name);
                    const allChecked = names.every(n => visibleColumns.has(n));
                    const someChecked = names.some(n => visibleColumns.has(n));
                    return (
                      <div key={cat}>
                        <label className="flex items-center gap-2 mb-2 cursor-pointer">
                          <Checkbox checked={allChecked ? true : someChecked ? "indeterminate" : false} onCheckedChange={() => toggleCategory(vars)} />
                          <span className="text-sm font-semibold">{cat}</span>
                        </label>
                        <div className="ml-6 space-y-1">
                          {vars.map(v => (
                            <label key={v.id} className="flex items-center gap-2 cursor-pointer">
                              <Checkbox checked={visibleColumns.has(v.name)} onCheckedChange={() => toggleColumn(v.name)} />
                              <span className="text-xs font-mono text-muted-foreground">{v.name}</span>
                            </label>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </SheetContent>
            </Sheet>

            <Button variant="outline" size="sm" className="gap-2" onClick={() => exportData("xlsx")}>
              <FileSpreadsheet className="h-4 w-4" /> XLS
            </Button>
            <Button variant="outline" size="sm" className="gap-2" onClick={() => exportData("txt")}>
              <FileText className="h-4 w-4" /> TXT
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Version list */}
      {!activeVersion && (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center py-8 text-center">
            <Layers className="h-10 w-10 text-muted-foreground/50 mb-2" />
            <p className="text-sm text-muted-foreground">Nenhuma versão disponível. Faça upload de dados.</p>
          </CardContent>
        </Card>
      )}

      {filteredVersions.length > 0 && (
        <div className="flex gap-2 flex-wrap">
          {filteredVersions.map(v => (
            <Badge key={v.id} variant={activeVersion?.id === v.id ? "default" : "outline"} className="cursor-pointer"
              onClick={() => { setSelectedVersion(v); setPage(0); }}>
              {v.name} · v{v.version_number} · {v.row_count} reg · {new Date(v.created_at).toLocaleDateString("pt-BR")}
            </Badge>
          ))}
        </div>
      )}

      {/* Data table */}
      {activeVersion && orderedVisible.length > 0 && (
        <>
          {searchData && (
            <Badge variant="secondary" className="text-xs">{activeData.length} resultado(s) encontrado(s)</Badge>
          )}
          <div className="rounded-lg border bg-card overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  {orderedVisible.map(col => (
                    <TableHead key={col} className="whitespace-nowrap text-xs font-mono">{col}</TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {pageData.length === 0 ? (
                  <TableRow><TableCell colSpan={orderedVisible.length} className="text-center text-muted-foreground py-8">Sem dados</TableCell></TableRow>
                ) : pageData.map((row, i) => (
                  <TableRow key={i}>
                    {orderedVisible.map(col => (
                      <TableCell key={col} className="whitespace-nowrap text-xs">
                        {row[col] != null ? String(row[col]) : "—"}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              Linhas:
              <Select value={String(pageSize)} onValueChange={v => { setPageSize(Number(v)); setPage(0); }}>
                <SelectTrigger className="w-[70px] h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PAGE_SIZES.map(s => <SelectItem key={s} value={String(s)}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
              <span className="ml-2">{activeData.length} registros total</span>
            </div>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              Página {page + 1} de {Math.max(totalPages, 1)}
              <Button variant="ghost" size="icon" disabled={page === 0} onClick={() => setPage(page - 1)}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="icon" disabled={page >= totalPages - 1} onClick={() => setPage(page + 1)}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </>
      )}

      {activeVersion && orderedVisible.length === 0 && variables.length > 0 && (
        <Card className="border-dashed">
          <CardContent className="py-6 text-center text-sm text-muted-foreground">
            Selecione variáveis para visualizar os dados
          </CardContent>
        </Card>
      )}

      {/* Version comparison dialog */}
      <Dialog open={compareOpen} onOpenChange={setCompareOpen}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><GitCompare className="h-5 w-5" /> Comparação de Versões</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div>
              <p className="text-sm font-medium mb-2">Versão A</p>
              <Select value={compareVersionA} onValueChange={setCompareVersionA}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  {versions.map(v => <SelectItem key={v.id} value={v.id}>{v.name} (v{v.version_number})</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <p className="text-sm font-medium mb-2">Versão B</p>
              <Select value={compareVersionB} onValueChange={setCompareVersionB}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  {versions.filter(v => v.id !== compareVersionA).map(v => <SelectItem key={v.id} value={v.id}>{v.name} (v{v.version_number})</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          {versionA && versionB && (
            <div className="space-y-4">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Métrica</TableHead>
                    <TableHead>{versionA.name}</TableHead>
                    <TableHead>{versionB.name}</TableHead>
                    <TableHead>Diferença</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <TableRow>
                    <TableCell className="font-medium">Total de Registros</TableCell>
                    <TableCell>{versionA.row_count}</TableCell>
                    <TableCell>{versionB.row_count}</TableCell>
                    <TableCell>
                      <Badge variant={versionB.row_count - versionA.row_count >= 0 ? "default" : "destructive"}>
                        {versionB.row_count - versionA.row_count >= 0 ? "+" : ""}{versionB.row_count - versionA.row_count}
                      </Badge>
                    </TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="font-medium">Versão</TableCell>
                    <TableCell>{versionA.version_number}</TableCell>
                    <TableCell>{versionB.version_number}</TableCell>
                    <TableCell>—</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="font-medium">Data de Criação</TableCell>
                    <TableCell>{new Date(versionA.created_at).toLocaleDateString("pt-BR")}</TableCell>
                    <TableCell>{new Date(versionB.created_at).toLocaleDateString("pt-BR")}</TableCell>
                    <TableCell>—</TableCell>
                  </TableRow>
                  {/* Column comparison */}
                  <TableRow>
                    <TableCell className="font-medium">Colunas nos Dados</TableCell>
                    <TableCell>{versionA.data.length > 0 ? Object.keys(versionA.data[0]).length : 0}</TableCell>
                    <TableCell>{versionB.data.length > 0 ? Object.keys(versionB.data[0]).length : 0}</TableCell>
                    <TableCell>
                      {(() => {
                        const colsA = versionA.data.length > 0 ? Object.keys(versionA.data[0]) : [];
                        const colsB = versionB.data.length > 0 ? Object.keys(versionB.data[0]) : [];
                        const newCols = colsB.filter(c => !colsA.includes(c));
                        const removedCols = colsA.filter(c => !colsB.includes(c));
                        return (
                          <div className="text-xs">
                            {newCols.length > 0 && <span className="text-[hsl(155,60%,38%)]">+{newCols.length} nova(s)</span>}
                            {newCols.length > 0 && removedCols.length > 0 && " / "}
                            {removedCols.length > 0 && <span className="text-destructive">-{removedCols.length} removida(s)</span>}
                            {newCols.length === 0 && removedCols.length === 0 && "Sem alterações"}
                          </div>
                        );
                      })()}
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
