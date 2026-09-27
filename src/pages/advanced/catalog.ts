import { Dna, GitCompare, LineChart, LucideIcon, Scale, Users } from "lucide-react";

export interface AnalysisEntry {
  title: string;
  url: string;
  icon: LucideIcon;
  description: string;
  methods: string;
}

/** Análises do painel Estatística Avançada, em duas partes. */
export const ADVANCED_SECTIONS: Array<{ label: string; description: string; items: AnalysisEntry[] }> = [
  {
    label: "Genética",
    description: "Análises com genótipos (SNPs).",
    items: [
      {
        title: "Desequilíbrio de Ligação", url: "/avancada/ld", icon: Dna,
        description: "Haplótipos e LD entre pares de SNPs (D, D', r²), com heatmaps.",
        methods: "EM multilocus",
      },
      {
        title: "Hardy-Weinberg", url: "/avancada/hardy-weinberg", icon: Scale,
        description: "Verifica se as frequências genotípicas estão em equilíbrio.",
        methods: "Qui-quadrado · teste exato",
      },
      {
        title: "Associação Caso-Controle", url: "/avancada/associacao", icon: Users,
        description: "Compara genótipos e alelos entre casos e controles em cada modelo genético.",
        methods: "OR (IC 95%) · qui-quadrado · Fisher · logística",
      },
    ],
  },
  {
    label: "Clínica",
    description: "Análises com variáveis clínicas e laboratoriais.",
    items: [
      {
        title: "Comparação entre Grupos", url: "/avancada/comparacao", icon: GitCompare,
        description: "Compara variáveis numéricas e categóricas entre grupos ou genótipos.",
        methods: "Mann-Whitney · Kruskal-Wallis · t · ANOVA · qui-quadrado",
      },
      {
        title: "Regressão Logística", url: "/avancada/regressao", icon: LineChart,
        description: "ORs ajustadas de várias variáveis ao mesmo tempo para um desfecho sim/não.",
        methods: "Multivariada · Wald · razão de verossimilhança",
      },
    ],
  },
];
