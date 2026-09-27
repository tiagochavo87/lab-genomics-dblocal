import { useState, useEffect, useMemo } from "react";
import { api } from "@/integrations/api/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Database, Layers, Activity, Users, Columns3, ChevronLeft, ChevronRight, FileSpreadsheet, FileText } from "lucide-react";
import { toast } from "sonner";
import { downloadXlsx, type SheetSpec } from "@/lib/spreadsheet";
import { useAuth } from "@/contexts/AuthContext";
import { useRole } from "@/hooks/useAdminCheck";
import { getIdentifyingColumns } from "@/lib/dataMasking";
import { logActivity } from "@/lib/activityLog";
import { ShieldAlert } from "lucide-react";
import DashboardCharts from "@/components/DashboardCharts";

const PAGE_SIZES = [10, 25, 50, 100];

interface DbRecord {
  id: string;
  name: string;
  disease: string;
}

interface VersionRecord {
  id: string;
  name: string;
  database_id: string;
  row_count: number;
  data: unknown;
  created_at: string;
}

interface VariableRecord {
  id: string;
  name: string;
  category: string;
  variable_type: string;
  database_id: string;
  sort_order: number;
}

export default function Dashboard() {
  const { profile } = useAuth();

  // Data from api
  const [databases, setDatabases] = useState<DbRecord[]>([]);
  const [versions, setVersions] = useState<VersionRecord[]>([]);
  const [variables, setVariables] = useState<VariableRecord[]>([]);
  const [loading, setLoading] = useState(true);

  // Selections
  const [selectedDbId, setSelectedDbId] = useState<string>("");
  const [selectedVersionId, setSelectedVersionId] = useState<string>("");
  const [visibleVars, setVisibleVars] = useState<Set<string>>(new Set());

  // Table pagination
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(25);

  useEffect(() => {
    loadAll();
  }, []);

  const loadAll = async () => {
    const [dbRes, verRes, varRes] = await Promise.all([
      api.from("disease_databases").select("id, name, disease").order("name"),
      api.from("database_versions").select("id, name, database_id, row_count, data, created_at").order("created_at", { ascending: false }),
      api.from("database_variables").select("id, name, category, variable_type, database_id, sort_order").order("sort_order"),
    ]);
    const dbs = dbRes.data || [];
    const vers = verRes.data || [];
    const vars = varRes.data || [];

    setDatabases(dbs);
    setVersions(vers);
    setVariables(vars);

    // Auto-select first database
    if (dbs.length > 0) {
      const firstDb = dbs[0];
      setSelectedDbId(firstDb.id);
      const dbVersions = vers.filter(v => v.database_id === firstDb.id);
      if (dbVersions.length > 0) setSelectedVersionId(dbVersions[0].id);
      const dbVars = vars.filter(v => v.database_id === firstDb.id);
      setVisibleVars(new Set(dbVars.map(v => v.name)));
    }
    setLoading(false);
  };

  // Derived: filtered versions & variables for selected database
  const dbVersions = useMemo(() => versions.filter(v => v.database_id === selectedDbId), [versions, selectedDbId]);
  const dbVariables = useMemo(() => variables.filter(v => v.database_id === selectedDbId), [variables, selectedDbId]);
  const { isAdmin } = useRole();
  const maskedCols = useMemo(
    () => getIdentifyingColumns(dbVariables.map((v) => v.name), dbVariables as Array<{ name: string; identifying?: boolean | null }>),
    [dbVariables]
  );

  // Grouped variables by category
  const groupedVars = useMemo(() => {
    const groups: Record<string, VariableRecord[]> = {};
    dbVariables.forEach(v => {
      (groups[v.category] = groups[v.category] || []).push(v);
    });
    return groups;
  }, [dbVariables]);

  // Selected version data
  const versionData = useMemo(() => {
    const ver = versions.find(v => v.id === selectedVersionId);
    if (!ver || !ver.data) return [];
    const data = ver.data as Record<string, unknown>[];
    return Array.isArray(data) ? data : [];
  }, [versions, selectedVersionId]);

  // Ordered visible columns
  const orderedVisible = useMemo(() => {
    const allVarNames = dbVariables.map(v => v.name);
    // Also include columns from data that may not be in variables
    const dataKeys = versionData.length > 0 ? Object.keys(versionData[0]) : [];
    const allCols = [...new Set([...allVarNames, ...dataKeys])];
    return allCols.filter(c => visibleVars.has(c));
  }, [dbVariables, versionData, visibleVars]);

  // Pagination
  const totalPages = Math.max(1, Math.ceil(versionData.length / pageSize));
  const pageData = versionData.slice(page * pageSize, (page + 1) * pageSize);

  // Handle database change
  const handleDbChange = (dbId: string) => {
    setSelectedDbId(dbId);
    setPage(0);
    const dbVers = versions.filter(v => v.database_id === dbId);
    setSelectedVersionId(dbVers.length > 0 ? dbVers[0].id : "");
    const dbVars = variables.filter(v => v.database_id === dbId);
    setVisibleVars(new Set(dbVars.map(v => v.name)));
  };

  const handleVersionChange = (verId: string) => {
    setSelectedVersionId(verId);
    setPage(0);
  };

  const toggleVar = (name: string) => {
    setVisibleVars(prev => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  const toggleCategory = (vars: VariableRecord[]) => {
    const names = vars.map(v => v.name);
    const allSelected = names.every(n => visibleVars.has(n));
    setVisibleVars(prev => {
      const next = new Set(prev);
      names.forEach(n => allSelected ? next.delete(n) : next.add(n));
      return next;
    });
  };

  const selectAllVars = () => {
    const dataKeys = versionData.length > 0 ? Object.keys(versionData[0]) : [];
    const allNames = [...new Set([...dbVariables.map(v => v.name), ...dataKeys])];
    setVisibleVars(new Set(allNames));
  };

  const clearAllVars = () => setVisibleVars(new Set());

  // Export
  const exportData = (format: "xlsx" | "txt") => {
    void logActivity("sensitive_data_export", "version", selectedVersionId, { format, records: versionData.length, masked: !isAdmin });
    if (!versionData.length || !orderedVisible.length) {
      toast.error("Nenhum dado ou variável selecionada para exportar");
      return;
    }
    const activeVersion = versions.find(v => v.id === selectedVersionId);
    const versionLabel = activeVersion?.name || "versão";
    const userName = profile?.full_name || "Usuário";
    const now = new Date();
    const dateStr = now.toLocaleDateString("pt-BR") + " " + now.toLocaleTimeString("pt-BR");
    const selectedDb = databases.find(d => d.id === selectedDbId);

    const exportRows = versionData.map(row => {
      const obj: Record<string, unknown> = {};
      orderedVisible.forEach(col => { obj[col] = (row as Record<string, unknown>)[col] ?? ""; });
      return obj;
    });

    if (format === "xlsx") {
      const sheets: SheetSpec[] = [];
      const infoData = [
        ["Banco de Dados", selectedDb?.name || ""],
        ["Doença", selectedDb?.disease || ""],
        ["Versão", versionLabel],
        ["Exportado por", userName],
        ["Data de Exportação", dateStr],
        ["Total de Registros", String(versionData.length)],
        ["Variáveis Exportadas", String(orderedVisible.length)],
      ];
      sheets.push({ name: "Informações", aoa: infoData });
      sheets.push({ name: "Dados", rows: exportRows });
      void downloadXlsx(`${selectedDb?.name || "dados"}_${versionLabel}.xlsx`, sheets)
        .then(() => toast.success("Arquivo XLS exportado!"))
        .catch((err) => { console.error("[xlsx]", err); toast.error("Falha ao gerar o arquivo XLSX: " + (err?.message || err)); });
    } else {
      const meta = [
        `# Banco de Dados: ${selectedDb?.name || ""}`,
        `# Doença: ${selectedDb?.disease || ""}`,
        `# Versão: ${versionLabel}`,
        `# Exportado por: ${userName}`,
        `# Data: ${dateStr}`,
        `# Registros: ${versionData.length}`,
        `# Variáveis: ${orderedVisible.length}`,
        "",
      ];
      const header = orderedVisible.join("\t");
      const rows = exportRows.map(r => orderedVisible.map(c => String(r[c] ?? "")).join("\t"));
      const blob = new Blob([[...meta, header, ...rows].join("\n")], { type: "text/plain;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${selectedDb?.name || "dados"}_${versionLabel}.txt`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Arquivo TXT exportado!");
    }
  };

  // KPIs
  const totalRecords = versions.reduce((s, v) => s + (v.row_count || 0), 0);
  const kpis = [
    { title: "Bancos de Dados", value: databases.length, icon: Database, color: "text-primary" },
    { title: "Versões", value: versions.length, icon: Layers, color: "text-accent" },
    { title: "Variáveis", value: variables.length, icon: Activity, color: "text-[hsl(260,50%,55%)]" },
    { title: "Registros Totais", value: totalRecords.toLocaleString("pt-BR"), icon: Users, color: "text-[hsl(175,65%,42%)]" },
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="h-8 w-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h2 className="text-2xl font-bold font-display">Dashboard</h2>
        <p className="text-sm text-muted-foreground">Panorama geral dos bancos de dados genômicos</p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {kpis.map((kpi) => (
          <Card key={kpi.title} className="relative overflow-hidden">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{kpi.title}</CardTitle>
              <kpi.icon className={`h-5 w-5 ${kpi.color}`} />
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold font-display">{kpi.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Database & Version Selectors */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-display flex items-center gap-2 flex-wrap">
            Explorar Dados
            {!isAdmin && maskedCols.length > 0 && (
              <Badge variant="outline" className="text-xs gap-1 border-amber-500/50 text-amber-600 font-normal">
                <ShieldAlert className="h-3 w-3" />
                {maskedCols.length} coluna(s) mascarada(s) — LGPD
              </Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-end gap-4">
            {/* Database selector */}
            <div className="space-y-1.5 min-w-[220px]">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Banco de Dados</label>
              <Select value={selectedDbId} onValueChange={handleDbChange}>
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue placeholder="Selecione um banco" />
                </SelectTrigger>
                <SelectContent>
                  {databases.map(db => (
                    <SelectItem key={db.id} value={db.id}>
                      {db.name} <span className="text-muted-foreground ml-1">({db.disease})</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Version selector */}
            <div className="space-y-1.5 min-w-[220px]">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Versão</label>
              <Select value={selectedVersionId} onValueChange={handleVersionChange}>
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue placeholder="Selecione uma versão" />
                </SelectTrigger>
                <SelectContent>
                  {dbVersions.map(v => (
                    <SelectItem key={v.id} value={v.id}>
                      {v.name} ({v.row_count} registros)
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Variable selector */}
            <Sheet>
              <SheetTrigger asChild>
                <Button variant="outline" className="gap-2 h-9">
                  <Columns3 className="h-4 w-4" />
                  Variáveis ({visibleVars.size})
                </Button>
              </SheetTrigger>
              <SheetContent className="w-[380px] overflow-y-auto">
                <SheetHeader>
                  <SheetTitle>Variáveis de Interesse</SheetTitle>
                </SheetHeader>
                <div className="flex gap-2 my-4">
                  <Button size="sm" variant="secondary" onClick={selectAllVars}>Selecionar Todas</Button>
                  <Button size="sm" variant="secondary" onClick={clearAllVars}>Limpar</Button>
                </div>
                {Object.keys(groupedVars).length > 0 ? (
                  <div className="space-y-5">
                    {Object.entries(groupedVars).map(([cat, vars]) => {
                      const allChecked = vars.every(v => visibleVars.has(v.name));
                      const someChecked = vars.some(v => visibleVars.has(v.name));
                      return (
                        <div key={cat}>
                          <label className="flex items-center gap-2 mb-2 cursor-pointer">
                            <Checkbox
                              checked={allChecked ? true : someChecked ? "indeterminate" : false}
                              onCheckedChange={() => toggleCategory(vars)}
                            />
                            <span className="text-sm font-semibold text-foreground">{cat}</span>
                            <Badge variant="outline" className="text-xs ml-1">{vars.length}</Badge>
                          </label>
                          <div className="ml-6 grid grid-cols-1 gap-1.5">
                            {vars.map(v => (
                              <label key={v.id} className="flex items-center gap-2 cursor-pointer">
                                <Checkbox
                                  checked={visibleVars.has(v.name)}
                                  onCheckedChange={() => toggleVar(v.name)}
                                />
                                <span className="text-xs text-muted-foreground font-mono">{v.name}</span>
                              </label>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="py-8 text-center">
                    <p className="text-sm text-muted-foreground">
                      {versionData.length > 0
                        ? "Nenhuma variável cadastrada. As colunas dos dados serão usadas."
                        : "Nenhuma variável disponível para este banco."}
                    </p>
                    {versionData.length > 0 && (
                      <div className="mt-4 space-y-1.5">
                        {Object.keys(versionData[0]).map(key => (
                          <label key={key} className="flex items-center gap-2 cursor-pointer">
                            <Checkbox
                              checked={visibleVars.has(key)}
                              onCheckedChange={() => toggleVar(key)}
                            />
                            <span className="text-xs text-muted-foreground font-mono">{key}</span>
                          </label>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </SheetContent>
            </Sheet>

            {/* Export buttons */}
            <div className="flex gap-2 ml-auto">
              <Button variant="outline" size="sm" className="gap-1.5" onClick={() => exportData("xlsx")}>
                <FileSpreadsheet className="h-4 w-4" /> XLS
              </Button>
              <Button variant="outline" size="sm" className="gap-1.5" onClick={() => exportData("txt")}>
                <FileText className="h-4 w-4" /> TXT
              </Button>
            </div>
          </div>

          {/* Info badge */}
          {selectedVersionId && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Badge variant="secondary">{versionData.length} registros</Badge>
              <span>·</span>
              <span>{orderedVisible.length} variáveis visíveis</span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Charts & Analysis */}
      {selectedVersionId && versionData.length > 0 && (
        <DashboardCharts
          data={versionData}
          variables={dbVariables.map(v => ({ name: v.name, variable_type: v.variable_type, category: v.category }))}
          visibleVars={visibleVars}
        />
      )}

      {/* Data Table */}
      {selectedVersionId && versionData.length > 0 && orderedVisible.length > 0 ? (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    {orderedVisible.map(col => (
                      <TableHead key={col} className="whitespace-nowrap text-xs font-mono">{col}</TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pageData.map((row, i) => (
                    <TableRow key={i}>
                      {orderedVisible.map(col => (
                        <TableCell key={col} className="whitespace-nowrap text-xs">
                          {(row as Record<string, unknown>)[col] != null ? String((row as Record<string, unknown>)[col]) : "—"}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {/* Pagination */}
            <div className="flex items-center justify-between px-4 py-3 border-t">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                Linhas por página:
                <Select value={String(pageSize)} onValueChange={v => { setPageSize(Number(v)); setPage(0); }}>
                  <SelectTrigger className="w-[70px] h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PAGE_SIZES.map(s => <SelectItem key={s} value={String(s)}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                Página {page + 1} de {totalPages}
                <Button variant="ghost" size="icon" disabled={page === 0} onClick={() => setPage(p => p - 1)}>
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="icon" disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}>
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      ) : selectedVersionId ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <Database className="h-10 w-10 mb-2 opacity-30" />
            <p className="text-sm">
              {versionData.length === 0
                ? "Nenhum dado nesta versão."
                : "Selecione variáveis para visualizar os dados."}
            </p>
          </CardContent>
        </Card>
      ) : databases.length > 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <Database className="h-10 w-10 mb-2 opacity-30" />
            <p className="text-sm">Selecione um banco de dados e uma versão para explorar.</p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <Database className="h-10 w-10 mb-2 opacity-30" />
            <p className="text-sm">Nenhum banco de dados cadastrado ainda.</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
