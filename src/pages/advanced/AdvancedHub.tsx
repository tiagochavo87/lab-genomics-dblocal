import { Link } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { ChevronRight, Sigma } from "lucide-react";
import { ADVANCED_SECTIONS } from "./catalog";

/** Painel da Estatística Avançada: cada análise é um cartão com ícone. */
export default function AdvancedHub() {
  return (
    <div className="p-6 space-y-8">
      <div>
        <h2 className="text-2xl font-bold font-display flex items-center gap-2"><Sigma className="h-6 w-6 text-primary" />Estatística Avançada</h2>
        <p className="text-sm text-muted-foreground">Escolha a análise. Todas aceitam um banco do sistema ou um arquivo enviado na hora, e exportam XLSX com o texto de métodos.</p>
      </div>

      {ADVANCED_SECTIONS.map((sec) => (
        <section key={sec.label} className="space-y-3">
          <div>
            <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">{sec.label}</h3>
            <p className="text-xs text-muted-foreground">{sec.description}</p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {sec.items.map((a) => (
              <Link key={a.url} to={a.url} className="group rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-primary">
                <Card className="h-full transition-all group-hover:border-primary/60 group-hover:shadow-md">
                  <CardContent className="p-5 flex gap-4">
                    <div className="h-12 w-12 shrink-0 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
                      <a.icon className="h-6 w-6" />
                    </div>
                    <div className="min-w-0 flex-1 space-y-1">
                      <p className="font-semibold font-display flex items-center gap-1">
                        {a.title}
                        <ChevronRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                      </p>
                      <p className="text-sm text-muted-foreground">{a.description}</p>
                      <p className="text-[11px] text-muted-foreground/80">{a.methods}</p>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
