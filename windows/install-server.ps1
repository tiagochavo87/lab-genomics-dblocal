#Requires -RunAsAdministrator
<#
  Instala (ou atualiza) o DBLAPOGE v2 neste PC como servidor do laboratorio.
  Os demais computadores so acessam pelo navegador no endereco impresso ao final.

  Requisitos: Windows 10 (1809+) ou 11, PowerShell como Administrador, internet
  durante a instalacao.

  Uso (a partir da raiz do projeto, numa pasta definitiva como C:\DBLAPOGE):
      .\windows\install-server.ps1
      .\windows\install-server.ps1 -Https                    # HTTPS com certificado local
      .\windows\install-server.ps1 -BackupDir "D:\Backups"   # backup em outro disco

  Parametros:
      -Port 8080              Porta da aplicacao
      -AdminEmail email       Administrador inicial (so na primeira instalacao)
      -AdminName "Nome"
      -Https                  Gera certificado proprio e serve por HTTPS
      -BackupDir pasta        Destino do backup diario (padrao C:\DBLAPOGE-backups)
      -BackupTime "12:30"     Horario do backup diario
      -BackupRetentionDays 30
      -EncryptBackups         Pergunta uma senha e cifra os backups (AES-256).
                              Guarde essa senha FORA deste PC: sem ela nao ha restauracao.

  Pode ser executado de novo para atualizar: preserva o .env, os segredos e o
  banco, e migra instalacoes da v1 (usuario do banco sem superusuario).
#>
[CmdletBinding()]
param(
  [int]$Port = 8080,
  [string]$AdminEmail = "admin@laboratorio.local",
  [string]$AdminName = "Administrador",
  [switch]$Https,
  [string]$BackupDir = "C:\DBLAPOGE-backups",
  [string]$BackupTime = "12:30",
  [int]$BackupRetentionDays = 30,
  [string]$BackupPassphrase = "",
  [switch]$EncryptBackups
)

$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "common.ps1")

$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$BackendDir = Join-Path $RepoRoot "backend\local-api"
$LogDir = Join-Path $RepoRoot "logs"
$ServiceName = "DBLAPOGE"
$ServiceAccount = "NT SERVICE\$ServiceName"
$AppDbUser = "dblapoge_app"

function Write-Step($msg) { Write-Host "`n==> $msg" -ForegroundColor Cyan }
function Write-Warn2($msg) { Write-Host "AVISO: $msg" -ForegroundColor Yellow }
function Write-Fail($msg) { Write-Host "ERRO: $msg" -ForegroundColor Red }
function Update-SessionPath {
  $env:Path = [System.Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path", "User")
}

# --- 0. Pre-checagens ---------------------------------------------------------

$os = [System.Environment]::OSVersion.Version
if ($os.Major -lt 10 -or ($os.Major -eq 10 -and $os.Build -lt 17763)) {
  Write-Fail "Este instalador exige Windows 10 (versao 1809 ou mais nova) ou Windows 11."
  exit 1
}
$netRelease = (Get-ItemProperty "HKLM:\SOFTWARE\Microsoft\NET Framework Setup\NDP\v4\Full" -ErrorAction SilentlyContinue).Release
if (-not $netRelease -or $netRelease -lt 461808) {
  Write-Fail ".NET Framework 4.7.2 ou mais novo e necessario (atualize o Windows)."
  exit 1
}
if (-not (Get-Command winget -ErrorAction SilentlyContinue)) {
  Write-Fail "winget nao encontrado. Instale o 'App Installer' pela Microsoft Store e rode de novo:"
  Write-Host "  https://apps.microsoft.com/detail/9nblggh4nns1"
  exit 1
}
if ($BackupTime -notmatch '^\d{1,2}:\d{2}$') { Write-Fail "BackupTime deve estar no formato HH:MM"; exit 1 }
if ($RepoRoot -match "\\(Downloads|Temp|AppData\\Local\\Temp)\\") {
  Write-Warn2 "O projeto parece estar numa pasta temporaria ($RepoRoot). O servico fica registrado apontando para ESTE caminho."
  $answer = Read-Host "Continuar mesmo assim? (s/N)"
  if ($answer -ne "s") { exit 1 }
}

New-Item -ItemType Directory -Force -Path $LogDir, $script:DataDir | Out-Null
Set-RestrictedAcl $script:DataDir

# --- 1. Node.js -----------------------------------------------------------------

Write-Step "Verificando Node.js"
$nodeOk = $false
if (Get-Command node -ErrorAction SilentlyContinue) {
  $major = [int]((node --version).TrimStart("v").Split(".")[0])
  $nodeOk = $major -ge 22
  if (-not $nodeOk) { Write-Warn2 "Node.js $(node --version) e antigo; instalando a versao LTS atual." }
}
if (-not $nodeOk) {
  winget install --id OpenJS.NodeJS.LTS -e --silent --accept-package-agreements --accept-source-agreements
  if ($LASTEXITCODE -ne 0) { Write-Fail "Falha ao instalar Node.js. Instale a versao LTS em https://nodejs.org e rode de novo."; exit 1 }
  Update-SessionPath
}
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  Write-Fail "Node.js instalado mas fora do PATH desta sessao. Abra um novo PowerShell como Administrador e rode de novo."
  exit 1
}
Write-Host "Node.js: $(node --version)"

