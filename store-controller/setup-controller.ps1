# 매장 제어기 설치 (현장용, 한 번 실행)
#
# HA 가 돌고 있는 매장 Windows PC 에서 실행한다. 하는 일:
#   1. 같은 네트워크에서 Home Assistant 주소를 찾는다
#   2. 토큰 두 개를 입력받는다 (화면에 표시하지 않는다)
#   3. HA 와 VISTA 서버에 실제로 붙는지 시험한다. 실패하면 설치하지 않는다
#   4. C:\VISTA\store-controller 에 설치하고 부팅 자동 시작을 등록한다
#
# 토큰은 이 PC 의 controller.config.json 에만 저장된다. 화면·로그에 남기지 않는다.
#
# 이 파일은 한글이 있어 UTF-8 BOM 으로 저장해야 한다. BOM 이 없으면 PowerShell 5.1 이
# 한글을 깨뜨려 조용히 오동작한다(2026-09 추석 자동종료가 이 이유로 실패했다).

param(
  [string]$StoreId = "b2f7192b-9472-4006-a58d-ffec3afc90ce",
  [string]$ControllerId = "vista-songdo-controller",
  [string]$ApiBaseUrl = "https://vista-park-golf-connect.vercel.app",
  [switch]$DryRun
)

$ErrorActionPreference = "Stop"

function Fail($message) {
  Write-Host ""
  Write-Host "[중단] $message" -ForegroundColor Red
  Write-Host ""
  if (-not $DryRun) { Read-Host "엔터를 누르면 닫습니다" | Out-Null }
  exit 1
}

