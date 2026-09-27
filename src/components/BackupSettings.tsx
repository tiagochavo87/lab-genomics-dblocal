import { useState, useEffect } from "react";
import { api } from "@/integrations/api/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import { HardDrive, Cloud, Download, Globe, Server, Plus, Trash2, Edit2, CheckCircle, XCircle } from "lucide-react";

interface BackupSetting {
  id: string;
  setting_type: string;
  label: string;
  config: Record<string, string | boolean>;
  enabled: boolean;
  created_at: string;
}

const SETTING_TYPES = [
  { value: "cloud_storage", label: "Cópia interna (mesmo banco)", icon: Cloud, description: "Cópias de versão no próprio banco, para desfazer alterações" },
  { value: "google_drive", label: "Google Drive", icon: HardDrive, description: "Salvar backups no Google Drive" },
  { value: "manual_download", label: "Download Manual", icon: Download, description: "Botão para baixar backup como arquivo" },
  { value: "external_server", label: "Servidor Externo (URL)", icon: Globe, description: "Enviar backups via webhook/API" },
  { value: "university_server", label: "Servidor Universitário", icon: Server, description: "Servidor institucional com credenciais" },
];

export default function BackupSettings() {
  const [settings, setSettings] = useState<BackupSetting[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formType, setFormType] = useState("cloud_storage");
  const [formLabel, setFormLabel] = useState("");
  const [formConfig, setFormConfig] = useState<Record<string, string>>({});
  // Segredos já gravados no servidor (nunca voltam ao navegador).
  const [secretsSet, setSecretsSet] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => { loadSettings(); }, []);

  const loadSettings = async () => {
    const { data } = await api
      .from("backup_settings")
      .select("*")
      .order("created_at", { ascending: true });
    if (data) setSettings(data as unknown as BackupSetting[]);
    setLoading(false);
  };

  const openNew = () => {
    setEditingId(null);
    setFormType("cloud_storage");
    setFormLabel("");
    setFormConfig({});
    setSecretsSet({});
    setDialogOpen(true);
  };

  const openEdit = (s: BackupSetting) => {
    setEditingId(s.id);
    setFormType(s.setting_type);
    setFormLabel(s.label);
    const cfg: Record<string, string> = {};
    const set: Record<string, boolean> = {};
    for (const [k, v] of Object.entries(s.config || {})) {
      if (k.endsWith("__set")) set[k.replace(/__set$/, "")] = Boolean(v);
      else cfg[k] = String(v ?? "");
    }
    setFormConfig(cfg);
    setSecretsSet(set);
    setDialogOpen(true);
  };

  const save = async () => {
    if (!formLabel.trim()) {
      toast({ title: "Informe um nome para o destino", variant: "destructive" });
      return;
    }

    const payload = {
      setting_type: formType,
      label: formLabel.trim(),
      // Campo secreto vazio = manter o valor já gravado no servidor.
      config: formConfig,
    };

    if (editingId) {
      const { error } = await api
        .from("backup_settings")
        .update(payload as any)
        .eq("id", editingId);
      if (error) { toast({ title: "Erro", description: error.message, variant: "destructive" }); return; }
      toast({ title: "Destino atualizado" });
    } else {
      const { error } = await api
        .from("backup_settings")
        .insert(payload as any);
      if (error) { toast({ title: "Erro", description: error.message, variant: "destructive" }); return; }
      toast({ title: "Destino adicionado" });
    }
    setDialogOpen(false);
    await loadSettings();
  };

  const toggleEnabled = async (s: BackupSetting) => {
    await api
      .from("backup_settings")
      .update({ enabled: !s.enabled } as any)
      .eq("id", s.id);
    await loadSettings();
  };

  const deleteSetting = async (id: string) => {
    await api.from("backup_settings").delete().eq("id", id);
    toast({ title: "Destino removido" });
    await loadSettings();
  };

  const getTypeInfo = (type: string) => SETTING_TYPES.find(t => t.value === type) || SETTING_TYPES[0];

  const renderConfigFields = () => {
    switch (formType) {
      case "google_drive":
        return (
          <div className="space-y-3">
            <p className="text-xs text-amber-600">Envio automático ao Google Drive ainda não está implementado; use o backup diário em pasta sincronizada (ver documentação).</p>
            <div>
              <Label>Folder ID do Google Drive</Label>
              <Input placeholder="Ex: 1AbC..." value={formConfig.folder_id || ""} onChange={e => setFormConfig({ ...formConfig, folder_id: e.target.value })} />
            </div>
            <p className="text-xs text-muted-foreground">O Folder ID pode ser encontrado na URL da pasta do Google Drive.</p>
          </div>
        );
      case "external_server":
        return (
          <div className="space-y-3">
            <div>
              <Label>URL do Servidor / Webhook</Label>
              <Input placeholder="https://api.exemplo.com/backup" value={formConfig.url || ""} onChange={e => setFormConfig({ ...formConfig, url: e.target.value })} />
            </div>
            <div>
              <Label>Token de Autenticação (opcional)</Label>
              <Input type="password" autoComplete="off" placeholder={secretsSet.auth_token ? "•••••• (já configurado; deixe vazio para manter)" : "Bearer token..."} value={formConfig.auth_token || ""} onChange={e => setFormConfig({ ...formConfig, auth_token: e.target.value })} />
            </div>
          </div>
        );
      case "university_server":
        return (
          <div className="space-y-3">
            <div>
              <Label>Endereço do Servidor</Label>
              <Input placeholder="https://servidor.universidade.edu.br/backup" value={formConfig.server_url || ""} onChange={e => setFormConfig({ ...formConfig, server_url: e.target.value })} />
            </div>
            <div>
              <Label>Usuário</Label>
              <Input placeholder="usuario@universidade.edu.br" value={formConfig.username || ""} onChange={e => setFormConfig({ ...formConfig, username: e.target.value })} />
            </div>
            <div>
              <Label>Senha / Token de Acesso</Label>
              <Input type="password" autoComplete="off" placeholder={secretsSet.password ? "•••••• (já configurada; deixe vazio para manter)" : "••••••••"} value={formConfig.password || ""} onChange={e => setFormConfig({ ...formConfig, password: e.target.value })} />
            </div>
            <div>
              <Label>Diretório Remoto (opcional)</Label>
              <Input placeholder="/backups/lapoge/" value={formConfig.remote_path || ""} onChange={e => setFormConfig({ ...formConfig, remote_path: e.target.value })} />
            </div>
          </div>
        );
      case "cloud_storage":
        return (
          <p className="text-sm text-muted-foreground">As cópias de versão ficam no próprio banco (tela "Versões e Cópias"). Servem para desfazer alterações, mas <strong>não protegem contra perda do servidor</strong>: para isso existe o backup diário automático (pg_dump) configurado na instalação.</p>
        );
      case "manual_download":
        return (
          <p className="text-sm text-muted-foreground">Um botão de download será exibido na página de versões do banco, permitindo baixar os dados como arquivo JSON ou XLSX.</p>
        );
      default:
        return null;
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-32">
        <div className="h-6 w-6 rounded-full border-2 border-primary border-t-transparent animate-spin" />
      </div>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <HardDrive className="h-5 w-5 text-primary" />
              Destinos de Backup
            </CardTitle>
            <CardDescription>Configure onde os backups das versões serão armazenados</CardDescription>
          </div>
          <Button onClick={openNew} size="sm" className="gap-1.5">
            <Plus className="h-4 w-4" /> Adicionar Destino
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {settings.length === 0 && (
          <div className="text-center py-8 text-muted-foreground text-sm">
            Nenhum destino de backup configurado. Clique em "Adicionar Destino" para começar.
          </div>
        )}

        {settings.map(s => {
          const info = getTypeInfo(s.setting_type);
          const Icon = info.icon;
          return (
            <div key={s.id} className="flex items-center gap-3 p-3 rounded-lg border bg-card">
              <Icon className="h-5 w-5 text-muted-foreground shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-sm truncate">{s.label}</span>
                  <Badge variant="secondary" className="text-xs shrink-0">{info.label}</Badge>
                </div>
                {s.config?.server_url && (
                  <p className="text-xs text-muted-foreground truncate">{s.config.server_url}</p>
                )}
                {s.config?.url && (
                  <p className="text-xs text-muted-foreground truncate">{s.config.url}</p>
                )}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Switch checked={s.enabled} onCheckedChange={() => toggleEnabled(s)} />
                {s.enabled ? <CheckCircle className="h-4 w-4 text-primary" /> : <XCircle className="h-4 w-4 text-muted-foreground" />}
                <Button size="icon" variant="ghost" onClick={() => openEdit(s)}>
                  <Edit2 className="h-3.5 w-3.5" />
                </Button>
                <Button size="icon" variant="ghost" onClick={() => deleteSetting(s.id)}>
                  <Trash2 className="h-3.5 w-3.5 text-destructive" />
                </Button>
              </div>
            </div>
          );
        })}
      </CardContent>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingId ? "Editar Destino" : "Novo Destino de Backup"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Tipo de Destino</Label>
              <Select value={formType} onValueChange={v => { setFormType(v); setFormConfig({}); }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {SETTING_TYPES.map(t => (
                    <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Nome / Identificação</Label>
              <Input placeholder="Ex: Servidor LAPOGE - UFG" value={formLabel} onChange={e => setFormLabel(e.target.value)} />
            </div>
            {renderConfigFields()}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button onClick={save}>{editingId ? "Salvar" : "Adicionar"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
