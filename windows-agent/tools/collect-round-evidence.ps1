#Requires -Version 5.1
<#
  VISTA 0단계 라운드 증거 수집기 (읽기 전용)
  근거: docs/samsong-round-count-agent-design.md §5

  - 게임·Agent 파일을 수정/삭제하지 않는다. 결과 파일 1개만 -OutDir 에 쓴다(실행마다 한 줄 추가).
  - 로그는 일반 읽기 공유(ReadWrite|Delete)로 한 번만 열어 본다. 잠겨 있으면 오류 코드만 남긴다(우회 없음).
  - 게임을 끄지 않는다. 관리자 권한이 필요 없다.
  - 결과에는 원문 줄·고객 이름·한글이 들어가지 않는다. 시각·신호 종류·홀 번호·State 값·파일 크기/날짜와
    허용 단어만 남긴 "줄 모양"(숫자 #, 따옴표 안 "", 비ASCII ?, 모르는 단어 w)만 쓴다. 출력에 비ASCII가 있으면 ? 로 바꾼다.
  - 이미 디스크에 있는 로그를 읽으므로 수집기를 나중에 복사해 와도 앞서 친 판이 잡힌다(최근 -Days 일).

  신호 정의 출처(현장 PC에 node 가 없어 PowerShell 로 옮겼다. 바꿀 때 양쪽을 같이 본다):
    windows-agent/screen-golf-monitor.js  LOG_TIMESTAMP, COURSE_BROWSE, LOBBY_BROWSE, classifyCourse, parseScreenGolfEvents
    windows-agent/game-log-probe.js       findSignals (hole 번호, EnterNewHole, IsEndedHole State)
    windows-agent/electron-main.js        기본 경로 C:\PARK_*-VISTA\ScreenGolf\Saved\Logs\ScreenGolf.log, ...\Launch\Logs
#>
param(
  [string]$SearchRoot = 'C:\',
  [string]$OutDir = $PSScriptRoot,
  [int]$Days = 14,
  [int]$MaxFilesPerFolder = 20
)

$ErrorActionPreference = 'Stop'
$CollectorVersion = '1.0.1'
$MaxEventsPerFile = 4000   # 핵심 신호(코스·로비·게임모드·종료요청·홀진입·홀종료)
$MaxNoisePerFile = 1000    # 홀 번호만 있는 줄·Result/Score/Finish/Round 키워드 줄
$CoreSigs = @{ course_entered = 1; lobby_entered = 1; game_mode_seen = 1; exit_requested = 1; ended_hole = 1; enter_new_hole = 1 }
$MaxParseBytes = 200MB   # ponytail: 이보다 큰 로그는 목록 정보만. 현장 크기를 보고 필요하면 올린다
$MaxOutputChars = 5MB

# --- screen-golf-monitor.js 와 같은 정의 ---
$ReUeStamp     = [regex]'^\[(\d{4})\.(\d{2})\.(\d{2})-(\d{2})\.(\d{2})\.(\d{2}):(\d{3})\]'
$ReCourse      = [regex]'(?i)Browse:\s*/Game/Golf/Course/([^/?\s]+)(?:/[^?\s]+)?'
$ReLobbyBrowse = [regex]'(?i)Browse:\s*.*/UIMap(?:\?|\s|$)'
$ReGameMode    = [regex]"(?i)Game class is 'SGGameModeBase_C'"
$ReLobbyMode   = [regex]"(?i)Game class is 'BP_LobbyModebase_C'"
$ReExit        = [regex]'FPlatformMisc::RequestExit\(0\)'
# --- game-log-probe.js findSignals 와 같은 정의 ---
$ReHoleA   = [regex]'(?i)(?:hole|홀)\s*(?:no\.?|number|#|:|=|-)?\s*(\d{1,2})'
$ReHoleB   = [regex]'(?i)(\d{1,2})\s*(?:번\s*)?(?:hole|홀)'
$ReEnter   = [regex]'(?i)EnterNewHole'
$ReEnded   = [regex]'(?i)IsEndedHole'
$ReState   = [regex]'(?i)State:\s*(-?\d+)'
# --- 수집 전용 ---
$ReIsoStamp  = [regex]'(\d{4})[-./](\d{2})[-./](\d{2})[ T_-](\d{2})[:.](\d{2})[:.](\d{2})'
$ReTimeOnly  = [regex]'^\[?(\d{2}):(\d{2}):(\d{2})'
$ReAny       = [regex]"(?i)hole|홀|IsEnded|EnterNew|Result|Score|Finish|Round|Browse:|Game class is|RequestExit"
$Keywords = [ordered]@{
  hole = [regex]'(?i)hole|홀'; IsEnded = [regex]'(?i)IsEnded'; EnterNew = [regex]'(?i)EnterNew'
  Result = [regex]'(?i)Result'; Score = [regex]'(?i)Score'; Finish = [regex]'(?i)Finish'; Round = [regex]'(?i)Round'
}
$ReWord = [regex]'[A-Za-z_]+'

# 줄 모양에 남겨도 되는 단어. 그 밖의 단어는 w (고객 이름·계정이 ASCII여도 새지 않게)
$Allow = @{}
foreach ($w in @(
  'hole','holes','enter','new','open','level','state','ended','end','is','result','results','score','scores',
  'finish','finished','round','rounds','shot','shots','game','golf','course','browse','mode','lobby','map',
  'uimap','player','players','par','stroke','strokes','total','count','index','number','no','id','true','false',
  'none','null','start','started','begin','complete','completed','success','failed','fail','load','loaded',
  'travel','world','display','warning','error','verbose','log','ball','green','tee','cup','putt','distance',
  'reset','retry','restart','next','current','over','class','time','seconds','ms','sec','hit','set','get',
  'GameManager','EnterNewHole','CGameContext','IsEndedHole','ShotFinished','FPlatformMisc','RequestExit',
  'SGGameModeBase_C','BP_LobbyModebase_C','LogTemp','LogNet','LogLoad','LogWorld','LogInit','LogExit'
)) { $Allow[$w] = $true }

function ConvertTo-Ascii([string]$s) {
  if ($null -eq $s) { return $null }
  return [regex]::Replace($s, '[^\x20-\x7E]', '?')
}

function Get-LineShape([string]$line) {
  $s = $line
  if ($s.Length -gt 300) { $s = $s.Substring(0, 300) }
  $s = [regex]::Replace($s, '"[^"]*"', '""')
  $s = [regex]::Replace($s, "'[^']*'", "''")
  $s = [regex]::Replace($s, '[^\x20-\x7E]', '?')
  $s = [regex]::Replace($s, '\d', '#')
  return $ReWord.Replace($s, [System.Text.RegularExpressions.MatchEvaluator] {
    param($m)
    $v = $m.Value
    if ($Allow.ContainsKey($v)) { return $v }
    if ($v -cmatch '^Log[A-Z][a-z]+$') { return $v }   # UE 로그 분류 (LogGame 등)
    return 'w'
  })
}

function Get-IsoUtc($dt) { if ($null -eq $dt) { return $null }; return $dt.ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ssZ') }

function Get-NameShape([string]$name) {
  if ($name -match '^[A-Za-z0-9_.\-]+$') { return $name }
  return Get-LineShape $name
}

function Get-HoleNumber([string]$line) {
  foreach ($re in @($ReHoleA, $ReHoleB)) {
    foreach ($m in $re.Matches($line)) {
      $n = [int]$m.Groups[1].Value
      if ($n -ge 1 -and $n -le 36) { return $n }
    }
  }
  return $null
}

function Read-LogStamp([string]$line) {
  # 반환: @(형식, 문자열, DateTime 또는 $null)
  if ($line.Length -gt 0 -and $line[0] -eq '[') {
    $m = $ReUeStamp.Match($line)
    if ($m.Success) {
      $g = $m.Groups
      $t = '{0}-{1}-{2}T{3}:{4}:{5}.{6}' -f $g[1].Value, $g[2].Value, $g[3].Value, $g[4].Value, $g[5].Value, $g[6].Value, $g[7].Value
      $dt = $null; try { $dt = [datetime]::ParseExact($t, 'yyyy-MM-ddTHH:mm:ss.fff', [Globalization.CultureInfo]::InvariantCulture) } catch {}
      return @('ue', $t, $dt)
    }
  }
  $head = if ($line.Length -gt 40) { $line.Substring(0, 40) } else { $line }
  $m = $ReIsoStamp.Match($head)
  if ($m.Success) {
    $g = $m.Groups
    $t = '{0}-{1}-{2}T{3}:{4}:{5}' -f $g[1].Value, $g[2].Value, $g[3].Value, $g[4].Value, $g[5].Value, $g[6].Value
    $dt = $null; try { $dt = [datetime]::ParseExact($t, 'yyyy-MM-ddTHH:mm:ss', [Globalization.CultureInfo]::InvariantCulture) } catch {}
    return @('iso', $t, $dt)
  }
  $m = $ReTimeOnly.Match($line)
  if ($m.Success) { return @('timeonly', ('{0}:{1}:{2}' -f $m.Groups[1].Value, $m.Groups[2].Value, $m.Groups[3].Value), $null) }
  return @('none', $null, $null)
}

function Get-LineEvent([string]$line) {
  # 한 줄에서 신호 하나. 우선순위: 코스 > 로비 > 게임모드 > 종료요청 > 홀종료 > 홀진입 > 홀번호 > 키워드
  $m = $ReCourse.Match($line)
  if ($m.Success) {
    $id = $m.Groups[1].Value
    $kind = if ($id -match '^Practice_') { 'practice' } elseif ($id -match '^(?:Tutorial_|Test_)') { 'excluded' } else { 'regular' }
    $cid = if ($id -match '^[A-Za-z0-9_\-]{1,64}$') { $id } else { Get-LineShape $id }
    return [ordered]@{ sig = 'course_entered'; course = $cid; kind = $kind }
  }
  if ($ReLobbyMode.IsMatch($line) -or $ReLobbyBrowse.IsMatch($line)) { return [ordered]@{ sig = 'lobby_entered' } }
  if ($ReGameMode.IsMatch($line)) { return [ordered]@{ sig = 'game_mode_seen' } }
  if ($ReExit.IsMatch($line)) { return [ordered]@{ sig = 'exit_requested' } }
  $hole = Get-HoleNumber $line
  if ($ReEnded.IsMatch($line)) {
    $e = [ordered]@{ sig = 'ended_hole' }
    $sm = $ReState.Match($line); if ($sm.Success) { $e.state = [int]$sm.Groups[1].Value }
    if ($null -ne $hole) { $e.hole = $hole }
    return $e
  }
  if ($ReEnter.IsMatch($line)) {
    $e = [ordered]@{ sig = 'enter_new_hole' }
    if ($null -ne $hole) { $e.hole = $hole }
    return $e
  }
  if ($null -ne $hole) { return [ordered]@{ sig = 'hole_number'; hole = $hole } }
  foreach ($k in 'Result', 'Score', 'Finish', 'Round') {
    if ($Keywords[$k].IsMatch($line)) { return [ordered]@{ sig = ('kw_' + $k.ToLower()) } }
  }
  return $null
}

function Get-EncodingGuess([byte[]]$b, [int]$n) {
  if ($n -ge 3 -and $b[0] -eq 0xEF -and $b[1] -eq 0xBB -and $b[2] -eq 0xBF) { return @('utf8-bom', [Text.Encoding]::UTF8) }
  if ($n -ge 2 -and $b[0] -eq 0xFF -and $b[1] -eq 0xFE) { return @('utf16le-bom', [Text.Encoding]::Unicode) }
  if ($n -ge 2 -and $b[0] -eq 0xFE -and $b[1] -eq 0xFF) { return @('utf16be-bom', [Text.Encoding]::BigEndianUnicode) }
  $nul = 0; $oddNul = 0
  for ($i = 0; $i -lt $n; $i++) { if ($b[$i] -eq 0) { $nul++; if ($i % 2 -eq 1) { $oddNul++ } } }
  if ($n -gt 0 -and $nul / $n -gt 0.3 -and $oddNul / [Math]::Max(1, $nul) -gt 0.9) { return @('utf16le-nobom', [Text.Encoding]::Unicode) }
  if ($n -gt 0 -and $nul / $n -gt 0.01) { return @('binary', $null) }
  return @('text', [Text.Encoding]::UTF8)
}

function Read-LogFile($file) {
  $r = [ordered]@{
    name = Get-NameShape $file.Name
    sizeBytes = $file.Length
    createdUtc = Get-IsoUtc $file.CreationTime
    modifiedUtc = Get-IsoUtc $file.LastWriteTime
    open = $null
  }
  if ($file.Length -gt $MaxParseBytes) { $r.open = 'skipped_too_large'; return $r }

  $fs = $null
  try {
    $fs = New-Object IO.FileStream($file.FullName, [IO.FileMode]::Open, [IO.FileAccess]::Read, ([IO.FileShare]::ReadWrite -bor [IO.FileShare]::Delete))
  } catch {
    $ex = $_.Exception; if ($ex.InnerException) { $ex = $ex.InnerException }
    $r.open = 'error'
    $r.errorType = $ex.GetType().Name
    $r.errorHResult = ('0x{0:X8}' -f $ex.HResult)
    return $r
  }

  try {
    $r.open = 'ok'
    $buf = New-Object byte[] 4096
    $n = $fs.Read($buf, 0, 4096)
    $guess = Get-EncodingGuess $buf $n
    $r.encoding = $guess[0]
    if ($null -eq $guess[1]) { return $r }
    $fs.Position = 0
    $reader = New-Object IO.StreamReader($fs, $guess[1], $true)

    $fmt = [ordered]@{ ue = 0; iso = 0; timeonly = 0; none = 0 }
    $kw = [ordered]@{}; foreach ($k in $Keywords.Keys) { $kw[$k] = 0 }
    # 잡음 줄이 많아도 앞선 판(18홀 시험)의 핵심 신호가 밀려나지 않게 두 갈래로 따로 담는다
    $lanes = @{
      core  = @{ q = (New-Object 'System.Collections.Generic.Queue[object]'); cap = $MaxEventsPerFile; last = $null; lastKey = $null; truncated = $false }
      noise = @{ q = (New-Object 'System.Collections.Generic.Queue[object]'); cap = $MaxNoisePerFile; last = $null; lastKey = $null; truncated = $false }
    }
    $sigCounts = @{}
    $shapes = @{}
    $unparsed = 0
    $firstT = $null; $lastT = $null; $lastDt = $null; $lineNo = 0

    while ($null -ne ($line = $reader.ReadLine())) {
      $lineNo++
      $st = Read-LogStamp $line
      $fmt[$st[0]]++
      if ($null -ne $st[1]) { if ($null -eq $firstT) { $firstT = $st[1] }; $lastT = $st[1]; if ($null -ne $st[2]) { $lastDt = $st[2] } }
      if (-not $ReAny.IsMatch($line)) { continue }

      $hasKw = $false
      foreach ($k in $Keywords.Keys) { if ($Keywords[$k].IsMatch($line)) { $kw[$k]++; $hasKw = $true } }
      $e = Get-LineEvent $line
      if ($null -eq $e) {
        if ($hasKw) {
          $unparsed++
          if (-not $shapes.ContainsKey('unparsed')) { $shapes['unparsed'] = New-Object 'System.Collections.Generic.List[string]' }
          $sh = Get-LineShape $line
          if ($shapes['unparsed'].Count -lt 3 -and -not $shapes['unparsed'].Contains($sh)) { $shapes['unparsed'].Add($sh) }
        }
        continue
      }

      $sig = $e.sig
      $sigCounts[$sig] = 1 + [int]$sigCounts[$sig]
      $lane = if ($CoreSigs.ContainsKey($sig)) { $lanes.core } else { $lanes.noise }
      if (-not $shapes.ContainsKey($sig)) { $shapes[$sig] = New-Object 'System.Collections.Generic.List[string]' }
      if ($shapes[$sig].Count -lt 3) { $sh = Get-LineShape $line; if (-not $shapes[$sig].Contains($sh)) { $shapes[$sig].Add($sh) } }

      # 같은 신호(종류·홀·State·코스)가 연달아 나오면 한 건으로 묶는다
      $key = '{0}|{1}|{2}|{3}' -f $sig, $e.hole, $e.state, $e.course
      if ($null -ne $lane.last -and $key -eq $lane.lastKey) {
        $lane.last.n = [int]$lane.last.n + 1
        $lane.last.lastLine = $lineNo
        if ($null -ne $st[1]) { $lane.last.lastT = $st[1] }
        continue
      }
      $ev = [ordered]@{ line = $lineNo }
      if ($null -ne $st[1]) { $ev.t = $st[1] }
      foreach ($p in $e.Keys) { $ev[$p] = $e[$p] }
      $ev.n = 1
      $lane.q.Enqueue($ev)
      if ($lane.q.Count -gt $lane.cap) { [void]$lane.q.Dequeue(); $lane.truncated = $true }
      $lane.last = $ev; $lane.lastKey = $key
    }

    $r.lineCount = $lineNo
    $r.stampFormat = $fmt
    $r.firstLogTime = $firstT
    $r.lastLogTime = $lastT
    if ($null -ne $lastDt) {
      # 로그 시각이 UTC인지 판단용: 파일 수정시각(UTC) - 마지막 줄 시각. 0 근처면 UTC, 540 근처면 한국 시각
      $r.modifiedUtcMinusLastLogMinutes = [int][Math]::Round(($file.LastWriteTimeUtc - $lastDt).TotalMinutes)
    }
    $r.keywordCounts = $kw
    $r.keywordLinesUnparsed = $unparsed
    $sc = [ordered]@{}; foreach ($k in ($sigCounts.Keys | Sort-Object)) { $sc[$k] = $sigCounts[$k] }
    $r.signalLineCounts = $sc   # 묶기·자르기 전 줄 수
    $r.events = @($lanes.core.q.ToArray())
    $r.eventsTruncated = $lanes.core.truncated
    $r.noiseEvents = @($lanes.noise.q.ToArray())
    $r.noiseTruncated = $lanes.noise.truncated
    $sh = [ordered]@{}; foreach ($k in ($shapes.Keys | Sort-Object)) { $sh[$k] = @($shapes[$k].ToArray()) }
    $r.shapes = $sh
    return $r
  } catch {
    $r.open = 'read_error'
    $r.errorType = $_.Exception.GetType().Name
    return $r
  } finally {
    $fs.Dispose()
  }
}

function Read-Folder([string]$rootPath, [string]$rel, [string]$parseFilter) {
  $dir = Join-Path $rootPath $rel
  $f = [ordered]@{ path = $rel; exists = (Test-Path -LiteralPath $dir -PathType Container) }
  if (-not $f.exists) { return $f }
  $all = @(Get-ChildItem -LiteralPath $dir -File -ErrorAction SilentlyContinue)
  $f.fileCountAll = $all.Count
  if ($all.Count -gt 0) {
    $sorted = @($all | Sort-Object LastWriteTime)
    $f.oldestModifiedUtc = Get-IsoUtc $sorted[0].LastWriteTime
    $f.newestModifiedUtc = Get-IsoUtc $sorted[-1].LastWriteTime
    $f.retentionDays = [Math]::Round(($sorted[-1].LastWriteTime - $sorted[0].LastWriteTime).TotalDays, 1)
    $f.totalBytes = ($all | Measure-Object Length -Sum).Sum
    $f.nameTypes = @($all | ForEach-Object { [regex]::Replace((Get-NameShape $_.Name), '\d', '#') } | Sort-Object -Unique | Select-Object -First 20)
  }
  if ($parseFilter) {
    $since = (Get-Date).AddDays(-$Days)
    $pick = @($all | Where-Object { $_.Name -like $parseFilter -and $_.LastWriteTime -ge $since } | Sort-Object LastWriteTime -Descending | Select-Object -First $MaxFilesPerFolder)
    $f.parseFilter = $parseFilter
    $f.filesInWindow = @($all | Where-Object { $_.Name -like $parseFilter -and $_.LastWriteTime -ge $since }).Count
    $f.files = @($pick | Sort-Object LastWriteTime | ForEach-Object {
      Write-Host ("  읽는 중: {0} ({1:N1} MB)" -f (Get-NameShape $_.Name), ($_.Length / 1MB))
      Read-LogFile $_
    })
  }
  return $f
}

# ---------------- 실행 ----------------
try {
  Write-Host ''
  Write-Host "VISTA 라운드 증거 수집기 v$CollectorVersion (읽기 전용 - 게임과 파일을 바꾸지 않습니다)"
  Write-Host '로그를 읽는 중입니다. 기록이 많으면 몇 분(파일 50MB당 약 1분) 걸립니다. 창을 닫지 마세요...'

  $now = Get-Date
  $procs = @(Get-Process -ErrorAction SilentlyContinue | Where-Object { $_.ProcessName -like 'ScreenGolf*' })
  $procPaths = @(); foreach ($p in $procs) { try { if ($p.Path) { $procPaths += $p.Path } } catch {} }

  $screen = $null
  try { Add-Type -AssemblyName System.Windows.Forms; $b = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds; $screen = '{0}x{1}' -f $b.Width, $b.Height } catch {}

  # 게임 업데이트마다 폴더 이름이 바뀐다(PARK_260713-VISTA → PARK_261001-KD_VISTA).
  # 이름 끝을 가정하지 않고 ScreenGolf 폴더가 있는 PARK_* 전부 + 실행 중인 게임의 설치 폴더를 본다.
  $rootPaths = @(Get-ChildItem -LiteralPath $SearchRoot -Directory -Filter 'PARK_*' -ErrorAction SilentlyContinue |
    Where-Object { Test-Path -LiteralPath (Join-Path $_.FullName 'ScreenGolf') } | ForEach-Object { $_.FullName })
  foreach ($pp in $procPaths) {
    if ($pp -match '(?i)^(.+?)\\ScreenGolf\\Binaries\\Win64\\[^\\]+$' -and -not ($rootPaths -contains $Matches[1])) { $rootPaths += $Matches[1] }
  }

  $roots = @()
  foreach ($rootPath in $rootPaths) {
    $d = Get-Item -LiteralPath $rootPath
    $running = [bool](@($procPaths | Where-Object { $_.StartsWith($rootPath + '\', [StringComparison]::OrdinalIgnoreCase) }).Count)
    $exes = @()
    foreach ($exeDir in @($rootPath, (Join-Path $rootPath 'ScreenGolf\Binaries\Win64'))) {
      foreach ($x in @(Get-ChildItem -LiteralPath $exeDir -Filter '*.exe' -File -ErrorAction SilentlyContinue)) {
        $exes += [ordered]@{
          path = ConvertTo-Ascii ($x.FullName.Substring($rootPath.Length + 1))
          fileVersion = ConvertTo-Ascii $x.VersionInfo.FileVersion
          sizeBytes = $x.Length
          modifiedUtc = Get-IsoUtc $x.LastWriteTime
        }
      }
    }
    $roots += [ordered]@{
      root = ConvertTo-Ascii $d.Name
      gameRunningFromHere = $running
      exes = $exes
      folders = @(
        (Read-Folder $rootPath 'ScreenGolf\Saved\Logs' 'ScreenGolf*.log'),
        (Read-Folder $rootPath 'ScreenGolf\Binaries\Win64\Logs' 'main_*.log'),
        (Read-Folder $rootPath 'Launch\Logs' $null)
      )
    }
  }

  $tz = [TimeZoneInfo]::Local
  $record = [ordered]@{
    schema = 'vista-round-evidence/1'
    collectorVersion = $CollectorVersion
    runAtUtc = Get-IsoUtc $now
    localUtcOffsetMinutes = [int]$tz.GetUtcOffset($now).TotalMinutes
    timeZoneId = ConvertTo-Ascii $tz.Id
    pc = ConvertTo-Ascii $env:COMPUTERNAME
    screen = $screen
    gameRunning = ($procs.Count -gt 0)
    gameProcesses = @($procs | ForEach-Object { ConvertTo-Ascii $_.ProcessName } | Sort-Object -Unique)
    limits = [ordered]@{ days = $Days; maxFilesPerFolder = $MaxFilesPerFolder; maxEventsPerFile = $MaxEventsPerFile; maxParseBytes = $MaxParseBytes }
    roots = $roots
  }

  $json = ConvertTo-Json -InputObject $record -Depth 12 -Compress
  # 5MB 를 넘으면 잡음 사건부터 버리고, 그래도 넘으면 핵심 사건을 오래된 쪽부터 덜어낸다
  for ($i = 0; $json.Length -gt $MaxOutputChars -and $i -lt 8; $i++) {
    foreach ($r in $roots) { foreach ($f in $r.folders) { foreach ($x in @($f.files)) {
      if (-not $x) { continue }
      if ($i -eq 0) { if ($x.noiseEvents -and $x.noiseEvents.Count) { $x.noiseEvents = @(); $x.noiseTruncated = $true }; continue }
      if ($x.events -and $x.events.Count -gt 50) { $x.events = @($x.events | Select-Object -Last ([int]($x.events.Count / 2))); $x.eventsTruncated = $true }
    } } }
    $json = ConvertTo-Json -InputObject $record -Depth 12 -Compress
  }
  $json = [regex]::Replace($json, '[^\x00-\x7F]', '?')   # 마지막 안전장치: 결과에 비ASCII 금지

  $pcName = [regex]::Replace([string]$env:COMPUTERNAME, '[^A-Za-z0-9_\-]', '_')
  $outName = "round-evidence-$pcName.jsonl"
  $outPath = $null
  foreach ($dir in @($OutDir, [Environment]::GetFolderPath('Desktop'))) {
    if (-not $dir) { continue }
    try {
      $p = Join-Path $dir $outName
      [IO.File]::AppendAllText($p, $json + "`r`n", [Text.Encoding]::ASCII)
      $outPath = $p; break
    } catch {}
  }
  if (-not $outPath) { throw '결과 파일을 쓸 수 없습니다(수집기 폴더와 바탕화면 모두 실패).' }
  $runCount = @(Get-Content -LiteralPath $outPath).Count

  # ---- 화면 요약 ----
  Write-Host ''
  Write-Host ('게임 실행 중: ' + $(if ($record.gameRunning) { '예' } else { '아니오' }))
  if ($roots.Count -eq 0) { Write-Host "게임 설치 폴더(PARK_*)를 $SearchRoot 에서 찾지 못했습니다." }
  foreach ($r in $roots) {
    Write-Host ("[{0}]{1}" -f $r.root, $(if ($r.gameRunningFromHere) { ' (지금 실행 중인 게임)' } else { '' }))
    foreach ($f in $r.folders) {
      if (-not $f.exists) { Write-Host ("  {0}: 폴더 없음" -f $f.path); continue }
      $files = @($f.files)
      $ok = @($files | Where-Object { $_.open -eq 'ok' }).Count
      $bad = @($files | Where-Object { $_.open -ne 'ok' }).Count
      $line = "  {0}: 전체 {1}개, 최근 {2}일 분석 {3}개(열림 {4}, 못 엶 {5})" -f $f.path, $f.fileCountAll, $Days, $files.Count, $ok, $bad
      if (-not $f.parseFilter) { $line = "  {0}: 전체 {1}개(목록만)" -f $f.path, $f.fileCountAll }
      Write-Host $line
      $newest = $files | Where-Object { $_.open -eq 'ok' } | Select-Object -Last 1
      if ($newest -and $newest.events) {
        $ended = @($newest.events | Where-Object { $_.sig -eq 'ended_hole' -and $_.state -eq 1 })
        $courses = @($newest.events | Where-Object { $_.sig -eq 'course_entered' })
        Write-Host ("    가장 최근 파일: 코스 진입 {0}건, 홀 종료(State 1) {1}건" -f $courses.Count, $ended.Count)
      }
    }
  }
  Write-Host ''
  Write-Host "결과 파일: $outPath"
  Write-Host ("이 PC에서 지금까지 {0}번 실행됨 (결과는 이 파일 하나에 쌓입니다)" -f $runCount)
  if ($record.gameRunning) { Write-Host '다음: 게임을 완전히 종료한 뒤 이 수집기를 한 번 더 실행하세요.' }
  exit 0
} catch {
  Write-Host ''
  Write-Host ('수집 실패: ' + $_.Exception.GetType().Name + ' - ' + $_.Exception.Message)
  Write-Host '게임과 파일은 바뀌지 않았습니다. 이 화면을 사진으로 보내 주세요.'
  exit 1
}
