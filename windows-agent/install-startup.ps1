$ErrorActionPreference = "Stop"

$agentDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$target = Join-Path $agentDir "start-agent.cmd"
$startup = [Environment]::GetFolderPath("Startup")
$shortcut = Join-Path $startup "VISTA Windows Agent.lnk"

$shell = New-Object -ComObject WScript.Shell
$link = $shell.CreateShortcut($shortcut)
$link.TargetPath = $target
$link.WorkingDirectory = $agentDir
$link.WindowStyle = 7
$link.Description = "VISTA Park Golf Connect Windows Agent"
$link.Save()

Write-Host "Startup shortcut created:"
Write-Host $shortcut
