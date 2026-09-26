import { useState, useEffect, useMemo } from "react";
import { api } from "@/integrations/api/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Database, Layers, BarChart3, Columns3 } from "lucide-react";
import DescriptiveStats from "@/components/DescriptiveStats";

interface DiseaseDB { id: string; name: string; disease: string; }
interface Version { id: string; name: string; version_number: string; row_count: number; data: Record<string, unknown>[]; }
interface Variable { id: string; name: string; category: string; variable_type: string; }

export default function DescriptiveStatsPage() {
  const [databases, setDatabases] = useState<DiseaseDB[]>([]);
  const [selectedDbId, setSelectedDbId] = useState("");
  const [versions, setVersions] = useState<Version[]>([]);
  const [selectedVersionId, setSelectedVersionId] = useState("");
  const [variables, setVariables] = useState<Variable[]>([]);
  const [selectedVars, setSelectedVars] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.from("disease_databases").select("id, name, disease").order("name")
      .then(({ data }) => { setDatabases(data || []); setLoading(false); });
  }, []);

  useEffect(() => {
    if (!selectedDbId) {
      setVersions([]); setVariables([]); setSelectedVersionId(""); setSelectedVars(new Set());
      return;
    }
    Promise.all([
      api.from("database_versions").select("id, name, version_number, row_count, data")
        .eq("database_id", selectedDbId).order("created_at", { ascending: false }),
      api.from("database_variables").select("id, name, category, variable_type")
        .eq("database_id", selectedDbId).order("sort_order"),
    ]).then(([vRes, varRes]) => {
      const parsed = (vRes.data || []).map(v => ({ ...v, data: Array.isArray(v.data) ? v.data as Record<string, unknown>[] : [] }));
      setVersions(parsed);
      setVariables(varRes.data || []);
      setSelectedVersionId(parsed.length > 0 ? parsed[0].id : "");
      setSelectedVars(new Set((varRes.data || []).slice(0, 10).map(v => v.name)));
    });
  }, [selectedDbId]);

  const activeVersion = versions.find(v => v.id === selectedVersionId);
  const activeData = activeVersion?.data || [];

  const groupedVars = useMemo(() => {
    return variables.reduce<Record<string, Variable[]>>((acc, v) => {
      (acc[v.category] = acc[v.category] || []).push(v);
      return acc;
    }, {});
  }, [variables]);

  const toggleVar = (name: string) => {
    setSelectedVars(prev => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  const toggleCategory = (vars: Variable[]) => {
    const names = vars.map(v => v.name);
    const allSelected = names.every(n => selectedVars.has(n));
    setSelectedVars(prev => {
      const next = new Set(prev);
      names.forEach(n => allSelected ? next.delete(n) : next.add(n));
      return next;
    });
  };

  return (
    <div className="p-6 space-y-4">
      <div>
        <h2 className="text-2xl font-bold font-display">Estatísticas Descritivas</h2>
        <p className="text-sm text-muted-foreground">Selecione um banco, versão e variáveis para análise estatística</p>
      </div>

      {/* Selectors */}
      <Card>
        <CardContent className="py-3 px-4">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <Database className="h-4 w-4 text-muted-foreground" />
              <Select value={selectedDbId} onValueChange={setSelectedDbId}>
                <SelectTrigger className="w-[260px] h-9">
                  <SelectValue placeholder="Selecionar banco de dados..." />
                </SelectTrigger>
                <SelectContent>
                  {databases.map(db => (
                    <SelectItem key={db.id} value={db.id}>{db.name} ({db.disease})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {selectedDbId && versions.length > 0 && (
              <div className="flex items-center gap-2">
                <Layers className="h-4 w-4 text-muted-foreground" />
                <Select value={selectedVersionId} onValueChange={setSelectedVersionId}>
                  <SelectTrigger className="w-[240px] h-9">
                    <SelectValue placeholder="Selecionar versão..." />
                  </SelectTrigger>
                  <SelectContent>
                    {versions.map(v => (
                      <SelectItem key={v.id} value={v.id}>{v.name} (v{v.version_number}) · {v.row_count} reg</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Variable selection + Stats */}
      {activeVersion && variables.length > 0 ? (
        <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-4">
          {/* Variable selector panel */}
          <Card className="h-fit max-h-[calc(100vh-220px)] overflow-y-auto">
            <CardContent className="py-3 px-4 space-y-3">
              <div className="flex items-center gap-2 mb-1">
                <Columns3 className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-semibold">Variáveis ({selectedVars.size})</span>
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant="secondary" className="text-xs h-7" onClick={() => setSelectedVars(new Set(variables.map(v => v.name)))}>Todas</Button>
                <Button size="sm" variant="secondary" className="text-xs h-7" onClick={() => setSelectedVars(new Set())}>Limpar</Button>
              </div>
              <div className="space-y-3">
                {Object.entries(groupedVars).map(([cat, vars]) => {
                  const names = vars.map(v => v.name);
                  const allChecked = names.every(n => selectedVars.has(n));
                  const someChecked = names.some(n => selectedVars.has(n));
                  return (
                    <div key={cat}>
                      <label className="flex items-center gap-2 mb-1.5 cursor-pointer">
                        <Checkbox checked={allChecked ? true : someChecked ? "indeterminate" : false} onCheckedChange={() => toggleCategory(vars)} />
                        <span className="text-xs font-semibold">{cat}</span>
                      </label>
                      <div className="ml-5 space-y-0.5">
                        {vars.map(v => (
                          <label key={v.id} className="flex items-center gap-2 cursor-pointer">
                            <Checkbox checked={selectedVars.has(v.name)} onCheckedChange={() => toggleVar(v.name)} />
                            <span className="text-xs font-mono text-muted-foreground">{v.name}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {/* Stats content */}
          <div>
            {selectedVars.size > 0 ? (
              <DescriptiveStats
                data={activeData}
                variables={variables.map(v => ({ name: v.name, variable_type: v.variable_type, category: v.category }))}
                visibleVars={selectedVars}
              />
            ) : (
              <Card className="border-dashed">
                <CardContent className="flex flex-col items-center justify-center py-16 text-center">
                  <Columns3 className="h-10 w-10 text-muted-foreground/40 mb-3" />
                  <p className="font-medium">Nenhuma variável selecionada</p>
                  <p className="text-sm text-muted-foreground">Selecione variáveis no painel à esquerda</p>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      ) : !selectedDbId ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <BarChart3 className="h-12 w-12 text-muted-foreground/40 mb-3" />
            <p className="font-medium">Selecione um banco de dados</p>
            <p className="text-sm text-muted-foreground">Escolha um banco acima para iniciar a análise</p>
          </CardContent>
        </Card>
      ) : (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <Layers className="h-12 w-12 text-muted-foreground/40 mb-3" />
            <p className="font-medium">Nenhuma versão disponível</p>
            <p className="text-sm text-muted-foreground">Faça upload de dados primeiro</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
