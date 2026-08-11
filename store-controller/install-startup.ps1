$ErrorActionPreference = "Stop"

$folder = Split-Path -Parent $MyInvocation.MyCommand.Path
$script = Join-Path $folder "vista-store-controller.ps1"
$taskName = "VISTA Store Controller"
$action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$script`""
$trigger = New-ScheduledTaskTrigger -AtLogOn

Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Description "VISTA store local automation controller" -Force | Out-Null
Write-Host "Startup task registered: $taskName"
