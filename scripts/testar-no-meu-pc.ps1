<#
  Sobe o DBLAPOGE no seu computador para TESTE, usando o Docker Desktop.
  Nao instala nada no Windows: tudo roda dentro do Docker.

  Como usar (no terminal do VS Code, dentro da pasta do projeto):
      powershell -ExecutionPolicy Bypass -File .\scripts\testar-no-meu-pc.ps1

  Para parar/apagar o teste depois:
      powershell -ExecutionPolicy Bypass -File .\scripts\parar-teste.ps1
#>
# "Continue": no PowerShell 5.1, avisos que o docker escreve no stderr nao
# podem virar erro fatal; cada passo confere o $LASTEXITCODE.
$ErrorActionPreference = "Continue"
$Root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
Set-Location $Root

function Say($msg) { Write-Host "`n==> $msg" -ForegroundColor Cyan }
function Fail($msg) { Write-Host "`nPROBLEMA: $msg" -ForegroundColor Red; exit 1 }

function New-Hex([int]$Bytes) {
  $b = New-Object byte[] $Bytes
  [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($b)
  return (-join ($b | ForEach-Object { $_.ToString("x2") }))
}
function New-Password([int]$Length) {
  $chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789"
  $limit = 256 - (256 % $chars.Length)
  $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
  $one = New-Object byte[] 1
  $sb = New-Object System.Text.StringBuilder
  while ($sb.Length -lt $Length) { $rng.GetBytes($one); if ($one[0] -lt $limit) { [void]$sb.Append($chars[$one[0] % $chars.Length]) } }
  return $sb.ToString()
}
function Test-PortFree([int]$Port) {
  $l = $null
  try { $l = New-Object System.Net.Sockets.TcpListener([System.Net.IPAddress]::Loopback, $Port); $l.Start(); return $true }
  catch { return $false }
  finally { if ($l) { $l.Stop() } }
}
function Get-FreePort([int[]]$Candidates) {
  foreach ($p in $Candidates) { if (Test-PortFree $p) { return $p } }
  Fail "Nenhuma porta livre entre $($Candidates -join ', ')."
}

# 1. Docker ligado?
Say "Verificando o Docker"
if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
  Fail "Docker nao encontrado. Instale o Docker Desktop (docker.com) e rode de novo."
}
docker info *> $null
if ($LASTEXITCODE -ne 0) {
  Fail "O Docker Desktop nao esta aberto. Abra o Docker Desktop, espere aparecer 'Engine running' e rode este comando de novo."
}
Write-Host "Docker OK."

# 2. Arquivo .env com senhas (so na primeira vez)
$envFile = Join-Path $Root ".env"
$loginFile = Join-Path $Root "LOGIN-DE-TESTE.txt"
if (-not (Test-Path $envFile)) {
  Say "Criando configuracao de teste (.env) com senhas aleatorias"
  $webPort = Get-FreePort @(8080, 8090, 8888, 18080)
  $pgPort = Get-FreePort @(55432, 55433, 55434)
  $apiPort = Get-FreePort @(53001, 53002, 53003)
  $adminEmail = "admin@teste.local"
  $adminPass = New-Password 16
  $lines = @(
    "# Gerado por scripts\testar-no-meu-pc.ps1 - SOMENTE PARA TESTE",
    "POSTGRES_PASSWORD=$(New-Hex 24)",
    "APP_DB_PASSWORD=$(New-Hex 24)",
    "JWT_SECRET=$(New-Hex 32)",
    "SETTINGS_ENCRYPTION_KEY=$(New-Hex 32)",
    "INITIAL_ADMIN_EMAIL=$adminEmail",
    "INITIAL_ADMIN_PASSWORD=$adminPass",
    "INITIAL_ADMIN_NAME=Administrador (teste)",
    "WEB_PORT=$webPort",
    "PG_HOST_PORT=$pgPort",
    "API_HOST_PORT=$apiPort",
    "CORS_ORIGIN=http://localhost:$webPort",
    "PUBLIC_APP_URL=http://localhost:$webPort/reset-password",
    "BACKUP_TIME=12:30",
    "BACKUP_RETENTION_DAYS=7",
    "BACKUP_HOST_DIR=./backups",
    "TZ=America/Sao_Paulo"
  )
  [System.IO.File]::WriteAllLines($envFile, [string[]]$lines, (New-Object System.Text.UTF8Encoding($false)))
  $login = @(
    "DBLAPOGE - acesso de TESTE (use so dados ficticios)",
    "",
    "Endereco: http://localhost:$webPort",
    "E-mail:   $adminEmail",
    "Senha:    $adminPass"
  )
  [System.IO.File]::WriteAllLines($loginFile, [string[]]$login, (New-Object System.Text.UTF8Encoding($false)))
} else {
  Say "Usando o .env que ja existe (teste anterior)"
}

$webPort = ((Get-Content $envFile | Where-Object { $_ -match '^WEB_PORT=' }) -replace '^WEB_PORT=', '')
if (-not $webPort) { $webPort = "8080" }
$url = "http://localhost:$webPort"

# 3. Subir os containers
Say "Subindo o sistema no Docker (na primeira vez demora de 3 a 10 minutos)"
docker compose -f docker-compose.local.yml -f docker-compose.lan.yml up -d --build
if ($LASTEXITCODE -ne 0) { Fail "O Docker nao conseguiu subir o sistema. Copie as mensagens acima e mande para o Claude." }

# 4. Esperar ficar pronto
Say "Esperando o sistema responder em $url"
$ok = $false
for ($i = 0; $i -lt 90; $i++) {
  try {
    $r = Invoke-WebRequest -Uri "$url/health" -UseBasicParsing -TimeoutSec 3
    if ($r.StatusCode -eq 200) { $ok = $true; break }
  } catch { Start-Sleep -Seconds 2 }
}
if (-not $ok) {
  Write-Host "Ultimas mensagens da API:" -ForegroundColor Yellow
  docker compose -f docker-compose.local.yml -f docker-compose.lan.yml logs --tail 40 api
  Fail "O sistema nao respondeu. Copie as mensagens acima e mande para o Claude."
}

Write-Host ""
Write-Host "==========================================================" -ForegroundColor Green
Write-Host " DBLAPOGE rodando no seu PC!" -ForegroundColor Green
Write-Host "==========================================================" -ForegroundColor Green
Get-Content $loginFile | ForEach-Object { Write-Host " $_" }
Write-Host ""
Write-Host " (esses dados tambem estao no arquivo LOGIN-DE-TESTE.txt)"
Start-Process $url
