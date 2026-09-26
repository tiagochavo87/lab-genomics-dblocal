#Requires -RunAsAdministrator
<#
  Instala o DBLAPOGE (frontend + backend + Postgres) neste PC como o
  "servidor" central do laboratorio. Os demais PCs NAO precisam instalar
  nada - so acessam pelo navegador no endereco impresso ao final.

  Uso (PowerShell como Administrador, a partir da raiz do repositorio
  ja clonado/baixado neste PC):

      cd C:\DBLAPOGE
      .\windows\install-server.ps1

  Parametros opcionais:
      -Port 8080                 Porta em que a aplicacao vai ficar disponivel
      -AdminEmail admin@lab.com  Email do administrador inicial
      -AdminName "Nome"          Nome do administrador inicial

  O script e pensado para ser reexecutado com seguranca (reinstala so o
  que faltar) mas NAO foi validado em uma maquina Windows real ainda -
  revise a saida com atencao na primeira execucao e reporte qualquer erro.
#>

[CmdletBinding()]
param(
  [int]$Port = 8080,
  [string]$AdminEmail = "admin@laboratorio.local",
  [string]$AdminName = "Administrador"
)

$ErrorActionPreference = "Stop"
$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$BackendDir = Join-Path $RepoRoot "backend\local-api"
$LogDir = Join-Path $RepoRoot "logs"
$ServiceName = "DBLAPOGE"

function Write-Step($msg) { Write-Host "`n==> $msg" -ForegroundColor Cyan }
function Write-Warn2($msg) { Write-Host "AVISO: $msg" -ForegroundColor Yellow }
function Write-Fail($msg) { Write-Host "ERRO: $msg" -ForegroundColor Red }

function New-RandomSecret([int]$Bytes = 32) {
  $buffer = New-Object byte[] $Bytes
  [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($buffer)
  -join ($buffer | ForEach-Object { $_.ToString("x2") })
}

function New-RandomPassword([int]$Length = 20) {
  # Get-Random nao e criptograficamente seguro; usa o RNG do sistema com
  # rejection sampling (sem vies). So alfanumericos: a senha do Postgres vai
  # dentro da DATABASE_URL, e caracteres como # ou % quebravam o parse da URL
  # e impediam o servico de subir.
  $chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789"
  $limit = 256 - (256 % $chars.Length)
  $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
  $one = New-Object byte[] 1
  $out = New-Object System.Text.StringBuilder
  while ($out.Length -lt $Length) {
    $rng.GetBytes($one)
    if ($one[0] -lt $limit) { [void]$out.Append($chars[$one[0] % $chars.Length]) }
  }
  $out.ToString()
}

# --- 0. Pre-checagens -------------------------------------------------

if (-not (Get-Command winget -ErrorAction SilentlyContinue)) {
  Write-Fail "winget nao encontrado. Instale o 'App Installer' pela Microsoft Store e rode este script de novo:"
  Write-Host "  https://apps.microsoft.com/detail/9nblggh4nns1"
  exit 1
}

if ($RepoRoot -match "\\(Downloads|Temp|AppData\\Local\\Temp)\\") {
  Write-Warn2 "Este repositorio parece estar em uma pasta temporaria ($RepoRoot)."
  Write-Warn2 "O servico do Windows sera registrado apontando para ESTE caminho - se voce mover/apagar"
  Write-Warn2 "esta pasta depois, o servico para de funcionar. Mova para um lugar definitivo (ex.: C:\DBLAPOGE) antes de continuar."
  $answer = Read-Host "Continuar mesmo assim? (s/N)"
  if ($answer -ne "s") { exit 1 }
}

New-Item -ItemType Directory -Force -Path $LogDir | Out-Null

# --- 1. Node.js ---------------------------------------------------------

Write-Step "Verificando Node.js"
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  Write-Host "Instalando Node.js LTS via winget..."
  winget install --id OpenJS.NodeJS.LTS -e --silent --accept-package-agreements --accept-source-agreements
  if ($LASTEXITCODE -ne 0) {
    Write-Fail "Falha ao instalar Node.js pelo winget. Instale manualmente em https://nodejs.org (versao LTS) e rode o script de novo."
    exit 1
  }
  # winget as vezes exige reabrir o terminal para atualizar o PATH.
  $env:Path = [System.Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path", "User")
}
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  Write-Fail "Node.js foi instalado mas nao apareceu no PATH desta sessao. Feche este terminal, abra um novo PowerShell 'como Administrador' e rode o script de novo."
  exit 1
}
Write-Host "Node.js: $(node --version)"

# --- 2. PostgreSQL --------------------------------------------------------

