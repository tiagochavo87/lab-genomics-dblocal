import { useState } from "react";
import { Dna, Shield } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { useAuth } from "@/contexts/AuthContext";
import { api, PASSWORD_MIN_LENGTH } from "@/integrations/api/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Lock, Mail, AlertCircle, User, FlaskConical, CheckCircle, Building2, GraduationCap, UserCheck } from "lucide-react";
import logo from "@/assets/logo-lapoge.png";

const ROLE_OPTIONS = [
  "Iniciação Científica",
  "Mestrando",
  "Doutorando",
  "Pós-Doc",
  "Docente",
];

export default function LoginPage() {
  const { signIn } = useAuth();
  const [mode, setMode] = useState<"login" | "signup" | "forgot">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [laboratory, setLaboratory] = useState("LAPOGE");
  const [role, setRole] = useState("");
  const [institution, setInstitution] = useState("");
  const [lgpdConsent, setLgpdConsent] = useState(false);
  const [program, setProgram] = useState("");
  const [advisor, setAdvisor] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);

  const resetForm = () => {
    setEmail(""); setPassword(""); setFullName(""); setLaboratory("LAPOGE");
    setRole(""); setInstitution(""); setProgram(""); setAdvisor("");
    setError(""); setSuccess(""); setLgpdConsent(false);
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    const { error } = await signIn(email, password);
    if (error) setError("Credenciais inválidas. Verifique seu email e senha.");
    setLoading(false);
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(""); setSuccess("");
    if (!email.trim()) { setError("Informe seu email."); return; }
    setLoading(true);
    const { error } = await api.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    if (error) { setError(error.message); }
    else {
      setSuccess("Se este email estiver cadastrado, você receberá as instruções de recuperação em breve.");
    }
    setLoading(false);
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(""); setSuccess("");
    if (!fullName.trim() || !role || !institution.trim()) {
      setError("Preencha todos os campos obrigatórios.");
      return;
    }
    if (!lgpdConsent) {
      setError("Você precisa aceitar a Política de Privacidade e os Termos de Uso para se cadastrar.");
      return;
    }
    if (password.length < PASSWORD_MIN_LENGTH) {
      setError(`A senha deve ter pelo menos ${PASSWORD_MIN_LENGTH} caracteres.`);
      return;
    }

    setLoading(true);
    const { error } = await api.auth.signUp({
      email, password,
      options: {
        data: {
          full_name: fullName.trim(),
          role,
          laboratory: laboratory.trim(),
          institution: institution.trim(),
          program: program.trim(),
          advisor: advisor.trim(),
        },
      },
    });

    if (error) { setError(error.message); setLoading(false); return; }

    setSuccess("Cadastro realizado! Aguarde a aprovação do administrador para acessar o sistema.");
    setLoading(false);
  };

  return (
    <div className="min-h-screen flex relative overflow-hidden bg-gradient-to-br from-[hsl(220,35%,14%)] via-[hsl(220,30%,18%)] to-[hsl(210,40%,12%)]">
      {/* Decorative elements */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-[10%] left-[5%] w-3 h-3 rounded-full bg-[hsl(175,65%,50%)] animate-pulse-glow" />
        <div className="absolute top-[25%] left-[12%] w-2 h-2 rounded-full bg-[hsl(210,80%,55%)] animate-pulse-glow" style={{ animationDelay: "0.5s" }} />
        <div className="absolute top-[45%] left-[8%] w-4 h-4 rounded-full bg-[hsl(260,50%,55%)] animate-pulse-glow" style={{ animationDelay: "1s" }} />
        <div className="absolute top-[65%] right-[10%] w-3 h-3 rounded-full bg-[hsl(175,65%,50%)] animate-pulse-glow" style={{ animationDelay: "1.5s" }} />
        <div className="absolute top-[80%] right-[20%] w-2 h-2 rounded-full bg-[hsl(340,65%,55%)] animate-pulse-glow" style={{ animationDelay: "2s" }} />
        <div className="absolute bottom-[15%] left-[15%] w-3 h-3 rounded-full bg-[hsl(210,80%,55%)] animate-pulse-glow" style={{ animationDelay: "0.8s" }} />
        <div className="absolute inset-0 opacity-[0.03]" style={{
          backgroundImage: "radial-gradient(circle at 1px 1px, white 1px, transparent 0)",
          backgroundSize: "40px 40px"
        }} />
      </div>

      {/* Left panel - branding */}
      <div className="hidden lg:flex lg:w-1/2 flex-col items-center justify-center p-12 relative">
        <div className="animate-helix-float">
          <Dna className="w-24 h-24 text-[hsl(175,65%,50%)] mb-8 opacity-80" strokeWidth={1.2} />
        </div>
        <img src={logo} alt="LAPOGE" className="h-16 mb-6 opacity-90" />
        <h1 className="text-4xl font-bold font-display tracking-tight text-[hsl(0,0%,95%)] mb-3">
          DBLAPOGE
        </h1>
        <p className="text-lg text-[hsl(220,15%,65%)] text-center max-w-md leading-relaxed">
          Sistema de Gerenciamento de Banco de Dados Clínico e Laboratorial em Genética Humana
        </p>
        <div className="mt-10 flex gap-6 text-[hsl(220,15%,50%)] text-xs uppercase tracking-widest">
          <span>Genômica</span>
          <span>•</span>
          <span>Imunologia</span>
          <span>•</span>
          <span>Epidemiologia</span>
        </div>
      </div>

      {/* Right panel - form */}
      <div className="flex-1 flex items-center justify-center p-6 lg:p-12">
        <Card className="w-full max-w-md border-0 shadow-2xl bg-card/95 backdrop-blur-sm">
          <CardContent className="pt-8 pb-8 px-8">
            <div className="lg:hidden flex flex-col items-center mb-8">
              <img src={logo} alt="LAPOGE" className="h-10 mb-3" />
              <h2 className="text-xl font-bold font-display">DBLAPOGE</h2>
            </div>

            <div className="mb-6">
              <h2 className="text-2xl font-bold font-display tracking-tight">
                {mode === "login" ? "Acesso ao Sistema" : mode === "signup" ? "Novo Usuário" : "Recuperar Senha"}
              </h2>
              <p className="text-sm text-muted-foreground mt-1">
                {mode === "login"
                  ? "Insira suas credenciais para acessar o banco de dados"
                  : mode === "signup"
                  ? "Preencha seus dados para solicitar acesso ao sistema"
                  : "Informe seu email para receber o link de recuperação"}
              </p>
            </div>

            {error && (
              <div className="mb-4 flex items-center gap-2 rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
                <AlertCircle className="h-4 w-4 shrink-0" />
                {error}
              </div>
            )}

            {success && (
              <div className="mb-4 flex items-center gap-2 rounded-lg bg-[hsl(150,60%,40%)]/10 p-3 text-sm text-[hsl(150,60%,35%)]">
                <CheckCircle className="h-4 w-4 shrink-0" />
                {success}
              </div>
            )}

            {mode === "login" ? (
              <form onSubmit={handleLogin} className="space-y-5">
                <div className="space-y-2">
                  <Label htmlFor="email" className="text-sm font-medium">Email</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input id="email" type="email" placeholder="seu@email.com" value={email} onChange={(e) => setEmail(e.target.value)} className="pl-10 h-11" required />
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="password" className="text-sm font-medium">Senha</Label>
                    <button type="button" className="text-xs text-primary hover:underline" onClick={() => { setMode("forgot"); resetForm(); }}>
                      Esqueci minha senha
                    </button>
                  </div>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input id="password" type="password" placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)} className="pl-10 h-11" required />
                  </div>
                </div>
                <Button type="submit" className="w-full h-11 font-medium text-sm" disabled={loading}>
                  {loading ? "Verificando..." : "Entrar no Sistema"}
                </Button>
              </form>
            ) : mode === "forgot" ? (
              <form onSubmit={handleForgotPassword} className="space-y-5">
                <div className="space-y-2">
                  <Label htmlFor="forgot-email" className="text-sm font-medium">Email</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input id="forgot-email" type="email" placeholder="seu@email.com" value={email} onChange={(e) => setEmail(e.target.value)} className="pl-10 h-11" required />
                  </div>
                </div>
                <Button type="submit" className="w-full h-11 font-medium text-sm" disabled={loading}>
                  {loading ? "Enviando..." : "Enviar Link de Recuperação"}
                </Button>
              </form>
            ) : (
              <form onSubmit={handleSignup} className="space-y-4">
                <div className="space-y-2">
                  <Label className="text-sm font-medium">Nome completo *</Label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input type="text" placeholder="Seu nome completo" value={fullName} onChange={(e) => setFullName(e.target.value)} className="pl-10 h-11" required />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label className="text-sm font-medium">Email *</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input type="email" placeholder="seu@email.com" value={email} onChange={(e) => setEmail(e.target.value)} className="pl-10 h-11" required />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label className="text-sm font-medium">Senha *</Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input type="password" placeholder={`Mínimo ${PASSWORD_MIN_LENGTH} caracteres`} value={password} onChange={(e) => setPassword(e.target.value)} className="pl-10 h-11" required />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label className="text-sm font-medium">Instituição de Vínculo *</Label>
                  <div className="relative">
                    <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input type="text" placeholder="Ex: UFSC, USP" value={institution} onChange={(e) => setInstitution(e.target.value)} className="pl-10 h-11" required />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label className="text-sm font-medium">Programa de Pós-Graduação</Label>
                  <div className="relative">
                    <GraduationCap className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input type="text" placeholder="Ex: PPG em Genética" value={program} onChange={(e) => setProgram(e.target.value)} className="pl-10 h-11" />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label className="text-sm font-medium">Orientador(a)</Label>
                  <div className="relative">
                    <UserCheck className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input type="text" placeholder="Nome do(a) orientador(a)" value={advisor} onChange={(e) => setAdvisor(e.target.value)} className="pl-10 h-11" />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label className="text-sm font-medium">Nível acadêmico *</Label>
                  <Select value={role} onValueChange={setRole}>
                    <SelectTrigger className="h-11">
                      <SelectValue placeholder="Selecione seu nível" />
                    </SelectTrigger>
                    <SelectContent>
                      {ROLE_OPTIONS.map((r) => (
                        <SelectItem key={r} value={r}>{r}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label className="text-sm font-medium">Laboratório</Label>
                  <div className="relative">
                    <FlaskConical className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input type="text" placeholder="LAPOGE" value={laboratory} onChange={(e) => setLaboratory(e.target.value)} className="pl-10 h-11" />
                  </div>
                </div>
                <div className="flex items-start gap-2 pt-1">
                  <Checkbox
                    id="lgpd-consent"
                    checked={lgpdConsent}
                    onCheckedChange={(checked) => setLgpdConsent(checked === true)}
                    className="mt-0.5"
                  />
                  <label htmlFor="lgpd-consent" className="text-xs text-muted-foreground leading-relaxed cursor-pointer">
                    <Shield className="inline h-3 w-3 mr-1 text-primary" />
                    Li e aceito a{" "}
                    <a href="/privacy" target="_blank" className="text-primary hover:underline font-medium">
                      Política de Privacidade
                    </a>{" "}
                    e os Termos de Uso, incluindo o tratamento de dados pessoais sensíveis conforme a LGPD (Lei 13.709/2018).
                  </label>
                </div>
                <Button type="submit" className="w-full h-11 font-medium text-sm" disabled={loading || !lgpdConsent}>
                  {loading ? "Cadastrando..." : "Solicitar Cadastro"}
                </Button>
              </form>
            )}

            <div className="mt-6 text-center space-y-2">
              {mode !== "login" && (
                <button type="button" className="text-sm text-muted-foreground hover:text-foreground transition-colors underline-offset-4 hover:underline block w-full"
                  onClick={() => { setMode("login"); resetForm(); }}>
                  Voltar ao login
                </button>
              )}
              {mode === "login" && (
                <button type="button" className="text-sm text-muted-foreground hover:text-foreground transition-colors underline-offset-4 hover:underline"
                  onClick={() => { setMode("signup"); resetForm(); }}>
                  Novo usuário? Solicitar cadastro
                </button>
              )}
            </div>

            <p className="mt-4 text-center text-xs text-muted-foreground">
              {mode === "login"
                ? "Acesso restrito a pesquisadores pré-cadastrados e aprovados."
                : mode === "signup"
                ? "Após o cadastro, um administrador precisará aprovar seu acesso."
                : "Você receberá um email com instruções para redefinir sua senha."}
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
