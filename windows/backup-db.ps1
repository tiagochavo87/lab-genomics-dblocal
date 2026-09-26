<#
  Backup diario do banco do DBLAPOGE (pg_dump), agendado pelo instalador no
  Agendador de Tarefas do Windows. Pode ser executado manualmente:
      .\windows\backup-db.ps1
  Configuracao em C:\ProgramData\DBLAPOGE\backup.json (criado pelo instalador):
      BackupDir      pasta de destino (de preferencia outro disco ou pasta
                     sincronizada com a nuvem, ex.: Google Drive/OneDrive)
      RetentionDays  quantos dias manter
  Se existir C:\ProgramData\DBLAPOGE\backup_passphrase.txt, o arquivo sai
  cifrado (AES-256, compativel com openssl):
      openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 -md sha256 -in X.dump.enc -out X.dump
#>
[CmdletBinding()]
param(
  [string]$BackupDir = "",
  [int]$RetentionDays = 0
)
$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "common.ps1")

$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$logFile = Join-Path $RepoRoot "logs\backup.log"
New-Item -ItemType Directory -Force -Path (Split-Path $logFile) | Out-Null
function Log([string]$msg) {
  $line = "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') $msg"
  Add-Content -Path $logFile -Value $line -Encoding UTF8
  Write-Host $line
}

try {
  $cfgPath = Join-Path $script:DataDir "backup.json"
  $cfg = $null
  if (Test-Path $cfgPath) { $cfg = Get-Content $cfgPath -Raw -Encoding UTF8 | ConvertFrom-Json }
  if (-not $BackupDir) { if ($cfg -and $cfg.BackupDir) { $BackupDir = $cfg.BackupDir } else { $BackupDir = "C:\DBLAPOGE-backups" } }
  if ($RetentionDays -le 0) { if ($cfg -and $cfg.RetentionDays) { $RetentionDays = [int]$cfg.RetentionDays } else { $RetentionDays = 30 } }

  $envValues = Read-DotEnv (Join-Path $RepoRoot "backend\local-api\.env")
  if (-not $envValues["DATABASE_URL"]) { throw "DATABASE_URL nao encontrada em backend\local-api\.env" }
  $db = ConvertFrom-DatabaseUrl $envValues["DATABASE_URL"]
  $pgBin = Get-PgBinDir

  New-Item -ItemType Directory -Force -Path $BackupDir | Out-Null
  $stamp = Get-Date -Format "yyyy-MM-dd_HHmmss"
  $dump = Join-Path $BackupDir "dblapoge_$stamp.dump"
  $partial = "$dump.partial"

  $env:PGPASSWORD = $db.Password
  & (Join-Path $pgBin "pg_dump.exe") --format=custom --compress=6 --no-owner `
    -h $db.Host -p $db.Port -U $db.User -d $db.Database -f $partial
  $code = $LASTEXITCODE
  Remove-Item Env:\PGPASSWORD -ErrorAction SilentlyContinue
  if ($code -ne 0) { Remove-Item $partial -ErrorAction SilentlyContinue; throw "pg_dump falhou (codigo $code)" }

  $final = $dump
  $passFile = Join-Path $script:DataDir "backup_passphrase.txt"
  if (Test-Path $passFile) {
    $pass = (Get-Content $passFile -Raw -Encoding UTF8).Trim()
    $final = "$dump.enc"
    Protect-FileOpenSsl $partial "$final.partial" $pass
    Remove-Item $partial
    Move-Item "$final.partial" $final
  } else {
    Move-Item $partial $final
  }

  $hash = (Get-FileHash -Algorithm SHA256 -Path $final).Hash.ToLower()
  Set-Content -Path "$final.sha256" -Value "$hash  $(Split-Path $final -Leaf)" -Encoding ASCII

  $limit = (Get-Date).AddDays(-$RetentionDays)
  Get-ChildItem -Path $BackupDir -Filter "dblapoge_*" -File |
    Where-Object { $_.LastWriteTime -lt $limit } | Remove-Item -Force

  Set-Content -Path (Join-Path $BackupDir "ULTIMO_BACKUP_OK.txt") -Value (Get-Date -Format "yyyy-MM-dd HH:mm:ss") -Encoding ASCII
  $size = "{0:N1} MB" -f ((Get-Item $final).Length / 1MB)
  Log "OK: $(Split-Path $final -Leaf) ($size) em $BackupDir"
  exit 0
} catch {
  Log "ERRO: $($_.Exception.Message)"
  exit 1
}
