# DBLAPOGE

Sistema web do **LAPOGE (Laboratório de Polimorfismos Genéticos, UFSC)** para gerenciar bancos de dados clínico-genômicos de pesquisa: bancos por doença, versões dos dados, variáveis, estatística descritiva, estatística avançada (LD, Hardy-Weinberg, associação caso-controle, comparação entre grupos, regressão logística), controle de acesso por papéis, auditoria e backup.

Desenvolvido por **Tiago Fernando Chaves** ([@tiagochavo87](https://github.com/tiagochavo87)).

Versão atual: **2.1.0** (ver [CHANGELOG.md](CHANGELOG.md)). Quem já usa a v1 deve ler [docs/MIGRACAO_v1_para_v2.md](docs/MIGRACAO_v1_para_v2.md).

## Funcionalidades

- **Bancos por doença** com versões dos dados, variáveis e importação de planilhas (`.xlsx`, `.csv`, `.txt`).
- **Estatística descritiva** por variável.
- **Estatística Avançada**: painel com uma página por análise, usando um banco do sistema ou um arquivo enviado na hora. Cada análise exporta XLSX com uma aba **Métodos** pronta para citar. Guia: [docs/ESTATISTICA_AVANCADA.md](docs/ESTATISTICA_AVANCADA.md).
  - *Genética*: desequilíbrio de ligação (D, D', r²), Hardy-Weinberg (qui-quadrado e teste exato) e associação caso-controle (modelos codominante, dominante, recessivo, sobredominante e log-aditivo, com ajuste por covariáveis).
  - *Clínica*: comparação entre grupos (Mann-Whitney/Kruskal-Wallis, Welch/ANOVA, qui-quadrado/Fisher) e regressão logística multivariada.
- **Controle de acesso** por papéis, com aprovação de cadastro, mascaramento LGPD no servidor e log de auditoria.
- **Versões e cópias de segurança** internas, além de backup diário do banco.

## Arquitetura

| Parte | Tecnologia | Pasta |
|---|---|---|
| Interface | React 18 + Vite 7 + Tailwind (shadcn/ui) | `src/` |
| API | Node.js 22+ (Express 4) | `backend/local-api/` |
| Banco | PostgreSQL 16 | via Docker ou instalador Windows |
| HTTPS / proxy | Caddy (modo Docker) ou certificado próprio (modo Windows) | `Caddyfile`, `windows/` |
| Backup | `pg_dump` diário, com retenção e criptografia opcional | `backup/`, `windows/backup-db.ps1` |

Os dados de cada versão ficam no PostgreSQL. **Tudo que envolve permissão é decidido no servidor**: aprovação de cadastro, papéis, mascaramento LGPD, cópias e restauração de versões, auditoria. A interface só exibe o que a API devolve.

### Papéis

| Papel | Pode |
|---|---|
| Usuário (aprovado) | ver bancos, versões e estatísticas com **dados identificáveis mascarados**; exportar (mascarado) |
| Moderador | o mesmo, e também criar bancos, variáveis e versões, fazer cópias e restaurar |
| Administrador | tudo, incluindo ver dados sem máscara, aprovar cadastros, mudar papéis, classificar variáveis (LGPD), destinos de backup e log de auditoria |

Cadastros novos ficam **pendentes** até um administrador aprovar.

## Como instalar

Escolha **um** dos caminhos. Os três rodam a mesma aplicação.

### A. Servidor Linux ou nuvem com Docker (recomendado para acesso pela internet)

Serve para uma VM na nuvem (inclusive gratuita), um servidor da instituição ou um PC com Linux.

```bash
git clone https://github.com/tiagochavo87/lab-genomics-dblocal.git dblapoge
cd dblapoge
# Com domínio (HTTPS automático via Let's Encrypt). Domínio gratuito serve,
# ex.: meulab.duckdns.org, desde que aponte para o IP do servidor:
sudo ./scripts/instalar-linux.sh meulab.duckdns.org
# Só na rede interna, sem domínio (HTTP na porta 8080):
sudo ./scripts/instalar-linux.sh
```

O script instala o Docker, gera o `.env` com segredos aleatórios (`scripts/gerar-env.sh`) e sobe tudo. Para fazer à mão:

```bash
./scripts/gerar-env.sh                        # cria .env (revise DOMAIN, SMTP, BACKUP_*)
docker compose -f docker-compose.local.yml -f docker-compose.remote.yml up -d --build   # com domínio
docker compose -f docker-compose.local.yml -f docker-compose.lan.yml up -d --build      # só rede interna
```

Serviços: `postgres` (só em 127.0.0.1), `db-setup` (cria o usuário do banco sem superusuário), `api`, `backup` (diário) e `web` (Caddy).

### B. Um PC com Windows 10/11 como servidor do laboratório

PowerShell **como Administrador**, com o projeto numa pasta definitiva (ex.: `C:\DBLAPOGE`):

```powershell
.\windows\install-server.ps1                                   # HTTP na rede interna
.\windows\install-server.ps1 -Https -EncryptBackups -BackupDir "D:\Backups"   # recomendado
```

Detalhes, HTTPS e confiança do certificado nos outros PCs: [windows/README.md](windows/README.md).

### C. Desenvolvimento

```bash
npm ci && (cd backend/local-api && npm ci)
cp .env.example .env                          # VITE_API_URL=http://localhost:3001
cp backend/local-api/.env.example backend/local-api/.env   # preencha JWT_SECRET, DATABASE_URL, admin
npm run dev:api                               # API em :3001
npm run dev                                   # interface em :8080
```

### Só testar no seu PC (Windows + Docker Desktop)

Sobe tudo dentro do Docker, sem instalar nada no Windows. No terminal, dentro da pasta do projeto:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\testar-no-meu-pc.ps1
powershell -ExecutionPolicy Bypass -File .\scripts\parar-teste.ps1           # para (guarda os dados)
powershell -ExecutionPolicy Bypass -File .\scripts\parar-teste.ps1 -Apagar   # para e apaga o banco de teste
```

## Testes

```bash
npm test                                      # testes da interface (Vitest)
TEST_DATABASE_URL=postgres://.../dblapoge_test npm run test:api   # API contra Postgres real (APAGA esse banco)
npm run lint && npx tsc -p tsconfig.app.json --noEmit
```

Depois de instalar num servidor, rode de qualquer PC com Node:

```bash
node scripts/testar-servidor.mjs https://meulab.duckdns.org admin@lab.org 'senha-do-admin'
E2E_BASE_URL=https://meulab.duckdns.org E2E_EMAIL=... E2E_PASSWORD=... npm run test:e2e   # navegador real (npx playwright install chromium)
```

O `testar-servidor.mjs` confere saúde da API, cabeçalhos de segurança, HTTPS, exigência de login, reset de senha, estabilidade com requisições malformadas, auditoria e sigilo dos segredos de backup. Não altera dados.

A CI (`.github/workflows/ci.yml`, Node 24) roda testes da API contra PostgreSQL, testes da interface, lint, typecheck, build, `npm audit` e checagem de sintaxe dos scripts shell/PowerShell a cada push na `main` e em pull requests. Os cálculos da Estatística Avançada são conferidos contra scipy/statsmodels em `src/test/stats.test.ts`.

## Segurança e LGPD (resumo)

- **Mascaramento no servidor**: colunas identificáveis (nome, CPF, nascimento, telefone, endereço, prontuário, etc.) saem mascaradas da API para quem não é administrador. A detecção é automática pelo nome da coluna e o administrador pode corrigir variável por variável (tela de variáveis do banco → coluna LGPD).
- **Auditoria confiável**: login, falhas de login, mudanças de senha, alterações de dados, papéis, aprovações, cópias/restaurações e **visualizações de dados sensíveis** são registrados pelo servidor (origem "Servidor" no log). O log é somente-acréscimo, nem o admin apaga.
- **Sessões**: expiram (padrão 12 h, renovadas com o uso); trocar a senha encerra as sessões em outros PCs; "Sair de todos os computadores" na página de perfil e configurações (clique no seu nome no rodapé do menu); o admin pode encerrar as sessões de um usuário.
- **Senhas**: bcrypt (custo 12), mínimo 10 caracteres, tokens de recuperação guardados só como hash, uso único, 1 hora.
- **Banco**: a API usa o usuário `dblapoge_app`, sem superusuário. Postgres nunca exposto na rede.
- **Backup**: `pg_dump` diário em arquivo, com retenção (30 dias), checksum e criptografia AES-256 opcional compatível com `openssl`. **Copie a pasta de backups para fora do servidor** (HD externo ou pasta sincronizada com a nuvem).
- **Segredos dos destinos de backup** (tokens, senhas) ficam cifrados no banco e nunca voltam ao navegador.

## Variáveis de ambiente da API

| Variável | Padrão | Descrição |
|---|---|---|
| `DATABASE_URL` | — | conexão PostgreSQL (usuário `dblapoge_app`) |
| `JWT_SECRET` | — | ≥ 32 caracteres aleatórios (a API não sobe sem) |
| `JWT_EXPIRES_IN` | `12h` | validade da sessão |
| `SETTINGS_ENCRYPTION_KEY` | derivada do JWT_SECRET | chave dos segredos de backup |
| `CORS_ORIGIN` | `http://localhost:8080` | origens externas permitidas (a própria origem sempre é) |
| `PUBLIC_APP_URL` | — | base do link de recuperação de senha |
| `TRUST_PROXY` | vazio | `1` só quando há proxy (Caddy) na frente |
| `HTTPS` | `false` | `true` quando o acesso é por HTTPS (liga HSTS) |
| `HTTPS_PFX_PATH` / `HTTPS_PFX_PASSPHRASE` | — | certificado próprio (modo Windows `-Https`) |
| `UNMASKED_ROLES` | `admin` | papéis que veem dados sem máscara |
| `PASSWORD_MIN_LENGTH` | `10` | tamanho mínimo de senha |
| `BODY_LIMIT` | `50mb` | tamanho máximo de envio (versões grandes) |
| `SMTP_*`, `MAIL_FROM` | — | e-mail de recuperação de senha (sem SMTP o link vai só para o log) |
| `INITIAL_ADMIN_EMAIL` / `_PASSWORD` / `_NAME` | — | admin criado na primeira subida |

## Estrutura

```
src/                     interface React (src/pages/advanced e src/lib/stats: Estatística Avançada)
backend/local-api/       API (src/app.js rotas, permissions.js, masking.js, audit.js, schema.js migrações)
backup/                  imagem do serviço de backup diário (Docker)
docker/, scripts/        setup do banco, geração de .env, instalação Linux, restauração, teste do servidor, teste local no Windows
windows/                 instalador, backup, restauração e certificado (Windows 10/11)
e2e/                     teste de navegador (Playwright)
docs/                    guia da Estatística Avançada e de migração (o .docx é o manual da v1, desatualizado)
```

## Formatos de arquivo aceitos

`.xlsx`, `.csv` e `.txt`/`.tsv` (separados por tab, `;` ou `,`). Arquivos `.xls` antigos (Excel 97-2003) precisam ser salvos como `.xlsx` ou `.csv` antes.

## Autor, licença e contato

Autor e responsável: **Tiago Fernando Chaves** (LAPOGE/UFSC), [@tiagochavo87](https://github.com/tiagochavo87).

Uso interno do LAPOGE/UFSC.