# --- 2. PostgreSQL ------------------------------------------------------------------

Write-Step "Verificando PostgreSQL"
$pgService = Get-Service -Name "postgresql*" -ErrorAction SilentlyContinue | Select-Object -First 1
$SuperPassFile = Join-Path $script:DataDir "pg_superuser_password.txt"
$LegacySuperPassFile = Join-Path $RepoRoot "windows\.pg_superuser_password.txt"
if ((Test-Path $LegacySuperPassFile) -and -not (Test-Path $SuperPassFile)) {
  # v1 guardava a senha dentro da pasta do projeto; move para ProgramData protegido.
  Move-Item $LegacySuperPassFile $SuperPassFile
  Write-Host "Senha do superusuario movida para $SuperPassFile"
}

if (-not $pgService) {
  Write-Host "Instalando PostgreSQL 16 via winget (alguns minutos)..."
  $pgSuperPassword = New-RandomAlnum 32
  $overrideArgs = "--mode unattended --superpassword `"$pgSuperPassword`" --servicename postgresql-x64-16 --serverport 5432"
  winget install --id PostgreSQL.PostgreSQL.16 -e --silent --accept-package-agreements --accept-source-agreements --override $overrideArgs
  if ($LASTEXITCODE -ne 0) { Write-Fail "Falha ao instalar PostgreSQL. Instale manualmente (postgresql.org) e rode de novo com `$env:PGSUPERPASSWORD definido."; exit 1 }
  Set-Content -Path $SuperPassFile -Value $pgSuperPassword -NoNewline -Encoding ASCII
  Start-Sleep -Seconds 5
  $pgService = Get-Service -Name "postgresql*" -ErrorAction SilentlyContinue | Select-Object -First 1
} elseif (Test-Path $SuperPassFile) {
  $pgSuperPassword = (Get-Content $SuperPassFile -Raw).Trim()
} elseif ($env:PGSUPERPASSWORD) {
  $pgSuperPassword = $env:PGSUPERPASSWORD
  Set-Content -Path $SuperPassFile -Value $pgSuperPassword -NoNewline -Encoding ASCII
} else {
  Write-Fail "Ja existe um PostgreSQL instalado, mas nao tenho a senha do usuario 'postgres'."
  Write-Host '  Rode assim:  $env:PGSUPERPASSWORD = "senha-do-postgres"; .\windows\install-server.ps1'
  exit 1
}
Set-RestrictedAcl $SuperPassFile

if (-not $pgService) { Write-Fail "Servico do PostgreSQL nao encontrado apos a instalacao."; exit 1 }
if ($pgService.Status -ne "Running") { Start-Service $pgService.Name; Start-Sleep -Seconds 3 }
Write-Host "PostgreSQL: servico '$($pgService.Name)' rodando."
$pgBin = Get-PgBinDir
$psql = Join-Path $pgBin "psql.exe"

