import { useState, useEffect } from "react";
import { api, PASSWORD_MIN_LENGTH } from "@/integrations/api/client";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Lock, AlertCircle, CheckCircle } from "lucide-react";
import logo from "@/assets/logo-lapoge.png";

export default function ResetPasswordPage() {
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);
  const [isRecovery, setIsRecovery] = useState(false);

  useEffect(() => {
    // Check for recovery event
    const { data: { subscription } } = api.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") {
        setIsRecovery(true);
      }
    });

    // Also check URL hash
    const hash = window.location.hash;
    const search = window.location.search;
    if (hash.includes("type=recovery") || hash.includes("token=") || search.includes("token=") || search.includes("reset_token=")) {
      setIsRecovery(true);
    }

    return () => subscription.unsubscribe();
  }, []);

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(""); setSuccess("");

    if (password.length < PASSWORD_MIN_LENGTH) {
      setError(`A senha deve ter pelo menos ${PASSWORD_MIN_LENGTH} caracteres.`);
      return;
    }
    if (password !== confirmPassword) {
      setError("As senhas não coincidem.");
      return;
    }

    setLoading(true);
    const { error } = await api.auth.updateUser({ password });
    if (error) {
      setError(error.message);
    } else {
      setSuccess("Senha atualizada com sucesso! Redirecionando...");
      setTimeout(() => navigate("/login"), 2000);
    }
    setLoading(false);
  };

  if (!isRecovery) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[hsl(220,35%,14%)] via-[hsl(220,30%,18%)] to-[hsl(210,40%,12%)]">
        <Card className="w-full max-w-md border-0 shadow-2xl bg-card/95 backdrop-blur-sm">
          <CardContent className="pt-8 pb-8 px-8 text-center">
            <img src={logo} alt="LAPOGE" className="h-10 mx-auto mb-4" />
            <h2 className="text-xl font-bold font-display mb-2">Link Inválido</h2>
            <p className="text-sm text-muted-foreground mb-4">
              Este link de recuperação é inválido ou expirou.
            </p>
            <Button onClick={() => navigate("/login")} className="w-full">Voltar ao Login</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[hsl(220,35%,14%)] via-[hsl(220,30%,18%)] to-[hsl(210,40%,12%)]">
      <Card className="w-full max-w-md border-0 shadow-2xl bg-card/95 backdrop-blur-sm">
        <CardContent className="pt-8 pb-8 px-8">
          <div className="flex flex-col items-center mb-6">
            <img src={logo} alt="LAPOGE" className="h-10 mb-3" />
            <h2 className="text-2xl font-bold font-display">Nova Senha</h2>
            <p className="text-sm text-muted-foreground mt-1">Defina sua nova senha de acesso</p>
          </div>

          {error && (
            <div className="mb-4 flex items-center gap-2 rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
              <AlertCircle className="h-4 w-4 shrink-0" /> {error}
            </div>
          )}
          {success && (
            <div className="mb-4 flex items-center gap-2 rounded-lg bg-[hsl(150,60%,40%)]/10 p-3 text-sm text-[hsl(150,60%,35%)]">
              <CheckCircle className="h-4 w-4 shrink-0" /> {success}
            </div>
          )}

          <form onSubmit={handleReset} className="space-y-4">
            <div className="space-y-2">
              <Label className="text-sm font-medium">Nova senha</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input type="password" placeholder={`Mínimo ${PASSWORD_MIN_LENGTH} caracteres`} value={password} onChange={(e) => setPassword(e.target.value)} className="pl-10 h-11" required />
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-medium">Confirmar nova senha</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input type="password" placeholder="Repita a nova senha" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} className="pl-10 h-11" required />
              </div>
            </div>
            <Button type="submit" className="w-full h-11 font-medium text-sm" disabled={loading}>
              {loading ? "Atualizando..." : "Redefinir Senha"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
