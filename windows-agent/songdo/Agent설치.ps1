# 송도파크자이 타석 PC Agent 설치
#
# 이 폴더에 함께 있어야 하는 것
#   VISTA-Bay-Agent.exe
#   songdo-tokens.json
#
# 중요: 관리자 권한으로 올리지 않는다.
#   Agent 설정(토큰)은 %APPDATA%, 자동실행은 그 계정의 시작프로그램 폴더에 들어간다.
#   다른 관리자 계정으로 승격하면 그 계정 프로필에 저장되고, 타석 PC 가 평소 쓰는
#   계정으로 로그인하면 Agent 가 토큰도 못 읽고 자동실행도 안 된다.
#   그래서 C:\VISTA 대신 사용자 폴더(%LOCALAPPDATA%\VISTA)에 설치한다.

$ErrorActionPreference = "Stop"

$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$sourceExe = Join-Path $here "VISTA-Bay-Agent.exe"
$tokensPath = Join-Path $here "songdo-tokens.json"

# 권한이 필요 없는 위치. 설정·자동실행과 같은 프로필 안에 있다.
$targetDir = Join-Path $env:LOCALAPPDATA "VISTA"
$targetExe = Join-Path $targetDir "VISTA-Bay-Agent.exe"

# Electron 의 userData 경로. package.json 의 name 을 쓴다.
# %APPDATA%\VISTA Bay Agent 가 아니다. 거기 넣으면 Agent 가 조용히 못 읽는다.
$userDataDir = Join-Path $env:APPDATA "vista-windows-agent"
$localConfig = Join-Path $userDataDir "bays.config.local.json"
$selectedConfig = Join-Path $userDataDir "agent.config.json"

function Fail($message) {
  Write-Host ""
  Write-Host "[중단] $message" -ForegroundColor Red
  Write-Host ""
  Read-Host "엔터를 누르면 닫습니다"
  exit 1
}

$identity = [Security.Principal.WindowsIdentity]::GetCurrent()
$elevated = ([Security.Principal.WindowsPrincipal] $identity).IsInRole(
  [Security.Principal.WindowsBuiltInRole]::Administrator)

Write-Host ""
Write-Host "==================================================" -ForegroundColor Cyan
Write-Host " 송도파크자이 타석 PC Agent 설치" -ForegroundColor Cyan
Write-Host "==================================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "  PC 이름 : $env:COMPUTERNAME"
Write-Host "  설치 계정: $($identity.Name)" -ForegroundColor Yellow
Write-Host ""
Write-Host "  이 계정으로 저장됩니다:"
Write-Host "    설정   $userDataDir"
Write-Host "    실행   $targetDir"
Write-Host ""
Write-Host "  손님이 골프를 칠 때 로그인되는 계정과 같아야 합니다." -ForegroundColor Yellow
Write-Host "  다르면 Agent 가 자동으로 뜨지 않습니다."

if ($elevated) {
  Write-Host ""
  Write-Host "  [주의] 관리자 권한으로 실행 중입니다." -ForegroundColor Red
  Write-Host "  '다른 사용자'로 승격했다면 위 계정이 타석 PC 계정이 아닙니다." -ForegroundColor Red
  Write-Host "  그 경우 창을 닫고, 승격하지 말고 그냥 더블클릭해서 실행하세요." -ForegroundColor Red
}

Write-Host ""
$ok = Read-Host " 위 계정이 맞습니까? (y 입력)"
if ($ok -ne "y") { Write-Host " 취소했습니다."; Read-Host "엔터를 누르면 닫습니다"; exit 0 }

if (-not (Test-Path -LiteralPath $sourceExe)) { Fail "VISTA-Bay-Agent.exe 가 이 폴더에 없습니다: $here" }
if (-not (Test-Path -LiteralPath $tokensPath)) { Fail "songdo-tokens.json 이 이 폴더에 없습니다. 토큰만들기.ps1 을 먼저 실행하세요." }

try {
  $tokens = Get-Content -LiteralPath $tokensPath -Raw -Encoding UTF8 | ConvertFrom-Json
} catch {
  Fail "songdo-tokens.json 을 읽지 못했습니다: $($_.Exception.Message)"
}

$bayCodes = @($tokens.PSObject.Properties.Name | Sort-Object)
if ($bayCodes.Count -eq 0) { Fail "songdo-tokens.json 에 타석이 없습니다." }

Write-Host ""
Write-Host " 이 PC 는 몇 번 타석입니까?" -ForegroundColor Yellow
Write-Host ""
for ($i = 0; $i -lt $bayCodes.Count; $i++) {
  Write-Host ("   {0,2}. {1}   ({2})" -f ($i + 1), $tokens.($bayCodes[$i]).label, $bayCodes[$i])
}
Write-Host ""

$choice = Read-Host " 번호 입력 (1-$($bayCodes.Count))"
$index = 0
if (-not [int]::TryParse($choice, [ref]$index) -or $index -lt 1 -or $index -gt $bayCodes.Count) {
  Fail "1 에서 $($bayCodes.Count) 사이의 번호를 입력해야 합니다."
}

