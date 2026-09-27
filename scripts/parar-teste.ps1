<#
  Para o DBLAPOGE de teste que roda no Docker.
      powershell -ExecutionPolicy Bypass -File .\scripts\parar-teste.ps1          (para, guarda os dados)
      powershell -ExecutionPolicy Bypass -File .\scripts\parar-teste.ps1 -Apagar  (para e APAGA o banco de teste)
#>
param([switch]$Apagar)
$Root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
Set-Location $Root
if ($Apagar) {
  docker compose -f docker-compose.local.yml -f docker-compose.lan.yml down -v
  Remove-Item (Join-Path $Root ".env"), (Join-Path $Root "LOGIN-DE-TESTE.txt") -ErrorAction SilentlyContinue
  Write-Host "Teste parado e banco de teste apagado. Para comecar do zero: scripts\testar-no-meu-pc.ps1"
} else {
  docker compose -f docker-compose.local.yml -f docker-compose.lan.yml stop
  Write-Host "Teste parado (dados guardados). Para voltar: scripts\testar-no-meu-pc.ps1"
}