$env:PGPASSWORD = $pgSuperPassword
$dbExists = & $psql -U postgres -h localhost -tAc "SELECT 1 FROM pg_database WHERE datname='dblapoge'"
if ("$dbExists".Trim() -ne "1") {
  & $psql -U postgres -h localhost -c "CREATE DATABASE dblapoge;"
  if ($LASTEXITCODE -ne 0) { Write-Fail "Nao consegui criar o banco (senha do postgres correta?)"; exit 1 }
}

# --- 3. .env do backend e usuario do banco sem superusuario ------------------------

Write-Step "Configurando segredos (backend\local-api\.env)"
$envPath = Join-Path $BackendDir ".env"
$LanIp = (Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
  Where-Object { $_.InterfaceAlias -notmatch "Loopback|vEthernet|VirtualBox|VMware|Hyper-V" -and $_.IPAddress -notlike "169.254.*" -and $_.PrefixOrigin -ne "WellKnown" } |
  Sort-Object -Property InterfaceMetric | Select-Object -First 1 -ExpandProperty IPAddress)
if (-not $LanIp) { $LanIp = "localhost" }
$scheme = "http"
if ($Https) { $scheme = "https" }
$BaseUrl = "$($scheme)://$($LanIp):$Port"

$envValues = Read-DotEnv $envPath
$firstInstall = -not (Test-Path $envPath)
$AdminPassword = $null
$appDbPassword = $null

if ($envValues["DATABASE_URL"]) {
  $current = ConvertFrom-DatabaseUrl $envValues["DATABASE_URL"]
  if ($current.User -ne $AppDbUser) {
    Write-Host "Migrando da v1: a API passa a usar o usuario '$AppDbUser' (sem superusuario)."
  } else {
    $appDbPassword = $current.Password
  }
}
if (-not $appDbPassword) { $appDbPassword = New-RandomAlnum 32 }

& $psql -v ON_ERROR_STOP=1 -q -U postgres -h localhost -d dblapoge `
  -v "app_user=$AppDbUser" -v "app_pass=$appDbPassword" -v "db=dblapoge" `
  -f (Join-Path $RepoRoot "scripts\db-setup.sql")
if ($LASTEXITCODE -ne 0) { Write-Fail "Falha ao configurar o usuario do banco."; exit 1 }
Remove-Item Env:\PGPASSWORD -ErrorAction SilentlyContinue

if ($firstInstall) {
  $AdminPassword = New-RandomAlnum 16
  Set-DotEnvValue $envPath "PORT" "$Port"
  Set-DotEnvValue $envPath "JWT_SECRET" (New-RandomHex 32)
  Set-DotEnvValue $envPath "SETTINGS_ENCRYPTION_KEY" (New-RandomHex 32)
  Set-DotEnvValue $envPath "INITIAL_ADMIN_EMAIL" $AdminEmail
  Set-DotEnvValue $envPath "INITIAL_ADMIN_PASSWORD" $AdminPassword
  Set-DotEnvValue $envPath "INITIAL_ADMIN_NAME" $AdminName
  Set-DotEnvValue $envPath "SMTP_HOST" ""
  Set-DotEnvValue $envPath "SMTP_PORT" "587"
  Set-DotEnvValue $envPath "SMTP_SECURE" "false"
  Set-DotEnvValue $envPath "SMTP_USER" ""
  Set-DotEnvValue $envPath "SMTP_PASS" ""
  Set-DotEnvValue $envPath "MAIL_FROM" "DBLAPOGE <no-reply@laboratorio.local>"
} else {
  Write-Host ".env existente preservado (segredos e admin mantidos)."
  if (-not $envValues["SETTINGS_ENCRYPTION_KEY"]) {
    # Mantem compatibilidade: sem chave propria a API deriva do JWT_SECRET.
    Write-Host "Dica: defina SETTINGS_ENCRYPTION_KEY no .env para separar a chave dos segredos de backup."
  }
}
Set-DotEnvValue $envPath "DATABASE_URL" "postgres://$($AppDbUser):$appDbPassword@localhost:5432/dblapoge"
Set-DotEnvValue $envPath "CORS_ORIGIN" $BaseUrl
Set-DotEnvValue $envPath "PUBLIC_APP_URL" "$BaseUrl/reset-password"
Set-DotEnvValue $envPath "FRONTEND_DIST_PATH" (Join-Path $RepoRoot "dist")
Set-DotEnvValue $envPath "NODE_ENV" "production"
Set-DotEnvValue $envPath "TRUST_PROXY" ""

