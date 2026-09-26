import { useState, useEffect } from "react";
import { api } from "@/integrations/api/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, Database, FlaskConical, Trash2, Variable, Calendar, Layers, Search, X, Upload, FileSpreadsheet } from "lucide-react";
import UpdateDatabaseDialog from "@/components/UpdateDatabaseDialog";
import { toast } from "sonner";
import DatabaseVariables from "@/components/DatabaseVariables";
import DatabaseVersions from "@/components/DatabaseVersions";
import { logActivity } from "@/lib/activityLog";
import { parseUploadedFile } from "@/lib/fileParser";
import FilePreview from "@/components/FilePreview";
import { createSingleVersionBackup } from "@/lib/backupService";

interface DiseaseDB {
  id: string;
  name: string;
  disease: string;
  description: string;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export default function DiseaseDatabases() {
  const { user } = useAuth();
  const [databases, setDatabases] = useState<DiseaseDB[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [selectedDb, setSelectedDb] = useState<DiseaseDB | null>(null);

  // Search & filters
  const [searchQuery, setSearchQuery] = useState("");
  const [filterDisease, setFilterDisease] = useState("all");

  // Form
  const [name, setName] = useState("");
  const [disease, setDisease] = useState("");
  const [description, setDescription] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewData, setPreviewData] = useState<Record<string, unknown>[]>([]);
  const [previewColumns, setPreviewColumns] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);

