# Migração da v1 para a v2

A v2 migra o banco sozinha na primeira subida (tabela `schema_migrations`): acrescenta colunas e índices, **sem apagar dados**. O que muda para quem opera:

| Item | O que acontece |
|---|---|
| Sessões | Todos precisam entrar de novo (o formato do token mudou). |
| Links de recuperação de senha pendentes | Invalidados; é só pedir outro. |
| Senha mínima | 10 caracteres para senhas **novas**; as atuais continuam valendo. |
| E-mails | Login passa a ignorar maiúsculas/minúsculas. Se existirem duas contas que diferem só nisso, a API avisa no log e o índice único não é criado até unificar. |
| Arquivos `.xls` | Precisam ser salvos como `.xlsx` ou `.csv`. |
| Dados já importados | Valores 0/1 que a v1 converteu em verdadeiro/falso continuam assim; reimporte a versão se isso afetar análises. |

**Antes de tudo, faça um backup do banco da v1**, por exemplo:
- Docker: `docker compose -f docker-compose.local.yml exec -T postgres pg_dump -U postgres -Fc dblapoge > antes-da-v2.dump`
- Windows: `& "C:\Program Files\PostgreSQL\16\bin\pg_dump.exe" -U postgres -h localhost -Fc -f antes-da-v2.dump dblapoge`

## Instalação Docker

1. Atualize o código (`git pull` ou copie a pasta nova).
2. No `.env` da raiz, **mantenha** `POSTGRES_PASSWORD` igual ao que já estava (o Postgres só lê essa variável na criação do volume) e acrescente:
   ```
   APP_DB_PASSWORD=<openssl rand -hex 24>
   BACKUP_PASSPHRASE=<opcional, guarde fora do servidor>
   ```
   Compare com `.env.docker.example` para ver as demais opções novas.
3. Suba de novo:
   ```bash
   docker compose -f docker-compose.local.yml -f docker-compose.remote.yml up -d --build
   ```
   O serviço `db-setup` cria o usuário `dblapoge_app` e transfere para ele a posse das tabelas antigas; a API aplica as migrações.
4. Rode `node scripts/testar-servidor.mjs https://SEU_DOMINIO admin@... 'senha'`.

Se o volume da v1 foi criado com a senha antiga de exemplo (`postgres`), troque-a antes do passo 3:
```bash
docker compose -f docker-compose.local.yml exec postgres psql -U postgres -c "ALTER USER postgres PASSWORD 'nova-senha-forte'"
```
e use essa mesma senha em `POSTGRES_PASSWORD`.

## Instalação Windows

1. Copie a v2 **por cima da mesma pasta** (ou `git pull`), preservando `backend\local-api\.env`.
2. Rode de novo, como Administrador: `.\windows\install-server.ps1` (acrescente `-Https` e `-EncryptBackups` se quiser).
   O instalador detecta a v1, cria o usuário `dblapoge_app`, reescreve a `DATABASE_URL`, move a senha do superusuário para `C:\ProgramData\DBLAPOGE`, troca a conta do serviço, agenda o backup e roda o primeiro.

## Versão antiga da pasta local (commit `dfa1097`)

Essa versão tem falhas graves (link de recuperação devolvido na resposta, `JWT_SECRET` de exemplo público). **Não a mantenha rodando.** O `.env` dela usa valores de exemplo: ao migrar, gere segredos novos (`scripts/gerar-env.sh` no Docker; no Windows o instalador gera sozinho se o `.env` não existir).
