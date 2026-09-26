# Funcoes compartilhadas pelos scripts do DBLAPOGE no Windows.
# Compativel com Windows PowerShell 5.1 (padrao do Windows 10/11).

$programData = $env:ProgramData
if (-not $programData) { $programData = "C:\ProgramData" }
$script:DataDir = Join-Path $programData "DBLAPOGE"

function Get-PgBinDir {
  if ($env:DBLAPOGE_PG_BIN) { return $env:DBLAPOGE_PG_BIN }
  $candidates = Get-ChildItem "C:\Program Files\PostgreSQL\*\bin\pg_dump.exe" -ErrorAction SilentlyContinue |
    Sort-Object { [int]($_.Directory.Parent.Name -replace '\D', '') } -Descending
  if (-not $candidates) { throw "PostgreSQL nao encontrado em C:\Program Files\PostgreSQL\*\bin" }
  return $candidates[0].Directory.FullName
}

function Read-DotEnv([string]$Path) {
  $values = @{}
  if (-not (Test-Path $Path)) { return $values }
  foreach ($line in Get-Content -Path $Path -Encoding UTF8) {
    $t = $line.Trim()
    if ($t -eq "" -or $t.StartsWith("#")) { continue }
    $idx = $t.IndexOf("=")
    if ($idx -lt 1) { continue }
    $k = $t.Substring(0, $idx).Trim().TrimStart([char]0xFEFF)
    $v = $t.Substring($idx + 1).Trim()
    if ($v.Length -ge 2 -and (($v.StartsWith('"') -and $v.EndsWith('"')) -or ($v.StartsWith("'") -and $v.EndsWith("'")))) {
      $v = $v.Substring(1, $v.Length - 2)
    }
    $values[$k] = $v
  }
  return $values
}

function Set-DotEnvValue([string]$Path, [string]$Key, [string]$Value) {
  $lines = @()
  if (Test-Path $Path) { $lines = @(Get-Content -Path $Path -Encoding UTF8) }
  $found = $false
  for ($i = 0; $i -lt $lines.Count; $i++) {
    if ($lines[$i] -match "^\s*$([regex]::Escape($Key))\s*=") { $lines[$i] = "$Key=$Value"; $found = $true }
  }
  if (-not $found) { $lines += "$Key=$Value" }
  # UTF-8 sem BOM (o dotenv do Node aceita os dois, mas evita surpresas).
  [System.IO.File]::WriteAllLines($Path, [string[]]$lines, (New-Object System.Text.UTF8Encoding($false)))
}

function ConvertFrom-DatabaseUrl([string]$Url) {
  if ($Url -notmatch '^postgres(?:ql)?://([^:]+):([^@]*)@([^:/]+)(?::(\d+))?/([^?]+)') {
    throw "DATABASE_URL em formato inesperado"
  }
  $port = 5432
  if ($Matches[4]) { $port = [int]$Matches[4] }
  return @{
    User = [uri]::UnescapeDataString($Matches[1]); Password = [uri]::UnescapeDataString($Matches[2])
    Host = $Matches[3]; Port = $port; Database = $Matches[5]
  }
}

function New-RandomAlnum([int]$Length = 24) {
  # RNG criptografico com rejection sampling (sem vies). So alfanumericos:
  # senhas do banco vao dentro da DATABASE_URL.
  $chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789"
  $limit = 256 - (256 % $chars.Length)
  $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
  $one = New-Object byte[] 1
  $sb = New-Object System.Text.StringBuilder
  while ($sb.Length -lt $Length) {
    $rng.GetBytes($one)
    if ($one[0] -lt $limit) { [void]$sb.Append($chars[$one[0] % $chars.Length]) }
  }
  return $sb.ToString()
}

