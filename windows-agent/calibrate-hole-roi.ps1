# 홀 번호 OCR 영역(ROI)을 현장에서 맞추기 위한 측정 도구.
#
# Agent 와 같은 방식으로 게임 창을 캡처하고, 지정한 비율 영역을 잘라
# Windows OCR 이 실제로 무엇을 읽는지 그대로 보여준다.
# 추측으로 좌표를 바꾸지 않고, 읽힌 글자를 보고 조정하기 위한 것이다.
#
# 사용 예:
#   powershell -ExecutionPolicy Bypass -File .\calibrate-hole-roi.ps1
#   powershell -ExecutionPolicy Bypass -File .\calibrate-hole-roi.ps1 -X 0 -Y 0.02 -Width 0.25 -Height 0.08
#   powershell -ExecutionPolicy Bypass -File .\calibrate-hole-roi.ps1 -Full     (창 전체를 읽어 위치 파악)

param(
  [string]$WindowTitle = "NewGameViewportClientWindow",
  [double]$X = 0.0,
  [double]$Y = 0.02,
  [double]$Width = 0.25,
  [double]$Height = 0.08,
  [switch]$Full,
  [switch]$KeepImage
)

$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Drawing

Add-Type @"
using System;
using System.Runtime.InteropServices;
public class VistaWin {
  [StructLayout(LayoutKind.Sequential)]
  public struct RECT { public int Left, Top, Right, Bottom; }
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hWnd, out RECT lpRect);
}
"@

$proc = Get-Process | Where-Object { $_.MainWindowTitle -eq $WindowTitle } | Select-Object -First 1
if (-not $proc) {
  Write-Host "창을 찾지 못했습니다: $WindowTitle"
  Write-Host "현재 창 목록:"
  Get-Process | Where-Object { $_.MainWindowTitle } | Select-Object ProcessName, MainWindowTitle | Format-Table -AutoSize
  exit 1
}

$rect = New-Object VistaWin+RECT
[void][VistaWin]::GetWindowRect($proc.MainWindowHandle, [ref]$rect)
$winW = $rect.Right - $rect.Left
$winH = $rect.Bottom - $rect.Top
Write-Host ("창: {0}  위치 {1},{2}  크기 {3}x{4}" -f $WindowTitle, $rect.Left, $rect.Top, $winW, $winH)

if ($Full) { $X = 0.0; $Y = 0.0; $Width = 1.0; $Height = 1.0 }

$cropX = [int]($rect.Left + $winW * $X)
$cropY = [int]($rect.Top + $winH * $Y)
$cropW = [Math]::Max(1, [int]($winW * $Width))
$cropH = [Math]::Max(1, [int]($winH * $Height))
Write-Host ("읽을 영역: 비율 x=$X y=$Y w=$Width h=$Height  ->  화면 {0},{1} {2}x{3}" -f $cropX, $cropY, $cropW, $cropH)

$bmp = New-Object System.Drawing.Bitmap($cropW, $cropH)
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.CopyFromScreen($cropX, $cropY, 0, 0, $bmp.Size)
$g.Dispose()

# 작은 글자는 그대로면 인식률이 떨어진다. Agent 와 같은 기준으로 2배 확대한다.
if ($cropW -lt 900 -and $cropH -lt 500) {
  $scaled = New-Object System.Drawing.Bitmap($bmp, [System.Drawing.Size]::new([Math]::Min(1800, $cropW * 2), $cropH * 2))
  $bmp.Dispose()
  $bmp = $scaled
}

$out = Join-Path $env:TEMP ("vista-hole-roi-" + (Get-Date -Format "HHmmss") + ".png")
$bmp.Save($out, [System.Drawing.Imaging.ImageFormat]::Png)
$bmp.Dispose()

$ocr = Join-Path (Split-Path -Parent $MyInvocation.MyCommand.Path) "hole-ocr.ps1"
if (-not (Test-Path $ocr)) { Write-Host "hole-ocr.ps1 이 같은 폴더에 없습니다."; exit 1 }

$result = & powershell -ExecutionPolicy Bypass -File $ocr -ImagePath $out
Write-Host ""
Write-Host "=== OCR 이 읽은 글자 ==="
try { (($result | ConvertFrom-Json).text) } catch { $result }
Write-Host "========================"
Write-Host ("캡처 이미지: " + $out)
if (-not $KeepImage) { Remove-Item $out -Force -ErrorAction SilentlyContinue }
