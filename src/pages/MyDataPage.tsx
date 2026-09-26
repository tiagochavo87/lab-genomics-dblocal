import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { api } from "@/integrations/api/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";
import { Download, Trash2, Shield, User, FileJson, AlertTriangle } from "lucide-react";
import { logActivity } from "@/lib/activityLog";

export default function MyDataPage() {
  const { user, profile, signOut } = useAuth();
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const handleExportData = async () => {
    if (!user || !profile) return;

    // Gather all user data
    const [activityRes, rolesRes] = await Promise.all([
      api.from("activity_log").select("*").eq("user_id", user.id).order("created_at", { ascending: false }).limit(100),
      api.from("user_roles").select("*").eq("user_id", user.id),
    ]);

    const exportPayload = {
      exported_at: new Date().toISOString(),
      lgpd_reference: "Art. 18, II - Direito de acesso aos dados",
      personal_data: {
        email: user.email,
        full_name: profile.full_name,
        institution: profile.institution,
        program: profile.program,
        advisor: profile.advisor,
        laboratory: profile.laboratory,
        role: profile.role,
        approved: profile.approved,
        created_at: (profile as any).created_at,
      },
      system_roles: rolesRes.data || [],
      activity_log: activityRes.data || [],
    };

    const blob = new Blob([JSON.stringify(exportPayload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `meus_dados_dblapoge_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);

    await logActivity("personal_data_exported", "profile", user.id, { lgpd: true });
    toast({ title: "Dados exportados com sucesso" });
  };

  const handleDeleteRequest = async () => {
    if (!user) return;
    setDeleting(true);

    // Log the deletion request
    await logActivity("account_deletion_requested", "profile", user.id, {
      lgpd: true,
      reference: "Art. 18, VI - Direito de eliminação",
      email: user.email,
    });

    toast({
      title: "Solicitação registrada",
      description: "Sua solicitação de exclusão foi registrada. O administrador processará em até 30 dias conforme a LGPD.",
    });

    setDeleteOpen(false);
    setDeleting(false);
  };

  return (
    <div className="p-6 space-y-6 max-w-3xl mx-auto">
      <div>
        <h2 className="text-2xl font-bold font-display flex items-center gap-2">
          <Shield className="h-6 w-6 text-primary" />
          Meus Dados
        </h2>
        <p className="text-sm text-muted-foreground">
          Gerencie seus dados pessoais conforme a LGPD (Lei 13.709/2018, Art. 18)
        </p>
      </div>

      {/* Current data summary */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <User className="h-4 w-4 text-primary" />
            Dados Pessoais Armazenados
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <span className="text-muted-foreground">Nome:</span>
              <span className="ml-2 font-medium">{profile?.full_name || "—"}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Email:</span>
              <span className="ml-2 font-medium">{user?.email || "—"}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Instituição:</span>
              <span className="ml-2 font-medium">{profile?.institution || "—"}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Programa:</span>
              <span className="ml-2 font-medium">{profile?.program || "—"}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Orientador:</span>
              <span className="ml-2 font-medium">{profile?.advisor || "—"}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Laboratório:</span>
              <span className="ml-2 font-medium">{profile?.laboratory || "—"}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Nível:</span>
              <span className="ml-2 font-medium">{profile?.role || "—"}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Status:</span>
              <Badge variant={profile?.approved ? "default" : "secondary"} className="ml-2">
                {profile?.approved ? "Aprovado" : "Pendente"}
              </Badge>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Actions */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Card className="cursor-pointer hover:border-primary/50 transition-colors" onClick={handleExportData}>
          <CardContent className="flex items-center gap-4 py-6">
            <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <FileJson className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="font-medium text-sm">Exportar Meus Dados</p>
              <p className="text-xs text-muted-foreground">Baixar todos os dados pessoais em JSON (Art. 18, V)</p>
            </div>
            <Download className="h-4 w-4 text-muted-foreground ml-auto" />
          </CardContent>
        </Card>

        <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
          <DialogTrigger asChild>
            <Card className="cursor-pointer hover:border-destructive/50 transition-colors">
              <CardContent className="flex items-center gap-4 py-6">
                <div className="h-10 w-10 rounded-lg bg-destructive/10 flex items-center justify-center">
                  <Trash2 className="h-5 w-5 text-destructive" />
                </div>
                <div>
                  <p className="font-medium text-sm">Solicitar Exclusão</p>
                  <p className="text-xs text-muted-foreground">Solicitar remoção da conta e dados (Art. 18, VI)</p>
                </div>
              </CardContent>
            </Card>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-destructive" />
                Solicitar Exclusão de Dados
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4 text-sm">
              <p>
                Conforme a LGPD (Art. 18, VI), você tem o direito de solicitar a eliminação dos seus dados pessoais.
              </p>
              <div className="rounded-lg bg-destructive/5 border border-destructive/20 p-3 space-y-2">
                <p className="font-medium text-destructive">Atenção:</p>
                <ul className="list-disc ml-4 space-y-1 text-muted-foreground">
                  <li>A solicitação será processada pelo administrador em até 30 dias.</li>
                  <li>Dados necessários para cumprimento de obrigação legal poderão ser retidos.</li>
                  <li>Após a exclusão, o acesso ao sistema será permanentemente removido.</li>
                </ul>
              </div>
              <div className="flex gap-3 justify-end">
                <Button variant="outline" onClick={() => setDeleteOpen(false)}>Cancelar</Button>
                <Button variant="destructive" onClick={handleDeleteRequest} disabled={deleting}>
                  {deleting ? "Enviando..." : "Confirmar Solicitação"}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardContent className="py-4 text-xs text-muted-foreground">
          <p>
            Para mais informações sobre como seus dados são tratados, consulte a{" "}
            <a href="/privacy" className="text-primary hover:underline">Política de Privacidade</a>.
            Em caso de dúvidas, entre em contato com o administrador do sistema.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
