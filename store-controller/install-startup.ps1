$ErrorActionPreference = "Stop"

$folder = Split-Path -Parent $MyInvocation.MyCommand.Path
$script = Join-Path $folder "vista-store-controller.ps1"
$taskName = "VISTA Store Controller"
$action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$script`""
$trigger = New-ScheduledTaskTrigger -AtStartup
$principal = New-ScheduledTaskPrincipal -UserId "SYSTEM" -LogonType ServiceAccount -RunLevel Highest
$settings = New-ScheduledTaskSettingsSet `
  -StartWhenAvailable `
  -RestartCount 999 `
  -RestartInterval (New-TimeSpan -Minutes 1) `
  -ExecutionTimeLimit ([TimeSpan]::Zero) `
  -AllowStartIfOnBatteries `
  -DontStopIfGoingOnBatteries

Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Description "VISTA store local automation controller" -Force | Out-Null
Start-ScheduledTask -TaskName $taskName
Write-Host "Startup task registered: $taskName"
