# Instalação no Windows 10/11 (PC servidor do laboratório)

Um PC com **Windows 10 (1809 ou mais novo) ou 11** fica como servidor; os demais computadores só acessam pelo navegador. Esse PC precisa ficar ligado quando as pessoas forem usar o sistema.

> Windows 7/XP não servem como servidor (Node.js e PostgreSQL atuais não rodam neles).

## Instalar

1. Coloque o projeto numa pasta **definitiva**, por exemplo `C:\DBLAPOGE` (não em Downloads).
2. Abra o PowerShell **como Administrador** e rode:
   ```powershell
   cd C:\DBLAPOGE
   Set-ExecutionPolicy -Scope Process Bypass
   .\windows\install-server.ps1 -Https -EncryptBackups -BackupDir "D:\DBLAPOGE-backups"
   ```
   Opções:
   | Opção | Para quê |
   |---|---|
   | `-Https` | cria um certificado próprio e serve por HTTPS (recomendado: sem isso senhas e dados trafegam sem criptografia na rede) |
   | `-EncryptBackups` | pergunta uma senha e cifra os backups. **Guarde essa senha fora do PC**: sem ela o backup não pode ser restaurado |
   | `-BackupDir` | pasta do backup diário. Use outro disco, HD externo ou uma pasta sincronizada (Google Drive/OneDrive) |
   | `-BackupTime "12:30"` | horário do backup (se o PC estiver desligado, roda assim que ligar) |
   | `-Port 8080` | porta de acesso |
   | `-AdminEmail`, `-AdminName` | administrador inicial (só na primeira instalação) |
3. No final aparecem o endereço (`https://IP-DO-PC:8080`) e a senha inicial do admin. Troque a senha em **Configurações → Segurança da conta**.

O script instala Node.js LTS, PostgreSQL 16 e NSSM via `winget`, cria o usuário do banco sem superusuário, gera os segredos, faz o build, registra o serviço **DBLAPOGE** (conta `NT SERVICE\DBLAPOGE`, sem privilégios de administrador), agenda o backup diário, libera a porta **só para rede privada/sub-rede local** e roda o primeiro backup.

Pode ser executado de novo a qualquer momento para atualizar: preserva `.env`, segredos e banco.

## Nos outros computadores

- Acesse o endereço impresso pelo instalador (crie um favorito ou atalho).
- **Com `-Https`**, instale o certificado uma vez em cada PC para o navegador não reclamar: copie `windows\dblapoge-certificado.cer` do servidor e, como Administrador, rode `.\confiar-certificado.ps1 -Arquivo .\dblapoge-certificado.cer` (confira a impressão digital com a mostrada pelo instalador). Alternativa manual: duplo clique no `.cer` → Instalar certificado → Máquina local → "Autoridades de Certificação Raiz Confiáveis".
- Se a rede do laboratório estiver marcada como **Pública** no servidor, os outros PCs não conseguem acessar: mude para **Privada** (Configurações → Rede e Internet → propriedades da rede).

## Operação

| Tarefa | Como |
|---|---|
| Reiniciar | `nssm restart DBLAPOGE` (PowerShell Administrador) |
| Status | `nssm status DBLAPOGE` |
| Logs | pasta `logs\` (`service.log`, `service-error.log`, `backup.log`) |
| Backup manual | `.\windows\backup-db.ps1` |
| Restaurar | `.\windows\restore-db.ps1 -File "D:\DBLAPOGE-backups\dblapoge_AAAA-MM-DD_HHMMSS.dump.enc"` |
| Testar a instalação | `node scripts\testar-servidor.mjs https://IP:8080 admin@... "senha"` |
| E-mail de recuperação de senha | preencha `SMTP_*` em `backend\local-api\.env` e reinicie |
| Desinstalar | `.\windows\uninstall-server.ps1` (mantém banco, backups e pasta) |

Onde ficam os segredos: `backend\local-api\.env` (JWT, senha do banco da aplicação) e `C:\ProgramData\DBLAPOGE\` (senha do superusuário do Postgres, certificado, senha dos backups). Todos com acesso restrito a Administradores.

## Backup fora do PC

O backup diário protege contra erro humano e corrupção, mas **não** contra perda do PC (disco, roubo, raio). Aponte `-BackupDir` para um HD externo ou uma pasta sincronizada com a nuvem, ou copie a pasta periodicamente. Os arquivos `.enc` só abrem com a senha do backup, então podem ir para a nuvem com segurança.

## Acesso de fora do laboratório

Este modo é para a rede interna. **Não** faça redirecionamento de porta no roteador. Para acesso pela internet use o modo Docker com domínio e HTTPS automático (README principal).
