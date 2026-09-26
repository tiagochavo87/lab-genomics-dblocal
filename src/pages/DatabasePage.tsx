import { useState, useEffect, useMemo } from "react";
import { api } from "@/integrations/api/client";
import { useAuth } from "@/contexts/AuthContext";
import { useAdminCheck } from "@/hooks/useAdminCheck";
import { getIdentifyingColumns } from "@/lib/dataMasking";
import { logSensitiveAccess } from "@/lib/sensitiveAccessLog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Columns3, ChevronLeft, ChevronRight, FileSpreadsheet, FileText, Database, Layers, Search, X, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { downloadXlsx, type SheetSpec } from "@/lib/spreadsheet";

const PAGE_SIZES = [10, 25, 50];

interface DiseaseDB {
  id: string;
  name: string;
  disease: string;
}

interface Version {
  id: string;
  name: string;
  version_number: string;
  row_count: number;
  data: Record<string, unknown>[];
}

interface Variable {
  id: string;
  name: string;
  category: string;
  variable_type: string;
}

export default function DatabasePage() {
  const { profile } = useAuth();
  const { isAdmin } = useAdminCheck();

  const [databases, setDatabases] = useState<DiseaseDB[]>([]);
  const [selectedDbId, setSelectedDbId] = useState<string>("");
  const [versions, setVersions] = useState<Version[]>([]);
  const [selectedVersionId, setSelectedVersionId] = useState<string>("");
  const [variables, setVariables] = useState<Variable[]>([]);
  const [loading, setLoading] = useState(true);

  const [visibleColumns, setVisibleColumns] = useState<Set<string>>(new Set());
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(25);
  const [searchData, setSearchData] = useState("");

  // Fetch databases
  useEffect(() => {
    api
      .from("disease_databases")
      .select("id, name, disease")
      .order("name")
      .then(({ data }) => {
        setDatabases(data || []);
        setLoading(false);
      });
  }, []);

  // Fetch versions & variables when database changes
  useEffect(() => {
    if (!selectedDbId) {
      setVersions([]);
      setVariables([]);
      setSelectedVersionId("");
      setVisibleColumns(new Set());
      return;
    }

    Promise.all([
      api
        .from("database_versions")
        .select("id, name, version_number, row_count, data")
        .eq("database_id", selectedDbId)
        .order("created_at", { ascending: false }),
      api
        .from("database_variables")
        .select("id, name, category, variable_type")
        .eq("database_id", selectedDbId)
        .order("sort_order"),
    ]).then(([vRes, varRes]) => {
      const parsedVersions = (vRes.data || []).map((v) => ({
        ...v,
        data: Array.isArray(v.data) ? (v.data as Record<string, unknown>[]) : [],
      }));
      setVersions(parsedVersions);
      setVariables(varRes.data || []);

      if (parsedVersions.length > 0) {
        setSelectedVersionId(parsedVersions[0].id);
      } else {
        setSelectedVersionId("");
      }

      // Auto-select first 10 variables
      const varNames = (varRes.data || []).slice(0, 10).map((v) => v.name);
      setVisibleColumns(new Set(varNames));
      setPage(0);
    });
  }, [selectedDbId]);

  const activeVersion = versions.find((v) => v.id === selectedVersionId);
  const allColumns = variables.map((v) => v.name);
  const orderedVisible = allColumns.filter((c) => visibleColumns.has(c));
  const identifyingCols = useMemo(() => getIdentifyingColumns(allColumns, variables), [allColumns, variables]);

  const activeData = useMemo(() => {
    const raw = activeVersion?.data || [];
    // Já vem mascarado do servidor para quem não tem permissão.
    const masked = raw;
    if (!searchData.trim()) return masked;
    const q = searchData.toLowerCase();
    return masked.filter((row) =>
      Object.values(row).some((val) => val != null && String(val).toLowerCase().includes(q))
    );
  }, [activeVersion, searchData, isAdmin]);

  const totalPages = Math.ceil(activeData.length / pageSize);
  const pageData = activeData.slice(page * pageSize, (page + 1) * pageSize);

  const toggleColumn = (col: string) => {
    setVisibleColumns((prev) => {
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
    const names = vars.map((v) => v.name);
    const allSelected = names.every((n) => visibleColumns.has(n));
    setVisibleColumns((prev) => {
      const next = new Set(prev);
      names.forEach((n) => (allSelected ? next.delete(n) : next.add(n)));
      return next;
    });
  };

  const exportData = (format: "xlsx" | "txt") => {
    if (!activeData.length || !orderedVisible.length) {
      toast.error("Selecione variáveis e uma versão com dados");
      return;
    }

    const now = new Date();
    const dateStr = now.toLocaleDateString("pt-BR") + " " + now.toLocaleTimeString("pt-BR");
    const versionLabel = activeVersion?.name || "";
    const userName = profile?.full_name || "Usuário";
    const dbName = databases.find((d) => d.id === selectedDbId)?.name || "";

    const exportRows = activeData.map((row) => {
      const obj: Record<string, unknown> = {};
      orderedVisible.forEach((col) => {
        obj[col] = row[col] ?? "";
      });
      return obj;
    });

    if (format === "xlsx") {
      const sheets: SheetSpec[] = [];
      const infoData = [
        ["Banco de Dados", dbName],
        ["Versão", versionLabel],
        ["Exportado por", userName],
        ["Data de Exportação", dateStr],
        ["Total de Registros", String(activeData.length)],
        ["Variáveis Exportadas", String(orderedVisible.length)],
      ];
      sheets.push({ name: "Informações", aoa: infoData });
      sheets.push({ name: "Dados", rows: exportRows });
      void downloadXlsx(`${dbName}_${versionLabel}.xlsx`, sheets).catch(() => toast.error("Falha ao gerar o arquivo XLSX"));
      toast.success("Arquivo XLS exportado!");
    } else {
      const meta = [
        `# Banco de Dados: ${dbName}`,
        `# Versão: ${versionLabel}`,
        `# Exportado por: ${userName}`,
        `# Data de Exportação: ${dateStr}`,
        `# Registros: ${activeData.length}`,
        `# Variáveis: ${orderedVisible.length}`,
        "",
      ];
      const header = orderedVisible.join("\t");
      const rows = exportRows.map((r) => orderedVisible.map((c) => String(r[c] ?? "")).join("\t"));
      const content = [...meta, header, ...rows].join("\n");
      const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${dbName}_${versionLabel}.txt`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Arquivo TXT exportado!");
    }
  };

  return (
    <div className="p-6 space-y-4">
      <div>
        <h2 className="text-2xl font-bold font-display">Banco de Dados</h2>
        <p className="text-sm text-muted-foreground">Selecione um banco e versão para explorar os dados</p>
      </div>

      {/* Selectors */}
      <Card>
        <CardContent className="py-3 px-4">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <Database className="h-4 w-4 text-muted-foreground" />
              <Select value={selectedDbId} onValueChange={(v) => { setSelectedDbId(v); setPage(0); setSearchData(""); }}>
                <SelectTrigger className="w-[260px] h-9">
                  <SelectValue placeholder="Selecionar banco de dados..." />
                </SelectTrigger>
                <SelectContent>
                  {databases.map((db) => (
                    <SelectItem key={db.id} value={db.id}>
                      {db.name} ({db.disease})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {selectedDbId && versions.length > 0 && (
              <div className="flex items-center gap-2">
                <Layers className="h-4 w-4 text-muted-foreground" />
                <Select value={selectedVersionId} onValueChange={(v) => { setSelectedVersionId(v); setPage(0); }}>
                  <SelectTrigger className="w-[240px] h-9">
                    <SelectValue placeholder="Selecionar versão..." />
                  </SelectTrigger>
                  <SelectContent>
                    {versions.map((v) => (
                      <SelectItem key={v.id} value={v.id}>
                        {v.name} (v{v.version_number}) · {v.row_count} reg
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {activeVersion && (
              <>
                <div className="relative flex-1 min-w-[150px]">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                  <Input
                    placeholder="Buscar nos dados..."
                    value={searchData}
                    onChange={(e) => { setSearchData(e.target.value); setPage(0); }}
                    className="h-9 pl-8 text-sm"
                  />
                  {searchData && (
                    <button className="absolute right-2 top-1/2 -translate-y-1/2" onClick={() => setSearchData("")}>
                      <X className="h-3.5 w-3.5 text-muted-foreground" />
                    </button>
                  )}
                </div>

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
                        const names = vars.map((v) => v.name);
                        const allChecked = names.every((n) => visibleColumns.has(n));
                        const someChecked = names.some((n) => visibleColumns.has(n));
                        return (
                          <div key={cat}>
                            <label className="flex items-center gap-2 mb-2 cursor-pointer">
                              <Checkbox checked={allChecked ? true : someChecked ? "indeterminate" : false} onCheckedChange={() => toggleCategory(vars)} />
                              <span className="text-sm font-semibold">{cat}</span>
                            </label>
                            <div className="ml-6 space-y-1">
                              {vars.map((v) => (
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
              </>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Empty states */}
      {!selectedDbId && (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <Database className="h-12 w-12 text-muted-foreground/40 mb-3" />
            <p className="font-medium">Selecione um banco de dados</p>
            <p className="text-sm text-muted-foreground">Escolha um banco acima para visualizar os dados</p>
          </CardContent>
        </Card>
      )}

      {selectedDbId && versions.length === 0 && !loading && (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <Layers className="h-12 w-12 text-muted-foreground/40 mb-3" />
            <p className="font-medium">Nenhuma versão disponível</p>
            <p className="text-sm text-muted-foreground">Faça upload de dados na seção "Bancos de Dados" primeiro</p>
          </CardContent>
        </Card>
      )}

      {/* Info bar */}
      {activeVersion && (
        <div className="flex items-center gap-3 flex-wrap">
          <Badge variant="secondary" className="text-xs">{activeData.length} registros</Badge>
          <Badge variant="outline" className="text-xs">{orderedVisible.length} colunas visíveis</Badge>
          {!isAdmin && identifyingCols.length > 0 && (
            <Badge variant="outline" className="text-xs gap-1 border-amber-500/50 text-amber-600">
              <ShieldAlert className="h-3 w-3" />
              {identifyingCols.length} coluna(s) mascarada(s) — LGPD
            </Badge>
          )}
          {searchData && (
            <Badge variant="secondary" className="text-xs">{activeData.length} resultado(s)</Badge>
          )}
        </div>
      )}

      {/* Data table */}
      {activeVersion && orderedVisible.length > 0 && (
        <>
          <div className="rounded-lg border bg-card overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  {orderedVisible.map((col) => (
                    <TableHead key={col} className="whitespace-nowrap text-xs font-mono">{col}</TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {pageData.map((row, i) => (
                  <TableRow key={i}>
                    {orderedVisible.map((col) => (
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
              Linhas por página:
              <Select value={String(pageSize)} onValueChange={(v) => { setPageSize(Number(v)); setPage(0); }}>
                <SelectTrigger className="w-[70px] h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PAGE_SIZES.map((s) => (
                    <SelectItem key={s} value={String(s)}>{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              Página {page + 1} de {totalPages || 1}
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

      {activeVersion && orderedVisible.length === 0 && (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <Columns3 className="h-10 w-10 text-muted-foreground/40 mb-3" />
            <p className="font-medium">Nenhuma variável selecionada</p>
            <p className="text-sm text-muted-foreground">Clique em "Variáveis" para escolher as colunas visíveis</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