  const fetchDatabases = async () => {
    const { data, error } = await api
      .from("disease_databases")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) toast.error("Erro ao carregar bancos de dados");
    else setDatabases(data || []);
    setLoading(false);
  };

  useEffect(() => { fetchDatabases(); }, []);

  const handleCreate = async () => {
    if (!name.trim() || !disease.trim() || !user) return;
    setUploading(true);

    try {
      // 1. Create the database
      const { data: dbData, error: dbError } = await api.from("disease_databases").insert({
        name: name.trim(), disease: disease.trim(),
        description: description.trim(), created_by: user.id,
      }).select("id").single();

      if (dbError || !dbData) {
        toast.error("Erro ao criar banco de dados");
        setUploading(false);
        return;
      }

      await logActivity("database_created", "database", dbData.id, { name: name.trim(), disease: disease.trim() });

      // 2. If a file was uploaded, parse it and create first version
      if (previewData.length > 0 && previewColumns.length > 0) {
        const variableInserts = previewColumns.map((col, i) => ({
          database_id: dbData.id,
          name: col,
          variable_type: inferType(previewData, col),
          category: "Geral",
          description: "",
          sort_order: i,
        }));
        const { error: varError } = await api.from("database_variables").insert(variableInserts);
        if (varError) {
          console.error("Error inserting variables:", varError);
          toast.warning("Banco criado, mas erro ao criar variáveis: " + varError.message);
        }

        const { error: verError } = await api.from("database_versions").insert({
          database_id: dbData.id,
          name: `v1.0 - Importação Inicial`,
          version_number: "1.0",
          row_count: previewData.length,
          data: previewData as any,
          created_by: user.id,
        });

        if (verError) {
          console.error("Error inserting version:", verError);
          toast.warning("Banco criado, mas erro ao criar versão: " + verError.message);
        } else {
          toast.success(`Banco criado com ${previewData.length} registros e ${previewColumns.length} variáveis!`);
          await logActivity("version_created", "version", undefined, { name: "v1.0 - Importação Inicial", records: previewData.length });
          // AUTO BACKUP: Create backup of the initial import
          const { data: newVersion } = await api.from("database_versions").select("*").eq("database_id", dbData.id).order("created_at", { ascending: false }).limit(1).single();
          if (newVersion) {
            await createSingleVersionBackup(newVersion.id, "initial_import");
          }
        }
      } else if (selectedFile) {
        toast.warning("Arquivo sem dados válidos. Banco criado sem versão inicial.");
      } else {
        toast.success("Banco de dados criado!");
      }

      setName(""); setDisease(""); setDescription(""); setSelectedFile(null); setPreviewData([]); setPreviewColumns([]);
      setCreateOpen(false);
      fetchDatabases();
    } finally {
      setUploading(false);
    }
  };

  /** Infer variable type from data sample */
  const inferType = (data: Record<string, unknown>[], col: string): string => {
    const samples = data.slice(0, 50).map(r => r[col]).filter(v => v != null && v !== "");
    if (samples.length === 0) return "text";
    const allNumbers = samples.every(v => !isNaN(Number(v)));
    if (allNumbers) {
      const allIntegers = samples.every(v => Number.isInteger(Number(v)));
      return allIntegers ? "integer" : "number";
    }
    const uniqueVals = new Set(samples.map(String));
    if (uniqueVals.size <= 2 && [...uniqueVals].every(v => ["0", "1", "sim", "não", "yes", "no", "true", "false", "s", "n"].includes(v.toLowerCase()))) {
      return "boolean";
    }
    // Check genotype pattern (e.g., AA, AG, GG, CC, CT, TT)
    if (samples.every(v => /^[ACGT]{2}$/i.test(String(v)))) return "genotype";
    return "text";
  };

  const handleDelete = async (id: string) => {
    const db = databases.find(d => d.id === id);
    const { error } = await api.from("disease_databases").delete().eq("id", id);
    if (error) { toast.error("Erro ao excluir"); }
    else {
      toast.success("Banco excluído");
      await logActivity("database_deleted", "database", id, { name: db?.name });
      if (selectedDb?.id === id) setSelectedDb(null);
      fetchDatabases();
    }
  };

  // Unique diseases for filter
  const uniqueDiseases = [...new Set(databases.map(d => d.disease))].sort();

  // Filtered databases
  const filteredDatabases = databases.filter(db => {
    const matchesSearch = !searchQuery ||
      db.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      db.disease.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (db.description || "").toLowerCase().includes(searchQuery.toLowerCase());
    const matchesDisease = filterDisease === "all" || db.disease === filterDisease;
    return matchesSearch && matchesDisease;
  });

  if (selectedDb) {
    return (
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" onClick={() => setSelectedDb(null)}>← Voltar</Button>
            <div>
              <h2 className="text-2xl font-bold font-display flex items-center gap-2">
                <FlaskConical className="h-6 w-6 text-accent" />
                {selectedDb.name}
              </h2>
              <p className="text-sm text-muted-foreground">
                Condição Clínica DB: <Badge variant="secondary">{selectedDb.disease}</Badge>
              </p>
            </div>
          </div>
          <UpdateDatabaseDialog
            databaseId={selectedDb.id}
            diseaseName={selectedDb.disease}
            onVersionCreated={() => {}}
          />
        </div>

        <Tabs defaultValue="variables" className="space-y-4">
          <TabsList>
            <TabsTrigger value="variables" className="gap-2"><Variable className="h-4 w-4" /> Variáveis</TabsTrigger>
            <TabsTrigger value="versions" className="gap-2"><Layers className="h-4 w-4" /> Versões & Dados</TabsTrigger>
          </TabsList>
          <TabsContent value="variables">
            <DatabaseVariables databaseId={selectedDb.id} />
          </TabsContent>
          <TabsContent value="versions">
            <DatabaseVersions databaseId={selectedDb.id} />
          </TabsContent>
        </Tabs>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold font-display">Bancos de Dados</h2>
          <p className="text-sm text-muted-foreground">Gerencie bancos de dados por condição clínica</p>
        </div>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2"><Plus className="h-4 w-4" /> Novo Banco</Button>
          </DialogTrigger>
          <DialogContent className="max-h-[90vh] overflow-y-auto">
            <DialogHeader><DialogTitle>Criar Banco de Dados</DialogTitle></DialogHeader>
            <div className="space-y-4 pt-2">
              <Input placeholder="Nome do banco (ex: COVID-19 LAPOGE)" value={name} onChange={e => setName(e.target.value)} />
              <Input placeholder="Condição Clínica DB (ex: COVID-19, Dengue, Zika)" value={disease} onChange={e => setDisease(e.target.value)} />
              <Textarea placeholder="Descrição (opcional)" value={description} onChange={e => setDescription(e.target.value)} rows={2} />
              
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">Dados iniciais (opcional)</label>
                <label
                  htmlFor="create-db-file-upload"
                  className="flex flex-col items-center justify-center rounded-lg border-2 border-dashed p-4 cursor-pointer hover:border-primary/50 transition-colors"
                >
                  <Upload className="h-5 w-5 text-muted-foreground mb-1" />
                  <p className="text-sm font-medium">{selectedFile ? selectedFile.name : "Clique para selecionar arquivo"}</p>
                  <p className="text-xs text-muted-foreground">.xlsx, .xls, .csv, .txt (tab-separado)</p>
                  <input
                    id="create-db-file-upload"
                    type="file"
                    accept=".csv,.xlsx,.xls,.txt"
                    className="hidden"
                    onChange={e => { if (e.target.files?.[0]) setSelectedFile(e.target.files[0]); }}
                  />
                </label>
                {selectedFile && (
                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary" className="text-xs">{selectedFile.name}</Badge>
                      <Button variant="ghost" size="sm" className="text-xs text-muted-foreground h-6 px-2" onClick={(e) => { e.stopPropagation(); setSelectedFile(null); setPreviewData([]); setPreviewColumns([]); }}>
                        <X className="h-3 w-3" /> Remover
                      </Button>
                    </div>
                    <FilePreview
                      file={selectedFile}
                      onParsed={(data, cols) => { setPreviewData(data); setPreviewColumns(cols); }}
                    />
                  </div>
                )}
              </div>

              <Button onClick={handleCreate} disabled={!name.trim() || !disease.trim() || uploading} className="w-full gap-2">
                {uploading ? (
                  <div className="h-4 w-4 rounded-full border-2 border-primary-foreground border-t-transparent animate-spin" />
                ) : (
                  <Database className="h-4 w-4" />
                )}
                {uploading ? "Criando..." : selectedFile ? "Criar Banco e Importar Dados" : "Criar Banco"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Search & filters */}
      <Card>
        <CardContent className="py-3 px-4">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por nome, condição clínica ou descrição..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="pl-10 h-9"
              />
              {searchQuery && (
                <button className="absolute right-3 top-1/2 -translate-y-1/2" onClick={() => setSearchQuery("")}>
                  <X className="h-4 w-4 text-muted-foreground hover:text-foreground" />
                </button>
              )}
            </div>
            <Select value={filterDisease} onValueChange={setFilterDisease}>
              <SelectTrigger className="w-[200px] h-9">
                <SelectValue placeholder="Todas as condições" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas as condições</SelectItem>
                {uniqueDiseases.map(d => (
                  <SelectItem key={d} value={d}>{d}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {(searchQuery || filterDisease !== "all") && (
              <Badge variant="secondary" className="text-xs">
                {filteredDatabases.length} resultado(s)
              </Badge>
            )}
          </div>
        </CardContent>
      </Card>

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="h-8 w-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
        </div>
      ) : filteredDatabases.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <Database className="h-12 w-12 text-muted-foreground/50 mb-3" />
            <p className="font-medium">{databases.length === 0 ? "Nenhum banco de dados criado" : "Nenhum resultado encontrado"}</p>
            <p className="text-sm text-muted-foreground">
              {databases.length === 0 ? "Crie seu primeiro banco baseado em uma condição clínica" : "Tente ajustar os filtros de busca"}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filteredDatabases.map(db => (
            <Card key={db.id} className="hover:border-primary/30 transition-colors cursor-pointer group" onClick={() => setSelectedDb(db)}>
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div>
                    <CardTitle className="text-base font-display">{db.name}</CardTitle>
                    <CardDescription className="mt-1">{db.description || "Sem descrição"}</CardDescription>
                  </div>
                  <Button variant="ghost" size="icon" className="opacity-0 group-hover:opacity-100 transition-opacity" onClick={e => { e.stopPropagation(); handleDelete(db.id); }}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-3">
                  <Badge variant="secondary" className="gap-1">
                    <FlaskConical className="h-3 w-3" /> {db.disease}
                  </Badge>
                  <span className="text-xs text-muted-foreground flex items-center gap-1">
                    <Calendar className="h-3 w-3" />
                    {new Date(db.created_at).toLocaleDateString("pt-BR")}
                  </span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