function New-RandomHex([int]$Bytes = 32) {
  $buffer = New-Object byte[] $Bytes
  [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($buffer)
  return (-join ($buffer | ForEach-Object { $_.ToString("x2") }))
}

# Restringe um arquivo/pasta a Administradores e SYSTEM (+ leitura opcional
# para a conta do servico). Usa icacls, que funciona igual em qualquer Windows.
function Set-RestrictedAcl([string]$Path, [string]$ReadAccount = "") {
  $isDir = (Get-Item $Path).PSIsContainer
  $inh = ""
  if ($isDir) { $inh = "(OI)(CI)" }
  $grants = @("*S-1-5-32-544:$($inh)F", "*S-1-5-18:$($inh)F")
  if ($ReadAccount) { $grants += "$($ReadAccount):$($inh)RX" }
  $icaclsArgs = @($Path, "/inheritance:r")
  foreach ($g in $grants) { $icaclsArgs += "/grant:r"; $icaclsArgs += $g }
  & icacls.exe @icaclsArgs | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "icacls falhou em $Path" }
}

# --- Criptografia de arquivos compativel com o openssl -----------------------
#   openssl enc -aes-256-cbc -pbkdf2 -iter 200000 -md sha256 -salt
# Formato: "Salted__" + salt(8) + AES-256-CBC(PKCS7), chave+IV via PBKDF2-SHA256.
$script:BackupKdfIterations = 200000

function Get-OpenSslKeyIv([string]$Passphrase, [byte[]]$Salt) {
  $kdf = New-Object System.Security.Cryptography.Rfc2898DeriveBytes(
    $Passphrase, $Salt, $script:BackupKdfIterations, [System.Security.Cryptography.HashAlgorithmName]::SHA256)
  $bytes = $kdf.GetBytes(48)
  $key = New-Object byte[] 32
  $iv = New-Object byte[] 16
  [Array]::Copy($bytes, 0, $key, 0, 32)
  [Array]::Copy($bytes, 32, $iv, 0, 16)
  return @($key, $iv)
}

function Protect-FileOpenSsl([string]$InFile, [string]$OutFile, [string]$Passphrase) {
  $salt = New-Object byte[] 8
  [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($salt)
  $ki = Get-OpenSslKeyIv $Passphrase $salt
  $aes = [System.Security.Cryptography.Aes]::Create()
  $aes.Mode = [System.Security.Cryptography.CipherMode]::CBC
  $aes.Padding = [System.Security.Cryptography.PaddingMode]::PKCS7
  $aes.Key = $ki[0]; $aes.IV = $ki[1]
  $out = [System.IO.File]::Create($OutFile)
  try {
    $magic = [System.Text.Encoding]::ASCII.GetBytes("Salted__")
    $out.Write($magic, 0, 8); $out.Write($salt, 0, 8)
    $crypto = New-Object System.Security.Cryptography.CryptoStream($out, $aes.CreateEncryptor(), [System.Security.Cryptography.CryptoStreamMode]::Write)
    $in = [System.IO.File]::OpenRead($InFile)
    try { $in.CopyTo($crypto) } finally { $in.Dispose() }
    $crypto.FlushFinalBlock(); $crypto.Dispose()
  } finally { $out.Dispose(); $aes.Dispose() }
}

function Unprotect-FileOpenSsl([string]$InFile, [string]$OutFile, [string]$Passphrase) {
  $in = [System.IO.File]::OpenRead($InFile)
  try {
    $header = New-Object byte[] 16
    if ($in.Read($header, 0, 16) -ne 16 -or [System.Text.Encoding]::ASCII.GetString($header, 0, 8) -ne "Salted__") {
      throw "Arquivo nao esta no formato esperado (Salted__)"
    }
    $salt = New-Object byte[] 8
    [Array]::Copy($header, 8, $salt, 0, 8)
    $ki = Get-OpenSslKeyIv $Passphrase $salt
    $aes = [System.Security.Cryptography.Aes]::Create()
    $aes.Mode = [System.Security.Cryptography.CipherMode]::CBC
    $aes.Padding = [System.Security.Cryptography.PaddingMode]::PKCS7
    $aes.Key = $ki[0]; $aes.IV = $ki[1]
    $crypto = New-Object System.Security.Cryptography.CryptoStream($in, $aes.CreateDecryptor(), [System.Security.Cryptography.CryptoStreamMode]::Read)
    $out = [System.IO.File]::Create($OutFile)
    try { $crypto.CopyTo($out) } finally { $out.Dispose(); $crypto.Dispose(); $aes.Dispose() }
  } finally { $in.Dispose() }
}
