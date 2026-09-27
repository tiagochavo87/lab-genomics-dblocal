import { useEffect, useState } from "react";
import { api } from "@/integrations/api/client";
import { useRole } from "@/hooks/useAdminCheck";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { History, RotateCcw, ShieldCheck, Send, Save } from "lucide-react";

interface DiseaseDB { id: string; name: string; disease: string }
interface VersionRow { id: string; name: string; version_number: string; row_count: number; created_at: string }
interface BackupRow {
  id: string; version_id: string; version_name: string; version_number: string;
  row_count: number; backup_reason: string; created_at: string;
}

const REASON_LABEL: Record<string, string> = {
  manual: "Manual",
  auto: "Automático",
  pre_new_version: "Antes de nova versão",
  new_version_upload: "Nova versão enviada",
  initial_import: "Importação inicial",
  pre_update: "Antes de atualização",
};

const fmt = (iso: string) => new Date(iso).toLocaleString("pt-BR");

export default function VersionManager() {
  const { isEditor } = useRole();
  const [databases, setDatabases] = useState<DiseaseDB[]>([]);
  const [dbId, setDbId] = useState("");
  const [versions, setVersions] = useState<VersionRow[]>([]);
  const [backups, setBackups] = useState<BackupRow[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.from("disease_databases").select("id,name,disease").order("name").then(({ data }) => {
      const list = (data as DiseaseDB[]) || [];
      setDatabases(list);
      if (list.length && !dbId) setDbId(list[0].id);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const load = async (id = dbId) => {
    if (!id) return;
    // Seleciona só metadados: os dados completos não precisam vir para esta tela.
    const [v, b] = await Promise.all([
      api.from("database_versions").select("id,name,version_number,row_count,created_at").eq("database_id", id).order("created_at", { ascending: false }),
      api.from("version_backups").select("id,version_id,version_name,version_number,row_count,backup_reason,created_at").eq("database_id", id).order("created_at", { ascending: false }),
    ]);
    setVersions((v.data as VersionRow[]) || []);
    setBackups((b.data as BackupRow[]) || []);
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(dbId); }, [dbId]);

  const backupAll = async () => {
    setBusy(true);
    const { data, error } = await api.backups.database(dbId, "manual");
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success(`${data?.created.length ?? 0} cópia(s) criada(s)`);
    load();
  };

  const backupOne = async (versionId: string) => {
    const { error } = await api.backups.version(versionId, "manual");
    if (error) return toast.error(error.message);
    toast.success("Cópia criada");
    load();
  };

  const restore = async (backupId: string) => {
    const { error } = await api.backups.restore(backupId);
    if (error) return toast.error(error.message);
    toast.success("Versão restaurada a partir da cópia");
    load();
  };

  const send = async (versionId: string) => {
    const { data, error } = await api.backups.sendToDestinations(versionId);
    if (error) return toast.error(error.message);
    if (!data?.length) return toast.info("Nenhum destino externo habilitado (Administração → Backup)");
    for (const r of data) {
      if (r.success) toast.success(`Enviado para ${r.label}`);
      else toast.error(`${r.label}: ${r.error}`);
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Versões e Cópias de Segurança</h2>
        <p className="text-sm text-muted-foreground">
          Histórico de versões de cada banco e cópias internas para restauração. As cópias são feitas no servidor.
        </p>
      </div>

      <Card className="border-primary/30">
        <CardContent className="pt-6 text-sm text-muted-foreground flex gap-3">
          <ShieldCheck className="h-5 w-5 text-primary shrink-0" />
          <p>
            Estas cópias ficam no <strong>mesmo banco de dados</strong> e servem para desfazer uma atualização.
            A proteção contra perda do servidor é o <strong>backup automático diário</strong> (pg_dump) configurado
            na instalação, que grava arquivos em outro local.
          </p>
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-center gap-3">
        <Select value={dbId} onValueChange={setDbId}>
          <SelectTrigger className="w-[320px]"><SelectValue placeholder="Selecione o banco" /></SelectTrigger>
          <SelectContent>
            {databases.map((d) => <SelectItem key={d.id} value={d.id}>{d.name} ({d.disease})</SelectItem>)}
          </SelectContent>
        </Select>
        {isEditor && dbId && (
          <Button onClick={backupAll} disabled={busy} className="gap-2">
            <Save className="h-4 w-4" /> Copiar todas as versões agora
          </Button>
        )}
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Versões</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead><TableHead>Nº</TableHead><TableHead>Registros</TableHead>
                <TableHead>Criada em</TableHead>{isEditor && <TableHead className="text-right">Ações</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {versions.map((v) => (
                <TableRow key={v.id}>
                  <TableCell className="font-medium">{v.name}</TableCell>
                  <TableCell>{v.version_number}</TableCell>
                  <TableCell>{v.row_count}</TableCell>
                  <TableCell>{fmt(v.created_at)}</TableCell>
                  {isEditor && (
                    <TableCell className="text-right space-x-2">
                      <Button size="sm" variant="outline" onClick={() => backupOne(v.id)} className="gap-1"><Save className="h-3 w-3" />Copiar</Button>
                      <Button size="sm" variant="outline" onClick={() => send(v.id)} className="gap-1"><Send className="h-3 w-3" />Enviar a destinos</Button>
                    </TableCell>
                  )}
                </TableRow>
              ))}
              {!versions.length && (
                <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground">Nenhuma versão</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base flex items-center gap-2"><History className="h-4 w-4" />Cópias internas</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Versão</TableHead><TableHead>Motivo</TableHead><TableHead>Registros</TableHead>
                <TableHead>Data</TableHead>{isEditor && <TableHead className="text-right">Restaurar</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {backups.map((b) => (
                <TableRow key={b.id}>
                  <TableCell className="font-medium">{b.version_name}</TableCell>
                  <TableCell><Badge variant="secondary">{REASON_LABEL[b.backup_reason] || b.backup_reason}</Badge></TableCell>
                  <TableCell>{b.row_count}</TableCell>
                  <TableCell>{fmt(b.created_at)}</TableCell>
                  {isEditor && (
                    <TableCell className="text-right">
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button size="sm" variant="outline" className="gap-1"><RotateCcw className="h-3 w-3" />Restaurar</Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Restaurar esta cópia?</AlertDialogTitle>
                            <AlertDialogDescription>
                              O conteúdo atual da versão "{b.version_name}" será substituído pelo desta cópia de {fmt(b.created_at)}.
                              Recomenda-se copiar a versão atual antes.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancelar</AlertDialogCancel>
                            <AlertDialogAction onClick={() => restore(b.id)}>Restaurar</AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </TableCell>
                  )}
                </TableRow>
              ))}
              {!backups.length && (
                <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground">Nenhuma cópia</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
