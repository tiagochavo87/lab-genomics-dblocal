import {
  LayoutDashboard, Database, GitBranch, Settings, LogOut, User, FlaskConical, ShieldCheck, Dna, BarChart3, Shield, FileHeart,
  Scale, Users, GitCompare, LineChart, LucideIcon,
} from "lucide-react";
import { NavLink } from "@/components/NavLink";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useAdminCheck } from "@/hooks/useAdminCheck";
import logo from "@/assets/logo-lapoge.png";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarFooter,
  useSidebar,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";

interface Item { title: string; url: string; icon: LucideIcon }

const mainItems: Item[] = [
  { title: "Dashboard", url: "/", icon: LayoutDashboard },
  { title: "Banco de Dados", url: "/database", icon: Database },
  { title: "Condições Clínicas DB", url: "/diseases", icon: FlaskConical },
  { title: "Estatísticas Descritivas", url: "/descriptive-stats", icon: BarChart3 },
  { title: "Gerenciador de Versões", url: "/versions", icon: GitBranch },
];

/** Estatística Avançada: cada análise em sua própria página. */
const advancedSections: Array<{ label: string; items: Item[] }> = [
  {
    label: "Genética",
    items: [
      { title: "Desequilíbrio de Ligação", url: "/avancada/ld", icon: Dna },
      { title: "Hardy-Weinberg", url: "/avancada/hardy-weinberg", icon: Scale },
      { title: "Associação Caso-Controle", url: "/avancada/associacao", icon: Users },
    ],
  },
  {
    label: "Clínica",
    items: [
      { title: "Comparação entre Grupos", url: "/avancada/comparacao", icon: GitCompare },
      { title: "Regressão Logística", url: "/avancada/regressao", icon: LineChart },
    ],
  },
];

const systemItems: Item[] = [
  { title: "Configurações", url: "/settings", icon: Settings },
  { title: "Política de Privacidade", url: "/privacy", icon: Shield },
];

const adminItem: Item = { title: "Administração", url: "/admin", icon: ShieldCheck };

function MenuItems({ items, collapsed }: { items: Item[]; collapsed: boolean }) {
  return (
    <SidebarMenu>
      {items.map((item) => (
        <SidebarMenuItem key={item.url}>
          <SidebarMenuButton asChild tooltip={item.title}>
            <NavLink
              to={item.url}
              end={item.url === "/"}
              className="hover:bg-sidebar-accent/60 transition-colors"
              activeClassName="bg-sidebar-accent text-sidebar-primary font-medium"
            >
              <item.icon className="mr-2 h-4 w-4" />
              {!collapsed && <span>{item.title}</span>}
            </NavLink>
          </SidebarMenuButton>
        </SidebarMenuItem>
      ))}
    </SidebarMenu>
  );
}

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const { profile, signOut } = useAuth();
  const navigate = useNavigate();
  const { isAdmin } = useAdminCheck();

  const system = isAdmin ? [...systemItems, adminItem] : systemItems;

  return (
    <Sidebar collapsible="icon">
      <SidebarContent>
        <div className={`flex items-center gap-3 px-4 py-5 ${collapsed ? "justify-center" : ""}`}>
          <img src={logo} alt="LAPOGE" className="h-7 w-auto shrink-0" />
          {!collapsed && (
            <div className="min-w-0">
              <h1 className="text-sm font-bold tracking-wide text-sidebar-accent-foreground font-display">DBLAPOGE</h1>
              <p className="text-[10px] text-sidebar-foreground/50 truncate">Genética Humana</p>
            </div>
          )}
        </div>

        <SidebarGroup>
          <SidebarGroupContent>
            <MenuItems items={mainItems} collapsed={collapsed} />
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup className="py-0">
          <SidebarGroupLabel className="text-[11px] uppercase tracking-wider text-sidebar-foreground/70">Estatística Avançada</SidebarGroupLabel>
          <SidebarGroupContent className="space-y-1">
            {advancedSections.map((sec) => (
              <div key={sec.label}>
                {!collapsed && <p className="px-2 pt-1 pb-0.5 text-[10px] text-sidebar-foreground/45">{sec.label}</p>}
                <MenuItems items={sec.items} collapsed={collapsed} />
              </div>
            ))}
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupContent>
            <MenuItems items={system} collapsed={collapsed} />
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        {!collapsed && profile && (
          <div className="px-3 pb-2">
            <Separator className="mb-3 bg-sidebar-border" />
            <div
              className="flex items-center gap-2.5 mb-1 cursor-pointer rounded-md p-1.5 -mx-1.5 hover:bg-sidebar-accent/60 transition-colors"
              onClick={() => navigate("/settings")}
              title="Editar perfil"
            >
              <div className="h-8 w-8 rounded-full bg-sidebar-accent flex items-center justify-center shrink-0">
                <User className="h-4 w-4 text-sidebar-primary" />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-medium text-sidebar-accent-foreground truncate">
                  {profile.full_name || "Pesquisador"}
                </p>
                <p className="text-[10px] text-sidebar-foreground/50 truncate">{profile.role}</p>
              </div>
            </div>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton asChild>
                  <NavLink
                    to="/my-data"
                    className="hover:bg-sidebar-accent/60 transition-colors text-xs"
                    activeClassName="bg-sidebar-accent text-sidebar-primary font-medium"
                  >
                    <FileHeart className="mr-2 h-4 w-4" />
                    <span>Meus Dados</span>
                  </NavLink>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </div>
        )}
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton onClick={signOut} className="hover:bg-sidebar-accent/60 text-sidebar-foreground/70 hover:text-sidebar-accent-foreground">
              <LogOut className="mr-2 h-4 w-4" />
              {!collapsed && <span>Sair</span>}
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
