import { useEffect, useState } from "react";
import { api } from "@/integrations/api/client";
import { parseUploadedFile } from "@/lib/fileParser";
import { UnsupportedSpreadsheetError } from "@/lib/spreadsheet";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Database, Upload } from "lucide-react";

export type Row = Record<string, unknown>;

export interface LoadedData {
  rows: Row[];
  columns: string[];
  label: string;
  source: "banco" | "arquivo";
}

interface DiseaseDB { id: string; name: string; disease: string }
interface VersionMeta { id: string; name: string; row_count: number }

function columnsOf(rows: Row[]): string[] {
  const seen = new Set<string>();
  const cols: string[] = [];
  for (const r of rows.slice(0, 500)) for (const k of Object.keys(r)) if (!seen.has(k)) { seen.add(k); cols.push(k); }
  return cols;
}

/** Escolha da fonte de dados: banco já cadastrado no sistema ou arquivo enviado na hora. */
export default function DataSourcePicker({ onData }: { onData: (d: LoadedData | null) => void }) {
  const [dbs, setDbs] = useState<DiseaseDB[]>([]);
  const [dbId, setDbId] = useState("");
  const [versions, setVersions] = useState<VersionMeta[]>([]);
  const [versionId, setVersionId] = useState("");
  const [loaded, setLoaded] = useState<LoadedData | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.from("disease_databases").select("id,name,disease").order("name").then(({ data }) => setDbs((data as DiseaseDB[]) || []));
  }, []);

  useEffect(() => {
    setVersions([]); setVersionId("");
    if (!dbId) return;
    api.from("database_versions").select("id,name,row_count").eq("database_id", dbId).order("created_at", { ascending: false })
      .then(({ data }) => {
        const list = (data as VersionMeta[]) || [];
        setVersions(list);
        if (list.length) setVersionId(list[0].id);
      });
  }, [dbId]);

  const publish = (d: LoadedData | null) => { setLoaded(d); onData(d); };

  useEffect(() => {
    if (!versionId) return;
    setBusy(true); setError("");
    api.from("database_versions").select("data,database_id,name").eq("id", versionId).single().then(({ data, error: err }) => {
      setBusy(false);
      if (err || !data) { setError(err?.message || "Não foi possível carregar a versão."); publish(null); return; }
      const v = data as { data: Row[]; name: string };
      const rows = Array.isArray(v.data) ? v.data : [];
      const db = dbs.find((x) => x.id === dbId);
      publish({ rows, columns: columnsOf(rows), label: `${db?.name ?? "Banco"} · ${v.name}`, source: "banco" });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [versionId]);

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true); setError("");
    try {
      const rows = await parseUploadedFile(file);
      if (!rows.length) throw new Error("Nenhuma linha de dados encontrada no arquivo.");
      publish({ rows, columns: columnsOf(rows), label: file.name, source: "arquivo" });
    } catch (e) {
      setError(e instanceof UnsupportedSpreadsheetError || e instanceof Error ? e.message : "Erro ao ler o arquivo.");
      publish(null);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3"><CardTitle className="text-base">1. Dados</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <Tabs defaultValue="banco">
          <TabsList>
            <TabsTrigger value="banco" className="gap-2"><Database className="h-4 w-4" />Banco do sistema</TabsTrigger>
            <TabsTrigger value="arquivo" className="gap-2"><Upload className="h-4 w-4" />Enviar arquivo</TabsTrigger>
          </TabsList>
          <TabsContent value="banco" className="flex flex-wrap gap-3 pt-2">
            <Select value={dbId} onValueChange={setDbId}>
              <SelectTrigger className="w-[280px]"><SelectValue placeholder="Escolha o banco" /></SelectTrigger>
              <SelectContent>{dbs.map((d) => <SelectItem key={d.id} value={d.id}>{d.name} ({d.disease})</SelectItem>)}</SelectContent>
            </Select>
            <Select value={versionId} onValueChange={setVersionId} disabled={!versions.length}>
              <SelectTrigger className="w-[280px]"><SelectValue placeholder="Versão" /></SelectTrigger>
              <SelectContent>{versions.map((v) => <SelectItem key={v.id} value={v.id}>{v.name} ({v.row_count} registros)</SelectItem>)}</SelectContent>
            </Select>
          </TabsContent>
          <TabsContent value="arquivo" className="pt-2 space-y-1">
            <input
              type="file"
              accept=".xlsx,.csv,.txt,.tsv"
              aria-label="Arquivo de dados"
              onChange={(e) => onFile(e.target.files?.[0])}
              className="block text-sm file:mr-3 file:rounded-md file:border file:bg-muted file:px-3 file:py-1.5 file:text-sm"
            />
            <p className="text-xs text-muted-foreground">.xlsx, .csv ou .txt, com uma linha de cabeçalho e uma linha por indivíduo.</p>
          </TabsContent>
        </Tabs>
        {busy && <p className="text-sm text-muted-foreground">Carregando…</p>}
        {error && <p className="text-sm text-destructive">{error}</p>}
        {loaded && !busy && (
          <div className="flex flex-wrap gap-2 text-xs">
            <Badge variant="secondary">{loaded.label}</Badge>
            <Badge variant="outline">{loaded.rows.length} registros</Badge>
            <Badge variant="outline">{loaded.columns.length} colunas</Badge>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
