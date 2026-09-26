#Requires -RunAsAdministrator
<#
  Rode UMA vez em cada computador que vai acessar o DBLAPOGE por HTTPS
  (instalacao com -Https). Faz o Windows confiar no certificado do servidor,
  e o navegador para de mostrar o aviso de "conexao nao segura".
      .\confiar-certificado.ps1 -Arquivo .\dblapoge-certificado.cer
#>
param([string]$Arquivo = (Join-Path $PSScriptRoot "dblapoge-certificado.cer"))
$ErrorActionPreference = "Stop"
if (-not (Test-Path $Arquivo)) { throw "Certificado nao encontrado: $Arquivo (copie-o do servidor, pasta windows\)" }
$cert = New-Object System.Security.Cryptography.X509Certificates.X509Certificate2($Arquivo)
Write-Host "Certificado: $($cert.Subject)  valido ate $($cert.NotAfter.ToString('dd/MM/yyyy'))"
Write-Host "Impressao digital: $($cert.Thumbprint)"
$ok = Read-Host "Confira a impressao digital com a exibida no servidor. Confiar neste certificado? (s/N)"
if ($ok -ne "s") { Write-Host "Cancelado."; exit 1 }
Import-Certificate -FilePath $Arquivo -CertStoreLocation "Cert:\LocalMachine\Root" | Out-Null
Write-Host "Pronto. Feche e abra o navegador."
