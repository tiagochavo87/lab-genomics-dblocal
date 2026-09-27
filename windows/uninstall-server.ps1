#Requires -RunAsAdministrator
<#
  Remove o servico, a tarefa de backup e a regra de firewall do DBLAPOGE.
  NAO apaga o banco de dados, os backups nem a pasta do projeto.
#>
$ErrorActionPreference = "Stop"
$ServiceName = "DBLAPOGE"

if (Get-Command nssm -ErrorAction SilentlyContinue) {
  Write-Host "Parando e removendo o servico '$ServiceName'..."
  nssm stop $ServiceName 2>$null | Out-Null
  nssm remove $ServiceName confirm 2>$null | Out-Null
} else {
  Write-Host "nssm nao encontrado - remova o servico pelo services.msc se ainda existir."
}
if (Get-ScheduledTask -TaskName "DBLAPOGE Backup" -ErrorAction SilentlyContinue) {
  Unregister-ScheduledTask -TaskName "DBLAPOGE Backup" -Confirm:$false
  Write-Host "Tarefa de backup removida."
}
if (Get-NetFirewallRule -DisplayName $ServiceName -ErrorAction SilentlyContinue) {
  Remove-NetFirewallRule -DisplayName $ServiceName
  Write-Host "Regra de firewall removida."
}
Write-Host ""
Write-Host "Removido. Banco ('dblapoge'), backups e pasta do projeto foram mantidos."
Write-Host "Para reinstalar: .\windows\install-server.ps1"