# --- 4. HTTPS opcional (certificado proprio) ------------------------------------------

$pfxPath = Join-Path $script:DataDir "https.pfx"
$cerPath = Join-Path $RepoRoot "windows\dblapoge-certificado.cer"
if ($Https) {
  Write-Step "Configurando HTTPS com certificado local"
  $existing = Read-DotEnv $envPath
  if (-not (Test-Path $pfxPath) -or -not $existing["HTTPS_PFX_PASSPHRASE"]) {
    $hostName = [System.Net.Dns]::GetHostName()
    $san = "2.5.29.17={text}DNS=$hostName&DNS=localhost&IPAddress=127.0.0.1"
    if ($LanIp -ne "localhost") { $san += "&IPAddress=$LanIp" }
    $cert = New-SelfSignedCertificate -Subject "CN=DBLAPOGE ($hostName)" -FriendlyName "DBLAPOGE" `
      -CertStoreLocation "Cert:\LocalMachine\My" -KeyAlgorithm RSA -KeyLength 2048 -KeyExportPolicy Exportable `
      -NotAfter (Get-Date).AddYears(5) -TextExtension @($san, "2.5.29.37={text}1.3.6.1.5.5.7.3.1")
    $pfxPass = New-RandomAlnum 32
    $secure = ConvertTo-SecureString $pfxPass -AsPlainText -Force
    try {
      # AES-256: o Node (OpenSSL 3) nao le PFX com as cifras antigas padrao do Windows.
      Export-PfxCertificate -Cert $cert -FilePath $pfxPath -Password $secure -CryptoAlgorithmOption AES256_SHA256 | Out-Null
    } catch {
      Write-Fail "Este Windows nao exporta PFX com AES-256 (precisa do Windows 10 1809+ atualizado)."
      exit 1
    }
    Export-Certificate -Cert $cert -FilePath $cerPath | Out-Null
    # O proprio servidor confia no certificado (para o teste final e acesso local).
    Import-Certificate -FilePath $cerPath -CertStoreLocation "Cert:\LocalMachine\Root" | Out-Null
    Set-DotEnvValue $envPath "HTTPS_PFX_PASSPHRASE" $pfxPass
    Write-Host "Certificado criado. Instale '$cerPath' nos outros PCs (ver windows\README.md)."
  }
  Set-DotEnvValue $envPath "HTTPS_PFX_PATH" $pfxPath
  Set-DotEnvValue $envPath "HTTPS" "true"
} else {
  Set-DotEnvValue $envPath "HTTPS_PFX_PATH" ""
  Set-DotEnvValue $envPath "HTTPS" "false"
}

# --- 5. Dependencias e build ----------------------------------------------------------

Write-Step "Instalando dependencias do backend"
Push-Location $BackendDir
npm ci --omit=dev --no-audit --no-fund
if ($LASTEXITCODE -ne 0) { Write-Fail "npm ci do backend falhou."; Pop-Location; exit 1 }
Pop-Location

Write-Step "Build do frontend (alguns minutos na primeira vez)"
Push-Location $RepoRoot
$env:VITE_API_URL = ""
npm ci --no-audit --no-fund
if ($LASTEXITCODE -ne 0) { Write-Fail "npm ci do frontend falhou."; Pop-Location; exit 1 }
npm run build
if ($LASTEXITCODE -ne 0) { Write-Fail "Build do frontend falhou."; Pop-Location; exit 1 }
Pop-Location

# --- 6. Servico do Windows (conta virtual sem privilegios) -------------------------------

Write-Step "Registrando o servico do Windows"
if (-not (Get-Command nssm -ErrorAction SilentlyContinue)) {
  winget install --id NSSM.NSSM -e --silent --accept-package-agreements --accept-source-agreements
  Update-SessionPath
}
if (-not (Get-Command nssm -ErrorAction SilentlyContinue)) {
  Write-Fail "Nao encontrei o nssm. Baixe em https://nssm.cc/download, adicione ao PATH e rode de novo."
  exit 1
}

