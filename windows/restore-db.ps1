#Requires -RunAsAdministrator
<#
  Restaura um backup gerado por backup-db.ps1.
      .\windows\restore-db.ps1 -File "D:\DBLAPOGE-backups\dblapoge_2026-09-26_123000.dump.enc"
  ATENCAO: substitui TODO o conteudo atual do banco. O servico e parado
  durante a restauracao e religado no final.
#>
[CmdletBinding()]
param([Parameter(Mandatory = $true)][string]$File)
$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "common.ps1")
$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path

if (-not (Test-Path $File)) { throw "Arquivo nao encontrado: $File" }
if (Test-Path "$File.sha256") {
  $expected = ((Get-Content "$File.sha256" -Raw).Trim() -split '\s+')[0]
  $actual = (Get-FileHash -Algorithm SHA256 -Path $File).Hash.ToLower()
  if ($expected -ne $actual) { throw "Checksum nao confere: o arquivo pode estar corrompido." }
  Write-Host "Checksum OK."
}

$envValues = Read-DotEnv (Join-Path $RepoRoot "backend\local-api\.env")
$db = ConvertFrom-DatabaseUrl $envValues["DATABASE_URL"]
$pgBin = Get-PgBinDir
$superPassFile = Join-Path $script:DataDir "pg_superuser_password.txt"
if (-not (Test-Path $superPassFile)) { throw "Senha do superusuario nao encontrada em $superPassFile" }
$superPass = (Get-Content $superPassFile -Raw).Trim()

$dump = $File
$temp = $null
if ($File.EndsWith(".enc")) {
  $secure = Read-Host "Senha do backup" -AsSecureString
  $plain = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure))
  $temp = Join-Path $env:TEMP ("dblapoge_restore_" + [guid]::NewGuid().ToString() + ".dump")
  try { Unprotect-FileOpenSsl $File $temp $plain } catch { throw "Nao foi possivel decifrar: senha incorreta ou arquivo corrompido." }
  $dump = $temp
}

$confirm = Read-Host "Isto vai SUBSTITUIR o banco atual. Digite RESTAURAR para continuar"
if ($confirm -ne "RESTAURAR") { Write-Host "Cancelado."; if ($temp) { Remove-Item $temp -Force }; exit 1 }

Write-Host "Parando o servico DBLAPOGE..."
& nssm stop DBLAPOGE 2>$null | Out-Null
try {
  $env:PGPASSWORD = $superPass
  & (Join-Path $pgBin "pg_restore.exe") --clean --if-exists --no-owner "--role=$($db.User)" `
    -h $db.Host -p $db.Port -U postgres -d $db.Database $dump
  if ($LASTEXITCODE -ne 0) { Write-Warning "pg_restore terminou com avisos (codigo $LASTEXITCODE). Confira os dados." }
} finally {
  Remove-Item Env:\PGPASSWORD -ErrorAction SilentlyContinue
  if ($temp) { Remove-Item $temp -Force -ErrorAction SilentlyContinue }
  & nssm start DBLAPOGE | Out-Null
}
Write-Host "Restauracao concluida e servico religado."