Write-Step "Verificando PostgreSQL"
$pgService = Get-Service -Name "postgresql*" -ErrorAction SilentlyContinue | Select-Object -First 1
$PgPasswordFile = Join-Path $RepoRoot "windows\.pg_superuser_password.txt"

if (-not $pgService) {
  Write-Host "Instalando PostgreSQL 16 via winget (isso pode levar alguns minutos)..."
  $pgSuperPassword = New-RandomPassword 24
  $overrideArgs = "--mode unattended --superpassword `"$pgSuperPassword`" --servicename postgresql-x64-16 --serverport 5432"
  winget install --id PostgreSQL.PostgreSQL.16 -e --silent --accept-package-agreements --accept-source-agreements --override $overrideArgs
  if ($LASTEXITCODE -ne 0) {
    Write-Fail "Falha ao instalar PostgreSQL pelo winget. Instale manualmente (https://www.postgresql.org/download/windows/), anote a senha do usuario 'postgres' e rode o script de novo."
    exit 1
  }
  # Guarda a senha gerada so para este script conseguir criar o banco a seguir.
  # NAO e a senha final de nada visivel ao usuario - fica so no .env do backend.
  Set-Content -Path $PgPasswordFile -Value $pgSuperPassword -NoNewline
  Start-Sleep -Seconds 5
  $pgService = Get-Service -Name "postgresql*" -ErrorAction SilentlyContinue | Select-Object -First 1
} elseif (Test-Path $PgPasswordFile) {
  $pgSuperPassword = Get-Content $PgPasswordFile -Raw
} else {
  Write-Fail "Ja existe um servico PostgreSQL instalado, mas este script nao tem a senha do usuario 'postgres' dele."
  Write-Fail "Informe a senha manualmente: rode o script com a variavel de ambiente PGSUPERPASSWORD definida, ex.:"
  Write-Host '  $env:PGSUPERPASSWORD = "sua-senha-postgres"; .\windows\install-server.ps1'
  if (-not $env:PGSUPERPASSWORD) { exit 1 }
  $pgSuperPassword = $env:PGSUPERPASSWORD
}

if (-not $pgService -or $pgService.Status -ne "Running") {
  Write-Host "Iniciando servico do PostgreSQL..."
  Start-Service $pgService.Name
  Start-Sleep -Seconds 3
}
Write-Host "PostgreSQL: servico '$($pgService.Name)' rodando."

$psqlExe = Get-ChildItem "C:\Program Files\PostgreSQL\*\bin\psql.exe" -ErrorAction SilentlyContinue | Select-Object -First 1
if (-not $psqlExe) {
  Write-Fail "Nao encontrei psql.exe em C:\Program Files\PostgreSQL\*\bin\. Ajuste o caminho manualmente no script se sua instalacao for diferente."
  exit 1
}

Write-Step "Criando o banco de dados 'dblapoge' (se ainda nao existir)"
$env:PGPASSWORD = $pgSuperPassword
$dbExists = & $psqlExe.FullName -U postgres -h localhost -tAc "SELECT 1 FROM pg_database WHERE datname='dblapoge'"
if ($dbExists.Trim() -ne "1") {
  & $psqlExe.FullName -U postgres -h localhost -c "CREATE DATABASE dblapoge;"
}

# --- 3. Segredos e .env do backend --------------------------------------

Write-Step "Gerando segredos e escrevendo backend\local-api\.env"

$LanIp = (Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
  Where-Object { $_.InterfaceAlias -notmatch "Loopback" -and $_.IPAddress -notlike "169.254.*" } |
  Select-Object -First 1 -ExpandProperty IPAddress)
if (-not $LanIp) { $LanIp = "localhost" }
$BaseUrl = "http://$($LanIp):$Port"

$JwtSecret = New-RandomSecret 32
$AdminPassword = New-RandomPassword 16

$envPath = Join-Path $BackendDir ".env"
$alreadyConfigured = Test-Path $envPath
if ($alreadyConfigured) {
  Write-Warn2 "Ja existe um backend\local-api\.env - preservando o que ja esta la (nao vou sobrescrever segredos existentes)."
} else {
  @"
PORT=$Port
DATABASE_URL=postgres://postgres:$pgSuperPassword@localhost:5432/dblapoge
JWT_SECRET=$JwtSecret
CORS_ORIGIN=$BaseUrl
PUBLIC_APP_URL=$BaseUrl/reset-password
INITIAL_ADMIN_EMAIL=$AdminEmail
INITIAL_ADMIN_PASSWORD=$AdminPassword
INITIAL_ADMIN_NAME=$AdminName
SMTP_HOST=
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=
SMTP_PASS=
MAIL_FROM=DBLAPOGE <no-reply@laboratorio.local>
FRONTEND_DIST_PATH=$RepoRoot\dist
"@ | Set-Content -Path $envPath -Encoding utf8
}

# --- 4. Build do backend e do frontend -----------------------------------

Write-Step "Instalando dependencias do backend"
Push-Location $BackendDir
npm install --omit=dev
if ($LASTEXITCODE -ne 0) { Write-Fail "npm install do backend falhou."; Pop-Location; exit 1 }
Pop-Location

Write-Step "Build do frontend (isso pode levar alguns minutos na primeira vez)"
Push-Location $RepoRoot
$env:VITE_API_URL = ""
npm install
if ($LASTEXITCODE -ne 0) { Write-Fail "npm install do frontend falhou."; Pop-Location; exit 1 }
npm run build
if ($LASTEXITCODE -ne 0) { Write-Fail "build do frontend falhou."; Pop-Location; exit 1 }
Pop-Location

# --- 5. Servico do Windows (NSSM) ----------------------------------------

Write-Step "Registrando o servico do Windows"
if (-not (Get-Command nssm -ErrorAction SilentlyContinue)) {
  winget install --id NSSM.NSSM -e --silent --accept-package-agreements --accept-source-agreements
  $env:Path = [System.Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path", "User")
}
if (-not (Get-Command nssm -ErrorAction SilentlyContinue)) {
  Write-Fail "Nao consegui instalar/encontrar o nssm. Baixe manualmente em https://nssm.cc/download, extraia e adicione ao PATH, depois rode o script de novo."
  exit 1
}

$nodeExe = (Get-Command node).Source
$serverScript = Join-Path $BackendDir "src\server.js"

if ((nssm status $ServiceName 2>$null)) {
  Write-Host "Servico '$ServiceName' ja existe, atualizando..."
  nssm stop $ServiceName 2>$null | Out-Null
} else {
  nssm install $ServiceName $nodeExe $serverScript
}
nssm set $ServiceName AppDirectory $BackendDir
nssm set $ServiceName AppStdout (Join-Path $LogDir "service.log")
nssm set $ServiceName AppStderr (Join-Path $LogDir "service-error.log")
nssm set $ServiceName Start SERVICE_AUTO_START
nssm set $ServiceName AppRestartDelay 5000
nssm start $ServiceName

# --- 6. Firewall -----------------------------------------------------------

Write-Step "Liberando a porta $Port no Firewall do Windows"
if (-not (Get-NetFirewallRule -DisplayName $ServiceName -ErrorAction SilentlyContinue)) {
  # Restrito a redes Privada/Dominio e a sub-rede local: nao abre a porta em
  # redes marcadas como Publicas nem para enderecos fora da LAN.
  New-NetFirewallRule -DisplayName $ServiceName -Direction Inbound -Protocol TCP -LocalPort $Port -Action Allow `
    -Profile Domain,Private -RemoteAddress LocalSubnet | Out-Null
}

