import { useState, useEffect } from "react";
import { api } from "@/integrations/api/client";
import { useAuth } from "@/contexts/AuthContext";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "@/hooks/use-toast";
import { CheckCircle, XCircle, Shield, ShieldAlert, Users, UserCheck, UserX, Eye, Clock, Building2, GraduationCap, UserCheck as UserCheckIcon, FlaskConical, History, HardDrive } from "lucide-react";
import { logActivity } from "@/lib/activityLog";
import BackupSettings from "@/components/BackupSettings";

interface UserProfile {
  id: string;
  user_id: string;
  full_name: string;
  role: string;
  laboratory: string;
  institution: string;
  program: string;
  advisor: string;
  approved: boolean;
  created_at: string;
}

interface UserRole {
  user_id: string;
  role: "admin" | "moderator" | "user";
}

interface ActivityEntry {
  id: string;
  user_name: string;
  action: string;
  entity_type: string;
  entity_id: string | null;
  details: Record<string, unknown>;
  created_at: string;
  source?: "server" | "client";
  ip?: string | null;
}

export default function AdminPage() {
  const { user } = useAuth();
  const [profiles, setProfiles] = useState<UserProfile[]>([]);
  const [userRoles, setUserRoles] = useState<UserRole[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [selectedProfile, setSelectedProfile] = useState<UserProfile | null>(null);
  const [activityLog, setActivityLog] = useState<ActivityEntry[]>([]);

  useEffect(() => { checkAdminAndLoad(); }, [user]);

  const checkAdminAndLoad = async () => {
    if (!user) return;
    const { data: roleData } = await api
      .from("user_roles").select("*").eq("user_id", user.id).eq("role", "admin");
    if (!roleData || roleData.length === 0) { setIsAdmin(false); setLoading(false); return; }
    setIsAdmin(true);
    await loadData();
    setLoading(false);
  };

  const loadData = async () => {
    const [profilesRes, rolesRes, logRes] = await Promise.all([
      api.from("profiles").select("*").order("created_at", { ascending: false }),
      api.from("user_roles").select("*"),
      api.from("activity_log").select("*").order("created_at", { ascending: false }).limit(200),
    ]);
    if (profilesRes.data) setProfiles(profilesRes.data as UserProfile[]);
    if (rolesRes.data) setUserRoles(rolesRes.data as UserRole[]);
    if (logRes.data) setActivityLog(logRes.data as ActivityEntry[]);
  };

  const toggleApproval = async (profile: UserProfile) => {
    const { error } = await api
      .from("profiles").update({ approved: !profile.approved }).eq("id", profile.id);
    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    } else {
      toast({ title: profile.approved ? "Usuário desaprovado" : "Usuário aprovado" });
      await logActivity(
        profile.approved ? "user_revoked" : "user_approved",
        "user", profile.user_id,
        { user_name: profile.full_name }
      );
      await loadData();
    }
  };

  const setRole = async (userId: string, role: "admin" | "moderator" | "user") => {
    // Atualização atômica (antes: apagar + inserir, que podia deixar o usuário sem papel).
    const { error } = await api.from("user_roles").update({ role }).eq("user_id", userId);
    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Permissão atualizada" });
      const p = profiles.find(p => p.user_id === userId);
      await logActivity("role_changed", "user", userId, { user_name: p?.full_name, new_role: role });
      await loadData();
    }
  };

  const getUserRole = (userId: string) => userRoles.find((r) => r.user_id === userId)?.role || "user";

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="h-8 w-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] gap-4">
        <ShieldAlert className="h-16 w-16 text-destructive/60" />
        <h2 className="text-xl font-semibold text-foreground">Acesso Restrito</h2>
        <p className="text-muted-foreground text-sm">Você não tem permissão para acessar esta página.</p>
      </div>
    );
  }

  const approvedCount = profiles.filter((p) => p.approved).length;
  const pendingCount = profiles.filter((p) => !p.approved).length;

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground font-display">Administração</h1>
        <p className="text-sm text-muted-foreground">Gerencie usuários e permissões de acesso</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total de Usuários</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent><div className="text-2xl font-bold text-foreground">{profiles.length}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Aprovados</CardTitle>
            <UserCheck className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent><div className="text-2xl font-bold text-primary">{approvedCount}</div></CardContent>
        </Card>
        <Card className={pendingCount > 0 ? "border-[hsl(40,92%,50%)]/50 bg-[hsl(40,92%,50%)]/5" : ""}>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Pendentes {pendingCount > 0 && <Badge variant="destructive" className="ml-2 text-xs">{pendingCount} novo(s)</Badge>}
            </CardTitle>
            <UserX className="h-4 w-4 text-destructive" />
          </CardHeader>
          <CardContent><div className="text-2xl font-bold text-destructive">{pendingCount}</div></CardContent>
        </Card>
      </div>

      <Tabs defaultValue="users" className="space-y-4">
        <TabsList>
          <TabsTrigger value="users" className="gap-2"><Users className="h-4 w-4" /> Usuários</TabsTrigger>
          <TabsTrigger value="backup" className="gap-2"><HardDrive className="h-4 w-4" /> Backup</TabsTrigger>
          <TabsTrigger value="activity" className="gap-2"><History className="h-4 w-4" /> Log de Atividades</TabsTrigger>
        </TabsList>

        <TabsContent value="users">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Shield className="h-5 w-5 text-primary" />
                Gerenciamento de Usuários
              </CardTitle>
              <CardDescription>Aprove cadastros e defina níveis de permissão</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nome</TableHead>
                    <TableHead>Nível Acadêmico</TableHead>
                    <TableHead>Instituição</TableHead>
                    <TableHead>Laboratório</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Permissão</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {profiles.map((profile) => (
                    <TableRow key={profile.id} className={!profile.approved ? "bg-[hsl(40,92%,50%)]/5" : ""}>
                      <TableCell>
                        <button className="font-medium hover:text-primary hover:underline text-left" onClick={() => setSelectedProfile(profile)}>
                          {profile.full_name || "Sem nome"}
                        </button>
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">{profile.role}</TableCell>
                      <TableCell className="text-muted-foreground text-sm">{(profile as any).institution || "—"}</TableCell>
                      <TableCell className="text-muted-foreground text-sm">{profile.laboratory}</TableCell>
                      <TableCell>
                        <Badge variant={profile.approved ? "default" : "destructive"} className="text-xs">
                          {profile.approved ? "Aprovado" : "Pendente"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Select
                          value={getUserRole(profile.user_id)}
                          onValueChange={(val) => setRole(profile.user_id, val as "admin" | "moderator" | "user")}
                          disabled={profile.user_id === user?.id}
                        >
                          <SelectTrigger className="w-[130px] h-8 text-xs"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="user">Usuário</SelectItem>
                            <SelectItem value="moderator">Moderador</SelectItem>
                            <SelectItem value="admin">Admin</SelectItem>
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button size="sm" variant="ghost" onClick={() => setSelectedProfile(profile)} className="gap-1">
                            <Eye className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            size="sm"
                            variant={profile.approved ? "outline" : "default"}
                            onClick={() => toggleApproval(profile)}
                            disabled={profile.user_id === user?.id}
                            className="gap-1.5"
                          >
                            {profile.approved ? <><XCircle className="h-3.5 w-3.5" /> Revogar</> : <><CheckCircle className="h-3.5 w-3.5" /> Aprovar</>}
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                  {profiles.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center text-muted-foreground py-8">Nenhum usuário cadastrado</TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="backup">
          <BackupSettings />
        </TabsContent>

        <TabsContent value="activity">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <History className="h-5 w-5 text-primary" />
                Registro de Atividades
              </CardTitle>
              <CardDescription>Últimas 200 ações. "Servidor" = registrado pela API (confiável); "Navegador" = enviado pela interface.</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Data/Hora</TableHead>
                    <TableHead>Usuário</TableHead>
                    <TableHead>Ação</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Origem</TableHead>
                    <TableHead>Detalhes</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {activityLog.map((entry) => (
                    <TableRow key={entry.id}>
                      <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                        {new Date(entry.created_at).toLocaleString("pt-BR")}
                      </TableCell>
                      <TableCell className="text-sm font-medium">{entry.user_name || "—"}</TableCell>
                      <TableCell>
                        <Badge variant="secondary" className="text-xs">{formatAction(entry.action)}</Badge>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">{entry.entity_type}</TableCell>
                      <TableCell>
                        <Badge variant={entry.source === "server" ? "default" : "outline"} className="text-[10px]">
                          {entry.source === "server" ? "Servidor" : "Navegador"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground max-w-[260px] truncate" title={JSON.stringify(entry.details || {})}>
                        {Object.entries(entry.details || {}).map(([k, v]) => `${k}: ${typeof v === "object" ? JSON.stringify(v) : v}`).join(", ") || "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                  {activityLog.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-muted-foreground py-8">Nenhuma atividade registrada</TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Profile detail dialog */}
      <Dialog open={!!selectedProfile} onOpenChange={(open) => !open && setSelectedProfile(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Users className="h-5 w-5 text-primary" />
              Detalhes do Usuário
            </DialogTitle>
          </DialogHeader>
          {selectedProfile && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <DetailItem icon={<UserCheckIcon className="h-4 w-4" />} label="Nome" value={selectedProfile.full_name} />
                <DetailItem icon={<GraduationCap className="h-4 w-4" />} label="Nível Acadêmico" value={selectedProfile.role} />
                <DetailItem icon={<Building2 className="h-4 w-4" />} label="Instituição" value={(selectedProfile as any).institution || "—"} />
                <DetailItem icon={<GraduationCap className="h-4 w-4" />} label="Programa" value={(selectedProfile as any).program || "—"} />
                <DetailItem icon={<UserCheckIcon className="h-4 w-4" />} label="Orientador(a)" value={(selectedProfile as any).advisor || "—"} />
                <DetailItem icon={<FlaskConical className="h-4 w-4" />} label="Laboratório" value={selectedProfile.laboratory} />
                <DetailItem icon={<Clock className="h-4 w-4" />} label="Cadastro" value={new Date(selectedProfile.created_at).toLocaleDateString("pt-BR")} />
                <div className="space-y-1">
                  <span className="text-xs text-muted-foreground">Status</span>
                  <div>
                    <Badge variant={selectedProfile.approved ? "default" : "destructive"}>
                      {selectedProfile.approved ? "Aprovado" : "Pendente"}
                    </Badge>
                  </div>
                </div>
              </div>
              <div className="flex gap-2 pt-2">
                <Button
                  variant={selectedProfile.approved ? "outline" : "default"}
                  onClick={() => { toggleApproval(selectedProfile); setSelectedProfile(null); }}
                  disabled={selectedProfile.user_id === user?.id}
                  className="gap-1.5 flex-1"
                >
                  {selectedProfile.approved ? <><XCircle className="h-4 w-4" /> Revogar Acesso</> : <><CheckCircle className="h-4 w-4" /> Aprovar Acesso</>}
                </Button>
                <Button
                  variant="outline"
                  onClick={async () => {
                    const { error } = await api.admin.revokeSessions(selectedProfile.user_id);
                    toast(error
                      ? { title: "Erro", description: error.message, variant: "destructive" }
                      : { title: "Sessões encerradas", description: "O usuário precisará entrar de novo em todos os computadores." });
                  }}
                  className="gap-1.5 flex-1"
                >
                  Encerrar sessões
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function DetailItem({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">{icon}{label}</div>
      <p className="text-sm font-medium">{value || "—"}</p>
    </div>
  );
}

function formatAction(action: string): string {
  const map: Record<string, string> = {
    user_approved: "Usuário aprovado",
    user_revoked: "Acesso revogado",
    role_changed: "Permissão alterada",
    database_created: "Banco criado",
    database_deleted: "Banco excluído",
    version_created: "Versão criada",
    variable_added: "Variável adicionada",
    variable_deleted: "Variável excluída",
    profile_updated: "Perfil atualizado",
    data_exported: "Dados exportados",
    login: "Login",
    login_failed: "Falha de login",
    user_registered: "Cadastro",
    password_changed: "Senha alterada",
    password_reset_requested: "Pedido de nova senha",
    password_reset_completed: "Senha redefinida",
    logout_all_sessions: "Saiu de todos os PCs",
    sessions_revoked_by_admin: "Sessões encerradas (admin)",
    sensitive_data_view: "Visualizou dados sensíveis",
    sensitive_data_export: "Exportou dados sensíveis",
    backup_created: "Cópia criada",
    backup_restored: "Cópia restaurada",
    backup_sent: "Enviado a destinos",
    disease_databases_insert: "Banco criado",
    disease_databases_update: "Banco alterado",
    disease_databases_delete: "Banco excluído",
    database_versions_insert: "Versão criada",
    database_versions_update: "Versão alterada",
    database_versions_delete: "Versão excluída",
    database_variables_insert: "Variáveis criadas",
    database_variables_update: "Variável alterada",
    database_variables_delete: "Variável excluída",
    profiles_update: "Perfil alterado",
    user_roles_update: "Permissão alterada",
    backup_settings_insert: "Destino de backup criado",
    backup_settings_update: "Destino de backup alterado",
    backup_settings_delete: "Destino de backup removido",
  };
  return map[action] || action;
}
