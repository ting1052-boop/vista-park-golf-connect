# 매장 전용 제어기 토큰 만들기 (개발 PC 에서 매장당 한 번)
#
# 만드는 것 (store-controller\local\ 아래, git 에 올라가지 않는다)
#   controller-token.txt   토큰 원문. 비밀. 설치 USB 에만 넣고, 설치가 끝나면 지운다.
#   등록SQL.sql            Supabase SQL Editor 에 붙여넣는 SQL. 표 만들기 + 토큰 해시 등록.
#                          토큰 원문은 들어 있지 않다(SHA-256 해시만).
#
# 토큰은 화면에 출력하지 않는다.
#
# 이 파일은 한글이 있어 UTF-8 BOM 으로 저장해야 한다(PowerShell 5.1).

param(
  [Parameter(Mandatory = $true)][string]$StoreId,
  [string]$Label = "송도파크자이 매장 제어기"
)

$ErrorActionPreference = "Stop"

if ($StoreId -notmatch '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$') {
  throw "StoreId 가 UUID 형식이 아닙니다: $StoreId"
}

$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$outDir = Join-Path $here "local"
$tokenPath = Join-Path $outDir "controller-token.txt"
$sqlPath = Join-Path $outDir "등록SQL.sql"
$migrationPath = Join-Path $here "..\supabase\migrations\202609290001_store_controller_tokens.sql"

if (-not (Test-Path -LiteralPath $migrationPath)) { throw "마이그레이션 파일을 찾을 수 없습니다: $migrationPath" }
New-Item -ItemType Directory -Force -Path $outDir | Out-Null

if (Test-Path -LiteralPath $tokenPath) {
  Write-Host "이미 토큰 파일이 있습니다: $tokenPath" -ForegroundColor Yellow
  Write-Host "다시 만들면 이미 설치한 제어기의 토큰이 무효가 됩니다(새 SQL 을 실행해도 이전 토큰은 남습니다)."
  if ((Read-Host "그래도 새로 만들까요? (yes 입력)") -ne "yes") { Write-Host "취소했습니다."; return }
}

# 암호학적 난수 32바이트. URL/JSON 에서 탈이 없도록 영숫자만 남긴다(40자 이상).
$bytes = New-Object byte[] 32
$rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
try { $rng.GetBytes($bytes) } finally { $rng.Dispose() }
$token = [Convert]::ToBase64String($bytes) -replace '[^A-Za-z0-9]', ''
if ($token.Length -lt 32) { throw "토큰이 너무 짧게 생성됐습니다. 다시 실행하세요." }

$sha = [System.Security.Cryptography.SHA256]::Create()
$hash = ($sha.ComputeHash([System.Text.Encoding]::UTF8.GetBytes($token)) | ForEach-Object { $_.ToString("x2") }) -join ""
$sha.Dispose()

$migration = [System.IO.File]::ReadAllText((Resolve-Path $migrationPath), [System.Text.Encoding]::UTF8)
$safeLabel = $Label.Replace("'", "''")
$sql = @"
-- 자동 생성됨. 토큰 원문은 없고 해시만 들어 있다. Supabase SQL Editor 에서 한 번 실행한다.
-- 다시 실행해도 안전하다(표는 if not exists, 해시는 on conflict do nothing).

$migration

insert into public.store_controller_tokens (store_id, label, token_hash)
values ('$($StoreId.ToLower())', '$safeLabel', '$hash')
on conflict (token_hash) do nothing;

-- 확인: 한 행이 나와야 한다. token_hash 는 앞 8자만 보인다.
select s.name as store_name, t.label, left(t.token_hash, 8) as token_hash_head, t.is_active
from public.store_controller_tokens t
join public.stores s on s.id = t.store_id
where t.token_hash = '$hash';
"@

$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText($tokenPath, $token, $utf8NoBom)
[System.IO.File]::WriteAllText($sqlPath, $sql, $utf8NoBom)

Write-Host ""
Write-Host "매장 제어기 토큰을 만들었습니다." -ForegroundColor Green
Write-Host "  토큰 파일 (비밀, USB 로만): $tokenPath"
Write-Host "  SQL (해시만 있음)         : $sqlPath"
Write-Host ""
Write-Host "다음 순서" -ForegroundColor Cyan
Write-Host "  1. 등록SQL.sql 을 Supabase SQL Editor 에 붙여넣어 실행한다. 마지막 조회가 한 행이면 성공."
Write-Host "  2. controller-token.txt 를 설치 USB 의 제어기 폴더(setup-controller.ps1 옆)에 복사한다."
Write-Host "  3. 미니PC 에서 2-controller-install.bat 을 실행한다. 토큰은 파일에서 자동으로 읽는다."
Write-Host "  4. 설치가 끝나면 USB 와 개발 PC 의 controller-token.txt 를 지운다."
