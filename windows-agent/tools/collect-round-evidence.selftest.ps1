#Requires -Version 5.1
# 수집기 자체 검사. 합성 로그로 가짜 PARK 폴더를 만들고 수집기를 powershell -File 로 파일째 실행해 결과를 확인한다.
# 실행: powershell -NoProfile -ExecutionPolicy Bypass -File collect-round-evidence.selftest.ps1 [-WorkDir <임시폴더>] [-Keep]
param([string]$WorkDir = [IO.Path]::GetTempPath(), [switch]$Keep)
$ErrorActionPreference = 'Stop'
$fail = 0
function Check([bool]$ok, [string]$what) {
  if ($ok) { Write-Host "ok   $what" } else { Write-Host "FAIL $what"; $script:fail++ }
}

$base = Join-Path $WorkDir ("vista round evidence test " + [guid]::NewGuid().ToString('N').Substring(0, 8))
$drive = Join-Path $base 'fake drive'
$toolDir = Join-Path $base '수집기 복사본'   # 한글·공백 경로에서도 -File 실행
$outDir = Join-Path $base '결과 폴더'
New-Item -ItemType Directory -Force -Path $toolDir, $outDir | Out-Null
$src = Join-Path $PSScriptRoot 'collect-round-evidence.ps1'
Copy-Item -LiteralPath $src -Destination $toolDir
$collector = Join-Path $toolDir 'collect-round-evidence.ps1'

$root = Join-Path $drive 'PARK_260713-VISTA'
$saved = Join-Path $root 'ScreenGolf\Saved\Logs'
$main = Join-Path $root 'ScreenGolf\Binaries\Win64\Logs'
New-Item -ItemType Directory -Force -Path $saved, $main, (Join-Path $drive 'PARK_261001-KD_VISTA\ScreenGolf\Saved\Logs'), (Join-Path $drive 'Park_NVSensor_Backup') | Out-Null

# 심어 둔 개인정보: 결과 어디에도 나오면 안 된다
$planted = @('홍길동', 'HongGildong', 'kimminsu', 'user1234')
$who = 'Player HongGildong kimminsu 홍길동 account "user1234"'

$script:clock = [datetime]'2026-11-20T01:00:00'
function Stamp { $script:clock = $script:clock.AddSeconds(7); return $script:clock.ToString('[yyyy.MM.dd-HH.mm.ss:fff]') + '[ 12]' }

function RoundLines([int]$holes, [bool]$stamped, [int]$noise = 0) {
  $out = New-Object System.Collections.Generic.List[string]
  for ($h = 1; $h -le $holes; $h++) {
    $p = if ($stamped) { Stamp } else { '' }
    $out.Add($p + ('LogTemp: GameManager::EnterNewHole: Open New Level /Game/Golf/Course/Course_A/{0:D2}hole' -f $h))
    $p = if ($stamped) { Stamp } else { '' }
    $out.Add($p + "LogGame: $who Score 4 hole $h")
    for ($k = 0; $k -lt $noise; $k++) {   # 실제 로그처럼 키워드가 섞인 잡음 줄 (Background/HResult/Finished, 아무 hole 번호)
      $p = if ($stamped) { Stamp } else { '' }
      if ($k % 2) { $out.Add($p + 'LogRenderer: Background HResult Finished') } else { $out.Add($p + ('LogSlate: preview hole {0}' -f (($k % 17) + 1))) }
    }
    for ($k = 0; $k -lt 3; $k++) {   # 폴링처럼 반복되는 State 0 은 한 건으로 묶여야 한다
      $p = if ($stamped) { Stamp } else { '' }
      $out.Add($p + "LogTemp: CGameContext::IsEndedHole: Hole $h State: 0")
    }
    $p = if ($stamped) { Stamp } else { '' }
    $out.Add($p + "LogTemp: CGameContext::IsEndedHole: Hole $h State: 1")
  }
  return $out
}

$utf8 = New-Object Text.UTF8Encoding $false
$sg = @(
  ((Stamp) + "LogLoad: Game class is 'BP_LobbyModebase_C'"),
  ((Stamp) + 'LogNet: Browse: /Game/Golf/Course/Course_A/Map?listen'),
  ((Stamp) + "LogLoad: Game class is 'SGGameModeBase_C'"),
  ((Stamp) + "LogTemp: Round start for $who"),
  ((Stamp) + 'LogNet: Browse: /Game/UI/UIMap?closed'),
  ((Stamp) + 'LogNet: Browse: /Game/Golf/Course/Practice_Range/Map'),
  ((Stamp) + 'LogNet: Browse: /Game/UI/UIMap?closed'),
  ((Stamp) + 'LogExit: FPlatformMisc::RequestExit(0)')
)
[IO.File]::WriteAllLines((Join-Path $saved 'ScreenGolf.log'), $sg, $utf8)
[IO.File]::WriteAllLines((Join-Path $drive 'PARK_261001-KD_VISTA\ScreenGolf\Saved\Logs\ScreenGolf.log'), $sg[0..1], $utf8)