$bayCode = $bayCodes[$index - 1]
$bay = $tokens.$bayCode
if ([string]::IsNullOrWhiteSpace($bay.agentToken)) { Fail "$bayCode 토큰이 비어 있습니다." }

Write-Host ""
Write-Host " 선택: $($bay.label)  ($bayCode)" -ForegroundColor Green
$confirm = Read-Host " 맞으면 y 를 입력하세요"
if ($confirm -ne "y") { Write-Host " 취소했습니다."; Read-Host "엔터를 누르면 닫습니다"; exit 0 }

# --- 1. 이 타석 토큰만 저장 -------------------------------------------------
New-Item -ItemType Directory -Force -Path $userDataDir | Out-Null

$localPayload = @{ bays = @(@{ bayCode = $bayCode; agentToken = $bay.agentToken }) }
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText($localConfig, ($localPayload | ConvertTo-Json -Depth 5), $utf8NoBom)
[System.IO.File]::WriteAllText($selectedConfig, (@{ bayCode = $bayCode } | ConvertTo-Json), $utf8NoBom)
Write-Host " [1/4] 타석 설정 저장 완료"

# --- 2. 실행 중인 Agent 종료 ------------------------------------------------
$names = @("VISTA-Bay-Agent", "VISTA Bay Agent")
$running = @(Get-Process -ErrorAction SilentlyContinue | Where-Object { $_.ProcessName -in $names })
foreach ($p in $running) { try { $p.CloseMainWindow() | Out-Null } catch { } }
if ($running.Count -gt 0) {
  $running | Wait-Process -Timeout 10 -ErrorAction SilentlyContinue
  $left = @(Get-Process -ErrorAction SilentlyContinue | Where-Object { $_.ProcessName -in $names })
  if ($left.Count -gt 0) { $left | Stop-Process -Force; Start-Sleep -Milliseconds 500 }
}

# --- 3. exe 복사 ------------------------------------------------------------
New-Item -ItemType Directory -Force -Path $targetDir | Out-Null
if (Test-Path -LiteralPath $targetExe) {
  $stamp = Get-Date -Format "yyyyMMdd-HHmmss"
  Move-Item -LiteralPath $targetExe -Destination "$targetExe.backup-$stamp" -Force
}
Copy-Item -LiteralPath $sourceExe -Destination $targetExe -Force
Write-Host " [2/4] 실행파일 복사 완료  ->  $targetExe"

# --- 4. 시작프로그램 등록 ---------------------------------------------------
# 이 계정의 시작프로그램 폴더다. 위 설정과 같은 프로필이어야 한다.
$startupDir = [Environment]::GetFolderPath("Startup")
$shortcutPath = Join-Path $startupDir "VISTA Windows Agent.lnk"
$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut($shortcutPath)
$shortcut.TargetPath = $targetExe
$shortcut.WorkingDirectory = $targetDir
$shortcut.WindowStyle = 7
$shortcut.Description = "VISTA Park Golf Connect Windows Agent"
$shortcut.Save()
Write-Host " [3/4] 시작프로그램 등록 완료"

# 설정과 자동실행이 같은 프로필인지 확인한다. 다르면 재부팅 뒤 안 뜬다.
$profileRoot = [Environment]::GetFolderPath("UserProfile")
if (-not $startupDir.StartsWith($profileRoot, [StringComparison]::OrdinalIgnoreCase) -or
    -not $userDataDir.StartsWith($profileRoot, [StringComparison]::OrdinalIgnoreCase)) {
  Write-Host " [경고] 설정과 자동실행이 서로 다른 계정 폴더에 있습니다." -ForegroundColor Red
  Write-Host "        재부팅 후 Agent 가 뜨지 않을 수 있습니다." -ForegroundColor Red
}

# --- 5. 실행 ----------------------------------------------------------------
Start-Process -FilePath $targetExe -WorkingDirectory $targetDir
Write-Host " [4/4] Agent 실행함"

Write-Host ""
Write-Host "==================================================" -ForegroundColor Green
Write-Host " 설치 완료 - $($bay.label)" -ForegroundColor Green
Write-Host "==================================================" -ForegroundColor Green
Write-Host ""
Write-Host " 화면에는 아무것도 뜨지 않습니다. 정상입니다."
Write-Host ""
Write-Host " 확인 순서" -ForegroundColor Cyan
Write-Host "   1. 2분 안에 대시보드에서 이 타석이 'PC 켜짐' 이 되는가"
Write-Host "   2. 무인제어에서 'PC 정상 종료' 를 눌러 실제로 꺼지는가"
Write-Host "   3. 다시 켠 뒤(HA 또는 전원버튼) 로그인만 하면 'PC 켜짐' 으로 돌아오는가"
Write-Host ""
Write-Host " 안 되면 이 파일을 보세요:"
Write-Host "   $userDataDir\logs\vista-agent-overlay.log"
Write-Host ""
Read-Host "엔터를 누르면 닫습니다"