# 부팅 자동 시작을 SYSTEM 작업으로 등록하므로 관리자 권한이 필요하다.
# (Agent 와 달리 제어기는 사용자별 설정이 없어 어느 관리자로 올려도 된다.)
$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole(
  [Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin -and -not $DryRun) {
  Write-Host "관리자 권한으로 다시 실행합니다..."
  Start-Process powershell -Verb RunAs -ArgumentList @(
    "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", "`"$($MyInvocation.MyCommand.Path)`""
  )
  exit 0
}

$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$source = if (Test-Path (Join-Path $here "vista-store-controller.ps1")) { $here } else { Join-Path $here "store-controller" }
$target = "C:\VISTA\store-controller"
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

Write-Host ""
Write-Host "==================================================" -ForegroundColor Cyan
Write-Host " VISTA 매장 제어기 설치$(if ($DryRun) { ' (DryRun)' })" -ForegroundColor Cyan
Write-Host "==================================================" -ForegroundColor Cyan
Write-Host "  PC 이름   : $env:COMPUTERNAME"
Write-Host "  매장 ID   : $StoreId"
Write-Host "  제어기 ID : $ControllerId"
Write-Host ""

if (-not (Test-Path (Join-Path $source "vista-store-controller.ps1"))) {
  Fail "제어기 파일(vista-store-controller.ps1)을 찾지 못했습니다: $source"
}

# --- 1. HA 주소 찾기 ---------------------------------------------------------
Write-Host " [1/4] 같은 네트워크에서 Home Assistant 를 찾는 중..." -ForegroundColor Yellow
$myIp = Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
  Where-Object { $_.IPAddress -match '^(192\.168|10\.|172\.(1[6-9]|2\d|3[01]))\.' -and $_.PrefixLength -eq 24 } |
  Select-Object -First 1 -ExpandProperty IPAddress
$found = @()
if ($myIp) {
  $prefix = ($myIp -split '\.')[0..2] -join '.'
  # HA OS 는 화면을 80번(주소에 포트 없음)으로도, 8123번으로도 연다. 둘 다 본다.
  $probes = foreach ($i in 1..254) {
    foreach ($port in 8123, 80) {
      $client = New-Object System.Net.Sockets.TcpClient
      [pscustomobject]@{ ip = "$prefix.$i"; port = $port; client = $client; task = $client.ConnectAsync("$prefix.$i", $port) }
    }
  }
  Start-Sleep -Milliseconds 2000
  foreach ($p in $probes) {
    if ($p.task.Status -eq 'RanToCompletion' -and $p.client.Connected) {
      $base = if ($p.port -eq 80) { "http://$($p.ip)" } else { "http://$($p.ip):$($p.port)" }
      try {
        # manifest.json 은 파일 형식(application/manifest+json)이라 PowerShell 5.1 이 byte[] 로 준다.
        # 첫 화면(리다이렉트를 따라간다)의 제목은 항상 글자이므로 그것으로 확인한다.
        $page = Invoke-WebRequest "$base/" -UseBasicParsing -TimeoutSec 4
        $text = if ($page.Content -is [byte[]]) { [System.Text.Encoding]::UTF8.GetString($page.Content) } else { [string]$page.Content }
        if ($text -match '<title>\s*Home Assistant' -and $found -notcontains $base) { $found += $base }
      } catch { }
    }
    $p.client.Dispose()
  }
}

if ($found.Count -gt 0) {
  Write-Host "       찾음: $($found -join ', ')" -ForegroundColor Green
  $default = $found[0]
} else {
  Write-Host "       자동으로 찾지 못했습니다. HA 주소를 직접 입력하세요." -ForegroundColor Yellow
  $default = ""
}

if ($DryRun) {
  $haUrl = if ($default) { $default } else { "http://(찾지 못함):8123" }
} else {
  $typed = Read-Host "       HA 주소 [엔터 = $default]"
  $haUrl = if ([string]::IsNullOrWhiteSpace($typed)) { $default } else { $typed.Trim() }
  if ([string]::IsNullOrWhiteSpace($haUrl)) { Fail "HA 주소가 없습니다." }
}
$haUrl = $haUrl.TrimEnd('/')

# --- 2. 토큰 입력 ------------------------------------------------------------
function Read-Secret($prompt) {
  $secure = Read-Host $prompt -AsSecureString
  $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
  try { return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr).Trim() }
  finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr) }
}

Write-Host ""
Write-Host " [2/4] 토큰 두 개를 붙여넣습니다. 입력해도 화면에 보이지 않습니다(정상)." -ForegroundColor Yellow
if ($DryRun) {
  Write-Host "       (DryRun: 입력과 연결 시험을 건너뜁니다)"
  $controllerToken = "REPLACE_WITH_CONTROLLER_TOKEN"; $haToken = "REPLACE_WITH_HA_TOKEN"
} else {
  # 매장 전용 토큰 파일(make-store-token.ps1 이 만든다)이 있으면 그것을 읽는다. 없으면 직접 입력.
  $tokenFile = Join-Path $here "controller-token.txt"
  if (Test-Path -LiteralPath $tokenFile) {
    $controllerToken = ([System.IO.File]::ReadAllText($tokenFile)).Trim()
    Write-Host "       ① 제어기 토큰: controller-token.txt 에서 읽었습니다." -ForegroundColor Green
  } else {
    Write-Host "       ① 제어기 토큰 = 시흥 노트북 C:\VISTA\store-controller\controller.config.json 의 controllerToken 값"
    $controllerToken = Read-Secret "       제어기 토큰"
  }
  Write-Host "       ② HA 토큰 = 새 HA > 왼쪽 아래 프로필 > 보안 > 장기 액세스 토큰 > 만들기"
  $haToken = Read-Secret "       HA 토큰"
  if ($controllerToken.Length -lt 16) { Fail "제어기 토큰이 너무 짧습니다. 다시 복사하세요." }
  if ($haToken.Length -lt 32) { Fail "HA 토큰이 너무 짧습니다. 다시 복사하세요." }
}

# --- 3. 연결 시험 (설치 전에) ------------------------------------------------
Write-Host ""
Write-Host " [3/4] 연결 시험" -ForegroundColor Yellow
if (-not $DryRun) {
  try {
    $ha = Invoke-RestMethod "$haUrl/api/" -Headers @{ Authorization = "Bearer $haToken" } -TimeoutSec 10
    Write-Host "       HA            : 정상 ($($ha.message))" -ForegroundColor Green
  } catch {
    Fail "HA 에 붙지 못했습니다. 주소 또는 HA 토큰을 확인하세요. ($($_.Exception.Message))"
  }

  try {
    $vistaHeaders = @{
      Authorization = "Bearer $controllerToken"
      "x-store-controller-id" = $ControllerId
      "x-store-id" = $StoreId
    }
    # 인증만 확인한다. GET 은 서버가 명령을 가져가고 스케줄까지 돌리므로 설치 시험에 쓰면 안 된다.
    # 결과 등록(POST)에 빈 본문을 보내면, 토큰이 맞을 때 400(본문 오류), 틀리면 401 이 온다.
    Invoke-RestMethod -Method Post "$ApiBaseUrl/api/store-controller/commands" -Headers $vistaHeaders `
      -ContentType "application/json" -Body "{}" -TimeoutSec 20 | Out-Null
    Fail "서버가 예상 밖의 응답을 했습니다. 서버 배포 상태를 확인하세요."
  } catch {
    $code = if ($_.Exception.Response) { $_.Exception.Response.StatusCode.value__ } else { 0 }
    if ($code -eq 400) {
      Write-Host "       VISTA 서버    : 정상 (토큰 인증 통과)" -ForegroundColor Green
    } elseif ($code -eq 401) {
      Fail "VISTA 서버가 제어기 토큰을 거부했습니다(401). 등록 SQL 을 실행했는지, controller-token.txt 가 그 SQL 을 만든 것과 같은지 확인하세요."
    } else {
      Fail "VISTA 서버에 붙지 못했습니다. 인터넷 연결을 확인하세요. ($($_.Exception.Message))"
    }
  }
}

# --- 4. 설치 + 자동 시작 -----------------------------------------------------
Write-Host ""
Write-Host " [4/4] 설치" -ForegroundColor Yellow
$config = [ordered]@{
  controllerId = $ControllerId
  storeId = $StoreId
  apiBaseUrl = $ApiBaseUrl
  controllerToken = $controllerToken
  homeAssistantUrl = $haUrl
  homeAssistantToken = $haToken
  pollIntervalSeconds = 5
}

if ($DryRun) {
  Write-Host "       설치 위치 : $target"
  Write-Host "       HA 주소   : $haUrl"
  Write-Host "       (DryRun: 파일을 쓰거나 작업을 등록하지 않았습니다)"
  exit 0
}

New-Item -ItemType Directory -Force -Path $target | Out-Null
foreach ($name in @("vista-store-controller.ps1", "install-startup.ps1", "start-controller.cmd", "controller.config.example.json", "README.md")) {
  $file = Join-Path $source $name
  if (Test-Path $file) { Copy-Item $file (Join-Path $target $name) -Force }
}
# 값이 모두 ASCII 라 BOM 없이 쓴다. 제어기는 이 파일을 Get-Content 로 읽는다.
[System.IO.File]::WriteAllText((Join-Path $target "controller.config.json"), ($config | ConvertTo-Json), (New-Object System.Text.UTF8Encoding($false)))
Write-Host "       설정 저장 : $target\controller.config.json"

& (Join-Path $target "install-startup.ps1")
Write-Host "       부팅 자동 시작 등록 + 지금 시작"

Start-Sleep -Seconds 8
$log = Join-Path $target "controller.log"
Write-Host ""
Write-Host " 최근 제어기 기록:" -ForegroundColor Cyan
if (Test-Path $log) { Get-Content $log -Tail 5 | ForEach-Object { Write-Host "   $_" } } else { Write-Host "   (아직 기록 없음. 잠시 뒤 $log 를 확인하세요)" }

Write-Host ""
Write-Host "==================================================" -ForegroundColor Green
Write-Host " 매장 제어기 설치 완료" -ForegroundColor Green
Write-Host "==================================================" -ForegroundColor Green
Read-Host "엔터를 누르면 닫습니다" | Out-Null