$m1 = @((RoundLines 18 $true 200) + (RoundLines 9 $true) + (RoundLines 5 $true))   # 18홀 판에 잡음 3600줄
[IO.File]::WriteAllLines((Join-Path $main 'main_1.log'), $m1, $utf8)
[IO.File]::WriteAllLines((Join-Path $main 'main_2.log'), @(RoundLines 5 $false), $utf8)                       # 시각 없음
[IO.File]::WriteAllLines((Join-Path $main 'main_3.log'), @(RoundLines 9 $true), [Text.Encoding]::Unicode)      # UTF-16 BOM
[IO.File]::WriteAllBytes((Join-Path $main 'main_5.log'), [Text.Encoding]::Unicode.GetBytes(((RoundLines 7 $true) -join "`r`n")))  # UTF-16 BOM 없음
[IO.File]::WriteAllLines((Join-Path $main 'main_4.log'), @(RoundLines 3 $true), $utf8)                       # 잠글 파일
[IO.File]::WriteAllLines((Join-Path $main 'main_old.log'), @(RoundLines 2 $true), $utf8)
(Get-Item (Join-Path $main 'main_old.log')).LastWriteTime = (Get-Date).AddDays(-30)
foreach ($n in 1, 2, 3, 5, 4) { (Get-Item (Join-Path $main "main_$n.log")).LastWriteTime = (Get-Date).AddMinutes(-60 + $n) }

$before = @{}
foreach ($f in Get-ChildItem -LiteralPath $drive -Recurse -File) { $before[$f.FullName] = @((Get-FileHash -LiteralPath $f.FullName).Hash, $f.LastWriteTimeUtc) }

# 게임이 쥐고 있는 것처럼 main_4 를 독점으로 연다
$lock = [IO.File]::Open((Join-Path $main 'main_4.log'), 'Open', 'Read', 'None')
try {
  & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $collector -SearchRoot $drive -OutDir $outDir | Out-Host
  $code1 = $LASTEXITCODE
  & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $collector -SearchRoot $drive -OutDir $outDir | Out-Null
  $code2 = $LASTEXITCODE
} finally { $lock.Dispose() }

Check ($code1 -eq 0 -and $code2 -eq 0) 'powershell -File 실행 두 번 모두 종료코드 0'
$outFile = @(Get-ChildItem -LiteralPath $outDir -Filter 'round-evidence-*.jsonl')
Check ($outFile.Count -eq 1) '결과 파일은 하나'
$raw = [IO.File]::ReadAllText($outFile[0].FullName)
$lines = @($raw -split "`r`n" | Where-Object { $_ })
Check ($lines.Count -eq 2) '두 번 실행이 같은 파일에 두 줄로 쌓임'
Check (-not [regex]::IsMatch($raw, '[^\x00-\x7F]')) '결과에 비ASCII(한글) 없음'
foreach ($p in $planted) { Check (-not $raw.Contains($p)) "심어 둔 개인정보 '$p' 없음" }
Check (-not $raw.Contains('Course_A/01hole') -and -not $raw.Contains('[2026.11.20-')) '원문 줄 없음(코스 이름·숫자·시각 원문 그대로 남지 않음)'

$rec = $lines[-1] | ConvertFrom-Json
Check ($rec.schema -eq 'vista-round-evidence/1') 'schema'
Check (@($rec.roots).Count -eq 2) '설치 폴더 2개(이름 끝이 _VISTA 인 업데이트 폴더 포함) 찾고 ScreenGolf 없는 Park_ 폴더는 제외'
$r = @($rec.roots | Where-Object { $_.root -eq 'PARK_260713-VISTA' })[0]
$mainFolder = @($r.folders | Where-Object { $_.path -eq 'ScreenGolf\Binaries\Win64\Logs' })[0]
$savedFolder = @($r.folders | Where-Object { $_.path -eq 'ScreenGolf\Saved\Logs' })[0]
function FileRec($name) { @($mainFolder.files | Where-Object { $_.name -eq $name })[0] }