$nodeExe = (Get-Command node).Source
$serverScript = Join-Path $BackendDir "src\server.js"
$svc = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
if ($svc) {
  Write-Host "Servico '$ServiceName' ja existe, atualizando..."
  nssm stop $ServiceName 2>$null | Out-Null
  nssm set $ServiceName Application $nodeExe | Out-Null
  nssm set $ServiceName AppParameters "`"$serverScript`"" | Out-Null
} else {
  nssm install $ServiceName $nodeExe "`"$serverScript`"" | Out-Null
}
nssm set $ServiceName AppDirectory $BackendDir | Out-Null
nssm set $ServiceName DisplayName "DBLAPOGE (banco de dados do laboratorio)" | Out-Null
nssm set $ServiceName AppStdout (Join-Path $LogDir "service.log") | Out-Null
nssm set $ServiceName AppStderr (Join-Path $LogDir "service-error.log") | Out-Null
nssm set $ServiceName AppRotateFiles 1 | Out-Null
nssm set $ServiceName AppRotateBytes 10485760 | Out-Null
nssm set $ServiceName Start SERVICE_AUTO_START | Out-Null
nssm set $ServiceName AppRestartDelay 5000 | Out-Null

# Roda com a conta virtual "NT SERVICE\DBLAPOGE" em vez de LocalSystem: uma
# falha no Node nao vira controle total do PC.
& sc.exe config $ServiceName obj= $ServiceAccount | Out-Null
# Leitura herdada por toda a pasta do projeto (sem /T: a heranca ja propaga).
& icacls.exe $RepoRoot /grant "$($ServiceAccount):(OI)(CI)RX" /C /Q | Out-Null
& icacls.exe $LogDir /grant "$($ServiceAccount):(OI)(CI)M" /T /C /Q | Out-Null
# Segredos: so Administradores, SYSTEM e (leitura) o servico.
Set-RestrictedAcl $envPath $ServiceAccount
if (Test-Path $pfxPath) { Set-RestrictedAcl $pfxPath $ServiceAccount }

nssm start $ServiceName | Out-Null

# --- 7. Backup diario -----------------------------------------------------------------

Write-Step "Agendando o backup diario ($BackupTime -> $BackupDir)"
if (-not (Test-Path $BackupDir)) {
  New-Item -ItemType Directory -Force -Path $BackupDir | Out-Null
  Set-RestrictedAcl $BackupDir
}
# Pasta ja existente (ex.: pasta sincronizada do Google Drive/OneDrive): as
# permissoes nao sao alteradas, para nao atrapalhar a sincronizacao.
@{ BackupDir = $BackupDir; RetentionDays = $BackupRetentionDays } | ConvertTo-Json |
  Set-Content -Path (Join-Path $script:DataDir "backup.json") -Encoding UTF8
$passFile = Join-Path $script:DataDir "backup_passphrase.txt"
if ($EncryptBackups -and -not $BackupPassphrase) {
  $p1 = Read-Host "Senha para cifrar os backups (min. 12 caracteres)" -AsSecureString
  $p2 = Read-Host "Repita a senha" -AsSecureString
  $toPlain = { param($sec) [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($sec)) }
  $a = & $toPlain $p1; $b = & $toPlain $p2
  if ($a -ne $b -or $a.Length -lt 12) { Write-Fail "Senhas diferentes ou curtas demais."; exit 1 }
  $BackupPassphrase = $a
}
if ($BackupPassphrase) {
  Set-Content -Path $passFile -Value $BackupPassphrase -NoNewline -Encoding UTF8
  Set-RestrictedAcl $passFile
}
$backupScript = Join-Path $RepoRoot "windows\backup-db.ps1"
$action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$backupScript`""
$trigger = New-ScheduledTaskTrigger -Daily -At $BackupTime
# StartWhenAvailable: se o PC estava desligado no horario, roda assim que ligar.
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -ExecutionTimeLimit (New-TimeSpan -Hours 2) -RestartCount 2 -RestartInterval (New-TimeSpan -Minutes 15)
$principal = New-ScheduledTaskPrincipal -UserId "SYSTEM" -LogonType ServiceAccount -RunLevel Highest
Register-ScheduledTask -TaskName "DBLAPOGE Backup" -Action $action -Trigger $trigger -Settings $settings -Principal $principal -Force | Out-Null

# --- 8. Firewall ----------------------------------------------------------------------

Write-Step "Liberando a porta $Port no Firewall (so rede privada/dominio e sub-rede local)"
Get-NetFirewallRule -DisplayName $ServiceName -ErrorAction SilentlyContinue | Remove-NetFirewallRule
New-NetFirewallRule -DisplayName $ServiceName -Direction Inbound -Protocol TCP -LocalPort $Port -Action Allow `
  -Profile Domain,Private -RemoteAddress LocalSubnet | Out-Null
