$ErrorActionPreference = "Stop"

# Registers the agent to start with Windows.
# Works for both distributions: the single portable exe (what bay PCs install)
# and the source checkout that runs start-overlay.cmd.

$agentDir = Split-Path -Parent $MyInvocation.MyCommand.Path

$portableExe = Join-Path $agentDir "VISTA-Bay-Agent.exe"
$unpackedExe = Join-Path $agentDir "VISTA Bay Agent.exe"
$sourceCmd = Join-Path $agentDir "start-overlay.cmd"

if (Test-Path $portableExe) {
  $target = $portableExe
} elseif (Test-Path $unpackedExe) {
  $target = $unpackedExe
} elseif (Test-Path $sourceCmd) {
  $target = $sourceCmd
} else {
  throw "VISTA Agent 실행파일 또는 start-overlay.cmd 를 이 폴더에서 찾을 수 없습니다: $agentDir"
}

$startup = [Environment]::GetFolderPath("Startup")
$shortcut = Join-Path $startup "VISTA Windows Agent.lnk"

$shell = New-Object -ComObject WScript.Shell
$link = $shell.CreateShortcut($shortcut)
$link.TargetPath = $target
$link.WorkingDirectory = $agentDir
$link.WindowStyle = 7
$link.Description = "VISTA Park Golf Connect Windows Agent"
$link.Save()

Write-Host "등록 완료"
Write-Host ("  실행 대상 : " + $target)
Write-Host ("  바로가기  : " + $shortcut)
Write-Host ""
Write-Host "지금 바로 확인하려면 이 창에서 실행해 보세요:"
Write-Host ("  Start-Process '" + $target + "'")
