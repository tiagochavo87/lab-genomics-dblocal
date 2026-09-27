import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { api, PASSWORD_MIN_LENGTH } from "@/integrations/api/client";
import { logActivity } from "@/lib/activityLog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import { User, Save, Building2, GraduationCap, UserCheck, KeyRound, LogOut } from "lucide-react";

const ROLE_OPTIONS = [
  "Iniciação Científica",
  "Mestrando",
  "Doutorando",
  "Pós-Doc",
  "Docente",
];

export default function SettingsPage() {
  const { user, profile, refreshProfile } = useAuth();
  const [fullName, setFullName] = useState("");
  const [role, setRole] = useState("");
  const [laboratory, setLaboratory] = useState("");
  const [institution, setInstitution] = useState("");
  const [program, setProgram] = useState("");
  const [advisor, setAdvisor] = useState("");
  const [saving, setSaving] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [changingPassword, setChangingPassword] = useState(false);

  const handleChangePassword = async () => {
    if (newPassword.length < PASSWORD_MIN_LENGTH) {
      toast({ title: `A nova senha precisa ter pelo menos ${PASSWORD_MIN_LENGTH} caracteres`, variant: "destructive" });
      return;
    }
    if (newPassword !== confirmPassword) {
      toast({ title: "As senhas não coincidem", variant: "destructive" });
      return;
    }
    setChangingPassword(true);
    const { error } = await api.auth.updateUser({ password: newPassword, currentPassword });
    setChangingPassword(false);
    if (error) {
      toast({ title: "Não foi possível trocar a senha", description: error.message, variant: "destructive" });
      return;
    }
    setCurrentPassword(""); setNewPassword(""); setConfirmPassword("");
    toast({ title: "Senha alterada", description: "As sessões abertas em outros computadores foram encerradas." });
  };

  const handleSignOutEverywhere = async () => {
    await api.auth.signOutEverywhere();
  };

  useEffect(() => {
    if (profile) {
      setFullName(profile.full_name || "");
      setRole(profile.role || "");
      setLaboratory(profile.laboratory || "");
      setInstitution((profile as any).institution || "");
      setProgram((profile as any).program || "");
      setAdvisor((profile as any).advisor || "");
    }
  }, [profile]);

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);

    const { error } = await api
      .from("profiles")
      .update({
        full_name: fullName.trim(),
        role,
        laboratory: laboratory.trim(),
        institution: institution.trim(),
        program: program.trim(),
        advisor: advisor.trim(),
      } as any)
      .eq("user_id", user.id);

    if (error) {
      toast({ title: "Erro ao salvar", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Perfil atualizado com sucesso" });
      // Atualiza o perfil em memória: sem isso "Meus Dados", o cabeçalho e a
      // própria tela continuavam mostrando os dados antigos até sair e entrar.
      await refreshProfile();
      await logActivity("profile_updated", "profile", user.id, { full_name: fullName.trim() });
    }
    setSaving(false);
  };

  return (
    <div className="p-6 space-y-6">
      <div>
        <h2 className="text-2xl font-bold font-display">Configurações</h2>
        <p className="text-sm text-muted-foreground">Gerencie seu perfil e configurações do sistema</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <User className="h-4 w-4 text-primary" />
            Meu Perfil
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="fullName">Nome completo</Label>
              <Input id="fullName" value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Seu nome completo" maxLength={100} />
            </div>

            <div className="space-y-2">
              <Label htmlFor="role">Nível Acadêmico</Label>
              <Select value={role} onValueChange={setRole}>
                <SelectTrigger id="role">
                  <SelectValue placeholder="Selecione seu nível" />
                </SelectTrigger>
                <SelectContent>
                  {ROLE_OPTIONS.map((opt) => (
                    <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="institution" className="flex items-center gap-1.5">
                <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
                Instituição de Vínculo
              </Label>
              <Input id="institution" value={institution} onChange={(e) => setInstitution(e.target.value)} placeholder="Ex: UFSC, USP, UNICAMP" maxLength={150} />
            </div>

            <div className="space-y-2">
              <Label htmlFor="program" className="flex items-center gap-1.5">
                <GraduationCap className="h-3.5 w-3.5 text-muted-foreground" />
                Programa de Pós-Graduação
              </Label>
              <Input id="program" value={program} onChange={(e) => setProgram(e.target.value)} placeholder="Ex: PPG em Genética" maxLength={200} />
            </div>

            <div className="space-y-2">
              <Label htmlFor="advisor" className="flex items-center gap-1.5">
                <UserCheck className="h-3.5 w-3.5 text-muted-foreground" />
                Orientador(a)
              </Label>
              <Input id="advisor" value={advisor} onChange={(e) => setAdvisor(e.target.value)} placeholder="Nome do(a) orientador(a)" maxLength={100} />
            </div>

            <div className="space-y-2">
              <Label htmlFor="laboratory">Laboratório</Label>
              <Input id="laboratory" value={laboratory} onChange={(e) => setLaboratory(e.target.value)} placeholder="Ex: LAPOGE" maxLength={100} />
            </div>
          </div>

          <Button onClick={handleSave} disabled={saving} className="gap-2">
            <Save className="h-4 w-4" />
            {saving ? "Salvando..." : "Salvar Perfil"}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <KeyRound className="h-4 w-4 text-primary" />
            Segurança da conta
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="current-password">Senha atual</Label>
              <Input id="current-password" type="password" autoComplete="current-password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="new-password">Nova senha</Label>
              <Input id="new-password" type="password" autoComplete="new-password" placeholder={`Mínimo ${PASSWORD_MIN_LENGTH} caracteres`} value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirm-password">Confirmar nova senha</Label>
              <Input id="confirm-password" type="password" autoComplete="new-password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} />
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button onClick={handleChangePassword} disabled={changingPassword || !currentPassword || !newPassword} className="gap-2">
              <KeyRound className="h-4 w-4" />
              {changingPassword ? "Alterando..." : "Alterar senha"}
            </Button>
            <Button variant="outline" onClick={handleSignOutEverywhere} className="gap-2">
              <LogOut className="h-4 w-4" />
              Sair de todos os computadores
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Sobre o Sistema</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Aplicação</span>
            <span className="font-medium">DBLAPOGE</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Versão do Sistema</span>
            <Badge variant="secondary">2.1.0</Badge>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Laboratório</span>
            <span className="font-medium">LAPOGE - Laboratório de Polimorfismos Genéticos</span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