$profiles = Get-NetConnectionProfile -ErrorAction SilentlyContinue | Where-Object { $_.NetworkCategory -eq "Public" }
if ($profiles) {
  Write-Warn2 "A rede '$($profiles[0].Name)' esta como PUBLICA: os outros PCs nao vao conseguir acessar."
  Write-Warn2 "Se for a rede do laboratorio, mude para Privada em Configuracoes > Rede > Propriedades."
}

# --- 9. Checagem final e primeiro backup --------------------------------------------------

Write-Step "Verificando se a aplicacao subiu"
$ok = $false
for ($i = 0; $i -lt 20; $i++) {
  Start-Sleep -Seconds 2
  try {
    $resp = Invoke-WebRequest -Uri "$($scheme)://localhost:$Port/health" -UseBasicParsing -TimeoutSec 3
    if ($resp.StatusCode -eq 200) { $ok = $true; break }
  } catch { Write-Verbose "aguardando a API... ($($_.Exception.Message))" }
}
if (-not $ok) {
  Write-Fail "A aplicacao nao respondeu em $($scheme)://localhost:$Port/health."
  Write-Fail "Veja o log: $LogDir\service-error.log"
  exit 1
}

Write-Host "Rodando o primeiro backup..."
& powershell.exe -NoProfile -ExecutionPolicy Bypass -File $backupScript
if ($LASTEXITCODE -ne 0) { Write-Warn2 "O primeiro backup falhou; veja $LogDir\backup.log" }

Write-Host ""
Write-Host "=================================================================" -ForegroundColor Green
Write-Host " DBLAPOGE v2 instalado!" -ForegroundColor Green
Write-Host "=================================================================" -ForegroundColor Green
Write-Host " Endereco para os outros computadores (navegador):"
Write-Host "   $BaseUrl" -ForegroundColor Yellow
if ($AdminPassword) {
  Write-Host ""
  Write-Host " Login inicial do administrador:"
  Write-Host "   Email: $AdminEmail"
  Write-Host "   Senha: $AdminPassword" -ForegroundColor Yellow
  Write-Host "   -> Troque em Configuracoes > Seguranca da conta apos o primeiro login."
}
if ($Https) {
  Write-Host ""
  $thumb = (New-Object System.Security.Cryptography.X509Certificates.X509Certificate2($cerPath)).Thumbprint
  Write-Host " HTTPS: instale o certificado nos outros PCs (uma vez por PC):"
  Write-Host "   $cerPath  (ver windows\README.md)"
  Write-Host "   Impressao digital para conferir: $thumb"
} else {
  Write-Host ""
  Write-Host " Acesso em HTTP simples (sem criptografia na rede). Para HTTPS rode de novo com -Https."
}
Write-Host ""
Write-Host " Backup diario as $BackupTime em $BackupDir (retencao $BackupRetentionDays dias)."
if (-not $BackupPassphrase -and -not (Test-Path $passFile)) {
  Write-Host "   Backups SEM criptografia. Para cifrar: rode de novo com -EncryptBackups."
}
Write-Host "   Copie essa pasta periodicamente para outro lugar (HD externo ou nuvem)."
Write-Host ""
Write-Host " Logs: $LogDir"