# --- 7. Checagem final -----------------------------------------------------

Write-Step "Verificando se a aplicacao subiu"
$ok = $false
for ($i = 0; $i -lt 15; $i++) {
  Start-Sleep -Seconds 2
  try {
    $resp = Invoke-WebRequest -Uri "http://localhost:$Port/health" -UseBasicParsing -TimeoutSec 3
    if ($resp.StatusCode -eq 200) { $ok = $true; break }
  } catch {}
}

Write-Host ""
if ($ok) {
  Write-Host "=================================================================" -ForegroundColor Green
  Write-Host " Instalacao concluida!" -ForegroundColor Green
  Write-Host "=================================================================" -ForegroundColor Green
  Write-Host " Endereco para os OUTROS PCs do laboratorio acessarem (navegador):"
  Write-Host "   $BaseUrl" -ForegroundColor Yellow
  if (-not $alreadyConfigured) {
    Write-Host ""
    Write-Host " Login inicial do administrador:"
    Write-Host "   Email: $AdminEmail"
    Write-Host "   Senha: $AdminPassword" -ForegroundColor Yellow
    Write-Host "   -> Troque essa senha assim que fizer o primeiro login."
  } else {
    Write-Host " (.env ja existia - as credenciais sao as que ja estavam configuradas)"
  }
  Write-Host ""
  Write-Host " Este PC precisa continuar ligado (ou pelo menos essa sessao do Windows)"
  Write-Host " para os outros PCs conseguirem acessar. O servico reinicia sozinho junto com o Windows."
  Write-Host ""
  Write-Host " Logs: $LogDir\service.log e $LogDir\service-error.log"
} else {
  Write-Fail "A aplicacao nao respondeu em http://localhost:$Port/health depois de instalada."
  Write-Fail "Veja o log de erro para diagnosticar: $LogDir\service-error.log"
  exit 1
}
