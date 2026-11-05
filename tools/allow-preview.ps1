#Requires -RunAsAdministrator
$ErrorActionPreference = 'Stop'
$previewNode = (Get-Command node).Source
$ruleName = 'PSNHUB-Preview-8086-LocalSubnet'
$blocks = @(Get-NetFirewallApplicationFilter -Program $previewNode | Get-NetFirewallRule | Where-Object { $_.Action -eq 'Block' -and $_.Direction -eq 'Inbound' -and $_.Profile -eq 'Public' } | Where-Object { ($PSItem | Get-NetFirewallPortFilter).Protocol -eq 'TCP' })
foreach ($rule in $blocks) {
    $ports = $rule | Get-NetFirewallPortFilter
    if (($ports.LocalPort -join ',') -notin @('Any','1-8085,8087-65535')) { throw 'Unexpected firewall rule scope; no change made.' }
}
if (-not (Get-NetFirewallRule -Name $ruleName -ErrorAction SilentlyContinue)) {
    New-NetFirewallRule -Name $ruleName -DisplayName 'PSN-HUB preview: local network TCP 8086' -Direction Inbound -Action Allow -Program $previewNode -Protocol TCP -LocalPort 8086 -RemoteAddress LocalSubnet -Profile Public,Private -ErrorAction Stop | Out-Null
}
try {
    foreach ($rule in $blocks) { $rule | Get-NetFirewallPortFilter | Set-NetFirewallPortFilter -LocalPort '1-8085','8087-65535' -ErrorAction Stop | Out-Null }
} catch {
    foreach ($rule in $blocks) { $rule | Get-NetFirewallPortFilter | Set-NetFirewallPortFilter -LocalPort Any | Out-Null }
    Remove-NetFirewallRule -Name $ruleName
    throw
}
Get-NetFirewallRule -Name $ruleName | Format-List Name,Enabled,Profile,Action
Get-NetFirewallRule -Name $ruleName | Get-NetFirewallAddressFilter | Format-List RemoteAddress
Get-NetFirewallRule -Name $ruleName | Get-NetFirewallPortFilter | Format-List Protocol,LocalPort
