# Changelog

## 2.1.0 (2026-09)

### Estatística Avançada (novo grupo no menu)
- Menu reorganizado: grupo **Estatística Avançada** com as partes *Genética* (Desequilíbrio de Ligação, Hardy-Weinberg, Associação Caso-Controle) e *Clínica* (Comparação entre Grupos, Regressão Logística), cada análise em sua própria página. O endereço antigo `/ld-analysis` redireciona para `/avancada/ld`.
- Todas as análises aceitam como fonte um **banco do sistema** (qualquer versão) ou um **arquivo enviado na hora** (.xlsx, .csv, .txt).
- **Hardy-Weinberg**: qui-quadrado (1 gl) e teste exato de Wigginton, por SNP e opcionalmente por grupo.
- **Associação caso-controle**: modelos codominante, dominante, recessivo, sobredominante e log-aditivo (organização do SNPassoc); OR de Woolf com IC 95%, qui-quadrado, Fisher exato (2×2 e 2×3), p logístico; ajuste opcional por covariáveis (idade, sexo...).
- **Comparação entre grupos**: variáveis numéricas (Mann-Whitney/Kruskal-Wallis e Welch/ANOVA, com média±DP e mediana [Q1–Q3]) e categóricas (qui-quadrado e Fisher); grupos podem ser uma coluna clínica ou um SNP (agrupado por modelo genético).
- **Regressão logística** multivariada: ORs ajustadas com IC 95%, p de Wald, p global por razão de verossimilhança, AIC, R² de McFadden e avisos (separação, poucos eventos por variável).
- **LD a partir do banco ou de planilha com genótipos** (AA, AG, A/G): conversão automática para o formato MLOCUS, com a codificação dos alelos exportada.
- Toda análise exporta XLSX com números de verdade e uma aba **Métodos** com texto pronto para citar.
- Biblioteca estatística própria validada contra scipy/statsmodels (testes automatizados em `src/test/stats.test.ts`).
- Detecção automática do tipo de coluna (genótipo, numérica, categórica, identificador); "N/A", "NA", "nd" etc. tratados como faltantes.

## 2.0.0 (2026-09)

Versão de endurecimento de segurança, LGPD e operação, resultado da auditoria de 26/09/2026.

### Segurança (API)
- Corrigido bypass de permissão por filtro com `op` diferente de `eq`: qualquer cadastrado (mesmo não aprovado) lia todos os perfis, papéis e logs e editava/apagava perfis de outras pessoas.
- Corrigida queda da API com requisição malformada (`filters={}`); handlers async protegidos e tratador de erros central.
- Log de auditoria passou a ser somente-acréscimo para todos, inclusive administradores.
- Rate limit não é mais burlável por `X-Forwarded-For` (`TRUST_PROXY` só com proxy real).
- Sessões revogáveis (`token_version`): troca/redefinição de senha derruba as outras sessões; "sair de todos os computadores"; admin pode encerrar sessões de um usuário; validade padrão 12 h.
- Troca de senha exige a senha atual. Política de senha (mínimo 10, bloqueio de senhas triviais). bcrypt custo 12.
- Tokens de recuperação guardados como hash SHA-256, uso único, pedido novo invalida os anteriores; resposta idêntica para e-mail existente ou não.
- E-mail normalizado (maiúsculas/minúsculas) e índice único em `lower(email)`.
- Campos controlados pelo servidor (`created_by`, `user_name`, `source`, `ip`) não podem ser forjados pelo cliente.
- Não é possível remover o último administrador. Troca de papel atômica.
- API conecta com usuário do banco sem superusuário (`dblapoge_app`).
- Segredos dos destinos de backup cifrados (AES-256-GCM) e nunca devolvidos ao navegador; envio aos destinos feito pelo servidor.
- CSP/HSTS corretos para HTTP e HTTPS; CORS aceita a própria origem (corrige página em branco no modo Windows).

### LGPD
- Mascaramento de dados identificáveis feito no servidor (antes era só visual, no navegador; a página inicial nem mascarava).
- Detecção por nome de coluna sem falsos positivos por substring ("cirurgia" não é mais tratada como "rg") e classificação manual por variável pelo admin.
- Visualizações e exportações de dados sensíveis registradas pelo servidor.
- Moderadores não podem sobrescrever o conteúdo de versões (evita gravar dado mascarado por cima do real).
- Política de Privacidade reescrita para refletir o que o sistema realmente faz.

### Backup
- Backup diário real (`pg_dump`) no Docker (serviço `backup`) e no Windows (Agendador de Tarefas), com retenção, checksum e criptografia opcional compatível com `openssl`.
- Scripts de restauração (`scripts/restore-docker.sh`, `windows/restore-db.ps1`).
- Cópias internas de versão e restauração feitas no servidor; nova tela "Versões e Cópias de Segurança" (substitui a antiga tela com dados fictícios).

### Instalação
- Instalador Windows v2: HTTPS opcional com certificado próprio, conta de serviço sem privilégios, segredos protegidos em `C:\ProgramData\DBLAPOGE`, firewall só rede privada/sub-rede local, rotação de logs, migração automática de instalações v1. Corrigido gerador de senha que quebrava a `DATABASE_URL` em ~80% das instalações.
- Docker: Node 24, container sem root, healthchecks, `restart: unless-stopped`, serviço `db-setup`, modos `remote` (HTTPS) e `lan`.
- `scripts/instalar-linux.sh` e `scripts/gerar-env.sh`.
- `scripts/testar-servidor.mjs` para validar uma instalação.

### Interface
- Leitura/escrita de planilhas com ExcelJS (o pacote `xlsx` 0.18.5 do npm tinha vulnerabilidades sem correção). `.xls` antigo deixa de ser aceito, com mensagem clara.
- Corrigido: valores `0`/`1`, `s`/`n` e `Sim`/`Não` eram convertidos em verdadeiro/falso na importação (apareciam como "true"); agora ficam como estão.
- CSV/TXT salvos pelo Excel em Windows-1252 (ANSI) são lidos com os acentos corretos (antes "Não" virava "N�o").
- Fontes empacotadas localmente (sem Google Fonts).
- Tela de Configurações com troca de senha e "sair de todos os computadores".
- Log de atividades mostra origem (Servidor/Navegador) e ações novas.
- Cabeçalho sem o seletor de versões fictício; mostra usuário e papel.
- Removidos resquícios do Supabase/Lovable e dados de demonstração.

### Dependências
- Vite 7, Vitest 4, React Router 7, Express 4.22, nodemailer 10, bcryptjs 3, dotenv 17. `npm audit` zerado no frontend e no backend.

## 1.0.0 (2026-04)
- Substituição do Supabase por backend Node.js + PostgreSQL.
