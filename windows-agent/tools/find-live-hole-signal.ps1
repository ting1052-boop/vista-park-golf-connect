# Read-only diagnostic. Does the live-readable ScreenGolf.log (UE, UTC) print anything
# at the moment a hole changes? Hole-change times come from main_2026_11_25_23_36_05.log
# (A-02 test rounds, KST). Prints only digit-masked line shapes, no raw log text.
param([string]$SearchRoot = 'C:\', [int]$WindowSec = 4)
$ErrorActionPreference = 'Stop'

$kst = @(
  '2026-11-25 23:46:23','2026-11-25 23:47:28','2026-11-25 23:49:08','2026-11-25 23:50:30',
  '2026-11-25 23:51:13','2026-11-25 23:51:21','2026-11-25 23:51:43','2026-11-25 23:51:50',
  '2026-11-25 23:51:54','2026-11-25 23:52:17','2026-11-25 23:52:22','2026-11-25 23:52:30',
  '2026-11-25 23:52:35','2026-11-25 23:52:42','2026-11-25 23:52:48','2026-11-25 23:52:57',
  '2026-11-25 23:53:02','2026-11-25 23:53:08','2026-11-25 23:55:44','2026-11-25 23:56:41',
  '2026-11-25 23:57:56','2026-11-25 23:58:39','2026-11-25 23:58:53','2026-11-25 23:58:59',
  '2026-11-25 23:59:04','2026-11-25 23:59:09','2026-11-26 00:01:31','2026-11-26 00:03:15')
$inv = [Globalization.CultureInfo]::InvariantCulture
$holeUtc = @($kst | ForEach-Object { [datetime]::ParseExact($_, 'yyyy-MM-dd HH:mm:ss', $inv).AddHours(-9) })
$from = $holeUtc[0].AddMinutes(-15); $to = $holeUtc[-1].AddMinutes(10)

$files = @(Get-ChildItem -LiteralPath $SearchRoot -Directory -Filter 'PARK_*' -ErrorAction SilentlyContinue |
  ForEach-Object { Join-Path $_.FullName 'ScreenGolf\Saved\Logs' } |
  Where-Object { Test-Path -LiteralPath $_ } |
  ForEach-Object { Get-ChildItem -LiteralPath $_ -Filter 'ScreenGolf*.log' })
if ($files.Count -eq 0) { Write-Output 'No ScreenGolf*.log found under PARK_*'; exit 1 }

$rx = '^\[(\d{4})\.(\d{2})\.(\d{2})-(\d{2})\.(\d{2})\.(\d{2}):(\d{3})\]\[\s*\d+\](.*)$'
$shapes = @{}; $inRange = 0; $used = @()
foreach ($f in $files) {
  $fs = [IO.File]::Open($f.FullName, 'Open', 'Read', [IO.FileShare]::ReadWrite -bor [IO.FileShare]::Delete)
  $sr = New-Object IO.StreamReader($fs, [Text.Encoding]::UTF8)
  $hitFile = $false
  while ($null -ne ($line = $sr.ReadLine())) {
    if ($line -notmatch $rx) { continue }
    $t = New-Object DateTime ([int]$Matches[1]), ([int]$Matches[2]), ([int]$Matches[3]), ([int]$Matches[4]), ([int]$Matches[5]), ([int]$Matches[6])
    if ($t -lt $from -or $t -gt $to) { continue }
    $inRange++; $hitFile = $true
    $shape = ($Matches[8] -replace '\d', '#').Trim()
    if ($shape.Length -gt 140) { $shape = $shape.Substring(0, 140) }
    if (-not $shapes.ContainsKey($shape)) { $shapes[$shape] = @{ total = 0; hits = New-Object 'System.Collections.Generic.HashSet[int]' } }
    $e = $shapes[$shape]; $e.total++
    for ($i = 0; $i -lt $holeUtc.Count; $i++) {
      if ([math]::Abs(($t - $holeUtc[$i]).TotalSeconds) -le $WindowSec) { [void]$e.hits.Add($i) }
    }
  }
  $sr.Close()
  if ($hitFile) { $used += $f.Name }
}

Write-Output "files=$($used -join ', ')  linesInRange=$inRange  holeChanges=$($holeUtc.Count)  window=+-${WindowSec}s"
Write-Output 'hits/28  total  shape'
$shapes.GetEnumerator() |
  Sort-Object @{ Expression = { $_.Value.hits.Count }; Descending = $true }, @{ Expression = { $_.Value.total } } |
  Select-Object -First 20 |
  ForEach-Object { '{0,5}  {1,5}  {2}' -f $_.Value.hits.Count, $_.Value.total, $_.Key }