function Runs($file) {
  # 끝난 홀(State 1)을 순서대로 보고, 홀 번호가 되돌아가면 새 판으로 나눈다
  $runs = @(); $cur = @{}; $prev = 0
  foreach ($e in @($file.events | Where-Object { $_.sig -eq 'ended_hole' -and $_.state -eq 1 })) {
    if ($e.hole -le $prev -and $cur.Count) { $runs += $cur.Count; $cur = @{} }
    $cur[[int]$e.hole] = $true; $prev = $e.hole
  }
  if ($cur.Count) { $runs += $cur.Count }
  return ($runs -join ',')
}
Check ((Runs (FileRec 'main_1.log')) -eq '18,9,5') '18홀·9홀·5홀 판이 18/9/5 개의 끝난 홀로 보임(잡음 3600줄이 있어도)'
$m1r = FileRec 'main_1.log'
Check ($m1r.noiseTruncated -and -not $m1r.eventsTruncated -and $m1r.signalLineCounts.hole_number -ge 1800) '잡음은 따로 잘리고 핵심 신호는 그대로, 줄 수 합계는 남음'
Check ((Runs (FileRec 'main_2.log')) -eq '5') '시각 없는 로그도 5홀 판 인식'
Check ((FileRec 'main_2.log').stampFormat.none -gt 0 -and -not (FileRec 'main_2.log').firstLogTime) '시각 없음이 표시됨'
Check (@((FileRec 'main_2.log').events | Where-Object { $_.line -gt 0 }).Count -gt 0) '시각 없을 때 줄 순번 기록'
Check ((Runs (FileRec 'main_3.log')) -eq '9' -and (FileRec 'main_3.log').encoding -eq 'utf16le-bom') 'UTF-16(BOM) 로그 9홀'
Check ((Runs (FileRec 'main_5.log')) -eq '7' -and (FileRec 'main_5.log').encoding -eq 'utf16le-nobom') 'UTF-16(BOM 없음) 로그 7홀'
$f4 = FileRec 'main_4.log'
Check ($f4.open -eq 'error' -and $f4.errorHResult) "잠긴 파일은 오류코드만 남김 ($($f4.errorHResult))"
Check (-not (FileRec 'main_old.log') -and $mainFolder.fileCountAll -eq 6 -and $mainFolder.retentionDays -ge 29) '30일 지난 파일은 분석 제외, 보존 일수엔 포함'
$zero = @((FileRec 'main_1.log').events | Where-Object { $_.sig -eq 'ended_hole' -and $_.state -eq 0 })
Check ($zero.Count -eq 32 -and @($zero | Where-Object { $_.n -eq 3 }).Count -eq 32) 'State 0 도 기록, 연속 반복은 n=3 한 건으로 묶음'
Check ((FileRec 'main_1.log').firstLogTime -match '^\d{4}-\d\d-\d\dT' -and $null -ne (FileRec 'main_1.log').modifiedUtcMinusLastLogMinutes) '로그 시각과 수정시각 차이 기록'
$sgf = @($savedFolder.files)[0]
$sigs = (@($sgf.events) | ForEach-Object { $_.sig }) -join ','
Check ($sigs -eq 'lobby_entered,course_entered,game_mode_seen,lobby_entered,course_entered,lobby_entered,exit_requested') "ScreenGolf.log 신호 순서 ($sigs)"
Check (@($sgf.noiseEvents | Where-Object { $_.sig -eq 'kw_round' -and $_.line -eq 4 }).Count -eq 1) 'Round 키워드 줄은 잡음 쪽에 줄 번호와 함께'
Check (@($sgf.events | Where-Object { $_.kind -eq 'practice' }).Count -eq 1) '연습장 구분'
$shape = @($sgf.shapes.kw_round)[0]
Check ($shape -like '*LogTemp: Round start w Player w w ??? w ""' -and $shape.StartsWith('[####.##.##-##.##.##:###]')) "줄 모양 마스킹 ($shape)"

$changed = 0
foreach ($f in Get-ChildItem -LiteralPath $drive -Recurse -File) {
  $b = $before[$f.FullName]
  if ($b[0] -ne (Get-FileHash -LiteralPath $f.FullName).Hash -or $b[1] -ne $f.LastWriteTimeUtc) { $changed++ }
}
Check ($changed -eq 0) '게임 로그 파일 내용·수정시각 불변'

$bytes = [IO.File]::ReadAllBytes($src)
Check ($bytes[0] -eq 0xEF -and $bytes[1] -eq 0xBB -and $bytes[2] -eq 0xBF) '수집기 .ps1 UTF-8 BOM'
$bat = [IO.File]::ReadAllBytes((Join-Path $PSScriptRoot 'collect-round-evidence.bat'))
$batText = [Text.Encoding]::ASCII.GetString($bat)
Check (-not ($bat | Where-Object { $_ -gt 0x7F }) -and -not [regex]::IsMatch($batText, '(?<!\r)\n')) '.bat ASCII + CRLF'

if (-not $Keep) { Remove-Item -LiteralPath $base -Recurse -Force } else { Write-Host "fixture kept: $base" }
Write-Host ''
if ($fail) { Write-Host "실패 $fail 건"; exit 1 } else { Write-Host '전부 통과'; exit 0 }
