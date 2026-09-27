# Estatística Avançada — guia rápido

Todas as páginas seguem os mesmos 3 passos: **1. Dados** → **2. Configuração** → **3. Resultados** (com botão *Exportar XLSX*).

**Fonte dos dados**
- *Banco do sistema*: escolha o banco e a versão.
- *Enviar arquivo*: .xlsx, .csv ou .txt com uma linha de cabeçalho e uma linha por indivíduo. O arquivo não é gravado no sistema.

O sistema reconhece sozinho o tipo de cada coluna:

| Tipo | Exemplos |
|---|---|
| genótipo | `AA`, `AG`, `A/G`, `A|G`, `1/2` |
| numérica | idade, C3 |
| categórica | sexo, Sim/Não |
| identificador | código da amostra |

Valores vazios, `NA`, `N/A`, `nd`, `-`, `?` são tratados como faltantes.

## Genética

| Página | O que faz | Métodos |
|---|---|---|
| Desequilíbrio de Ligação | Haplótipos por EM, D, D', r² entre pares de loci | EM multilocus. Entrada: arquivo MLOCUS **ou** banco/planilha com genótipos (convertido automaticamente: 1 = alelo mais frequente, 2 = o outro) |
| Hardy-Weinberg | Testa o equilíbrio de cada SNP (todos juntos ou por grupo) | Qui-quadrado 1 gl; teste exato de Wigginton et al. (2005) |
| Associação Caso-Controle | Compara genótipos/alelos entre casos e controles | Modelos codominante, dominante, recessivo, sobredominante e log-aditivo; OR de Woolf (IC 95%), qui-quadrado, Fisher exato, regressão logística; ajuste opcional por covariáveis |

## Clínica

| Página | O que faz | Métodos |
|---|---|---|
| Comparação entre Grupos | Compara variáveis entre grupos (ex.: caso × controle, ou genótipos de um SNP) | Numéricas: Mann-Whitney / Kruskal-Wallis e Welch / ANOVA. Categóricas: qui-quadrado e Fisher |
| Regressão Logística | OR ajustadas de várias variáveis ao mesmo tempo para um desfecho sim/não | Máxima verossimilhança (IRLS), Wald, razão de verossimilhança, AIC, R² de McFadden |

## Observações
- A referência dos SNPs é o alelo mais frequente na amostra analisada.
- OR com célula zero usa correção de 0,5 (marcada com *).
- Com muitos SNPs/testes, considere correção para múltiplos testes (ex.: Bonferroni).
- A aba **Métodos** do XLSX traz um parágrafo pronto para a seção de métodos de artigos e dissertações.
- Validação: os cálculos são conferidos automaticamente contra scipy/statsmodels (`src/test/stats.test.ts`).
