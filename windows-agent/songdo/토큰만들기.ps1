# 송도파크자이 Agent 토큰 9개 생성
#
# 개발 PC 에서 한 번만 실행한다. 만들어지는 두 파일은 비밀이다.
#   songdo-tokens.json   설치 USB 에 넣는다. 설치가 끝나면 USB 에서 지운다.
#   등록SQL-작성됨.sql    Supabase SQL Editor 에 붙여넣는다. 붙여넣고 지운다.
#
# 토큰은 이 스크립트 안에서만 만들어진다. 화면에 찍지 않는다.

$ErrorActionPreference = "Stop"
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$templatePath = Join-Path $here "..\..\supabase\agent-devices-songdo-template.sql"
$tokensPath = Join-Path $here "songdo-tokens.json"
$sqlPath = Join-Path $here "등록SQL-작성됨.sql"

# bayCode 는 bays.config.json 의 송도 항목과 같아야 한다.
# placeholder 는 SQL 템플릿의 자리표시자와 같아야 한다.
$bays = @(
  @{ bayCode = "SD-R-01"; label = "송도 · 골프 1번"; placeholder = "REPLACE_WITH_SONGDO_RANGE_01_AGENT_TOKEN" }
  @{ bayCode = "SD-R-02"; label = "송도 · 골프 2번"; placeholder = "REPLACE_WITH_SONGDO_RANGE_02_AGENT_TOKEN" }
  @{ bayCode = "SD-R-03"; label = "송도 · 골프 3번"; placeholder = "REPLACE_WITH_SONGDO_RANGE_03_AGENT_TOKEN" }
  @{ bayCode = "SD-R-04"; label = "송도 · 골프 4번"; placeholder = "REPLACE_WITH_SONGDO_RANGE_04_AGENT_TOKEN" }
  @{ bayCode = "SD-R-05"; label = "송도 · 골프 5번"; placeholder = "REPLACE_WITH_SONGDO_RANGE_05_AGENT_TOKEN" }
  @{ bayCode = "SD-R-06"; label = "송도 · 골프 6번"; placeholder = "REPLACE_WITH_SONGDO_RANGE_06_AGENT_TOKEN" }
  @{ bayCode = "SD-R-07"; label = "송도 · 골프 7번"; placeholder = "REPLACE_WITH_SONGDO_RANGE_07_AGENT_TOKEN" }
  @{ bayCode = "SD-P-01"; label = "송도 · 파크 1번"; placeholder = "REPLACE_WITH_SONGDO_PARK_01_AGENT_TOKEN" }
  @{ bayCode = "SD-P-02"; label = "송도 · 파크 2번"; placeholder = "REPLACE_WITH_SONGDO_PARK_02_AGENT_TOKEN" }
)

if (-not (Test-Path -LiteralPath $templatePath)) {
  throw "SQL 템플릿을 찾을 수 없습니다: $templatePath"
}

if (Test-Path -LiteralPath $tokensPath) {
  Write-Host "이미 토큰 파일이 있습니다: $tokensPath" -ForegroundColor Yellow
  Write-Host "다시 만들면 기존 토큰은 무효가 되고 SQL 을 다시 실행해야 합니다."
  $answer = Read-Host "그래도 새로 만들까요? (yes 입력)"
  if ($answer -ne "yes") { Write-Host "취소했습니다."; return }
}

# Get-Random 은 암호학적으로 안전하지 않다. RNG 를 쓴다.
function New-Token {
  $bytes = New-Object byte[] 32
  $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
  try { $rng.GetBytes($bytes) } finally { $rng.Dispose() }
  # URL/JSON 에서 탈이 없도록 영숫자만 남긴다. 32바이트라 길이가 줄어도 충분하다.
  return ([Convert]::ToBase64String($bytes) -replace '[^A-Za-z0-9]', '')
}

$sql = [System.IO.File]::ReadAllText((Resolve-Path $templatePath), [System.Text.Encoding]::UTF8)
$out = @{}

foreach ($bay in $bays) {
  $token = New-Token
  if ($token.Length -lt 32) { throw "토큰이 너무 짧게 생성됐습니다. 다시 실행하세요." }
  $out[$bay.bayCode] = @{ label = $bay.label; agentToken = $token }

  if (-not $sql.Contains($bay.placeholder)) {
    throw "SQL 템플릿에 $($bay.placeholder) 가 없습니다. 템플릿이 바뀌었는지 확인하세요."
  }
  $sql = $sql.Replace($bay.placeholder, $token)
}

$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText($tokensPath, ($out | ConvertTo-Json -Depth 5), $utf8NoBom)
[System.IO.File]::WriteAllText($sqlPath, $sql, $utf8NoBom)

Write-Host ""
Write-Host "토큰 9개를 만들었습니다." -ForegroundColor Green
Write-Host "  설치 USB 에 넣을 것 : $tokensPath"
Write-Host "  Supabase 에 붙일 것  : $sqlPath"
Write-Host ""
Write-Host "다음 순서" -ForegroundColor Cyan
Write-Host "  1. 작성된 SQL 을 열어 [1단계] 만 먼저 실행하고 실제 bay_code 9개를 확인한다"
Write-Host "  2. [2단계] 의 bay_code 와 매장 코드를 그 값으로 고친다"
Write-Host "  3. [2단계] 를 실행한다. returning 이 9행이어야 한다"
Write-Host "  4. USB 에는 songdo-tokens.json 만 옮긴다. 등록SQL-작성됨.sql 은 USB 에 넣지 않는다"
Write-Host "  5. 현장 설치가 끝나면 USB 의 토큰 파일과 개발 PC 의 SQL 파일을 지운다"
Write-Host ""
Write-Host "이 두 파일은 커밋 금지다. .gitignore 에 등록돼 있다." -ForegroundColor Yellow
