import { SidebarTrigger } from "@/components/ui/sidebar";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/contexts/AuthContext";
import { useRole } from "@/hooks/useAdminCheck";
import { Dna } from "lucide-react";

const ROLE_LABEL = { admin: "Administrador", moderator: "Moderador", user: "Usuário" } as const;

export function AppHeader() {
  const { profile, user } = useAuth();
  const { role } = useRole();

  return (
    <header className="h-14 flex items-center justify-between border-b bg-card/80 backdrop-blur-sm px-4 sticky top-0 z-10">
      <div className="flex items-center gap-3">
        <SidebarTrigger className="text-muted-foreground hover:text-foreground transition-colors" />
        <div className="hidden sm:flex items-center gap-2 text-muted-foreground">
          <Dna className="h-4 w-4 text-accent" />
          <span className="text-xs font-medium uppercase tracking-wider">Banco de Dados Genômico</span>
        </div>
      </div>

      <div className="flex items-center gap-2 text-sm">
        <span className="hidden sm:inline text-muted-foreground truncate max-w-[220px]">
          {profile?.full_name || user?.email}
        </span>
        <Badge variant={role === "admin" ? "default" : "secondary"}>{ROLE_LABEL[role]}</Badge>
      </div>
    </header>
  );
}
