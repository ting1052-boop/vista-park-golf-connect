# Home Assistant VirtualBox VM 자동 시작 (현장용, 한 번 실행)
#
# 매장 HA 는 Windows 위 VirtualBox VM 이다. 정전 뒤 PC 가 다시 켜져도 HA 가
# 스스로 켜지도록, 로그인하면 VM 을 화면 없이(headless) 시작하는 작업을 등록한다.
#
# 관리자 권한으로 올리지 않는다. VirtualBox VM 은 사용자별로 등록되어,
# 평소 로그인하는 그 계정으로 실행해야 VM 을 찾는다.
#
# 이 파일은 한글이 있어 UTF-8 BOM 으로 저장해야 한다.

param(
  [string]$VmName = "HomeAssistant",
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

$identity = [Security.Principal.WindowsIdentity]::GetCurrent()
Write-Host ""
Write-Host "==================================================" -ForegroundColor Cyan
Write-Host " HA VM 자동 시작 설정$(if ($DryRun) { ' (DryRun)' })" -ForegroundColor Cyan
Write-Host "==================================================" -ForegroundColor Cyan
Write-Host "  PC 이름 : $env:COMPUTERNAME"
Write-Host "  계정    : $($identity.Name)"

# --- VBoxManage 찾기 ---------------------------------------------------------
$candidates = @("C:\Program Files\Oracle\VirtualBox\VBoxManage.exe")
if ($env:VBOX_MSI_INSTALL_PATH) { $candidates = @(Join-Path $env:VBOX_MSI_INSTALL_PATH "VBoxManage.exe") + $candidates }
$vbox = $candidates | Where-Object { Test-Path $_ } | Select-Object -First 1

if (-not $vbox) {
  if ($DryRun) { Write-Host "  VirtualBox: 이 PC 에는 없음 (DryRun 이라 계속)"; exit 0 }
  Fail "VirtualBox 를 찾지 못했습니다. VirtualBox 를 먼저 설치하세요."
}

# --- VM 확인 -----------------------------------------------------------------
$vms = & $vbox list vms 2>$null
if (-not ($vms -match "^`"$([regex]::Escape($VmName))`"")) {
  Write-Host ""
  Write-Host "  등록된 VM:" ; $vms | ForEach-Object { Write-Host "    $_" }
  Fail "'$VmName' 이라는 VM 이 없습니다. VM 이름을 $VmName 으로 바꾸거나, -VmName 으로 알려주세요."
}

$info = & $vbox showvminfo $VmName --machinereadable 2>$null
$nic = ($info | Where-Object { $_ -match '^nic1=' }) -replace '^nic1="?([^"]*)"?$', '$1'
$fw = ($info | Where-Object { $_ -match '^firmware=' }) -replace '^firmware="?([^"]*)"?$', '$1'
$mem = ($info | Where-Object { $_ -match '^memory=' }) -replace '^memory=', ''
Write-Host ""
Write-Host "  VM 점검"
Write-Host ("    네트워크 : {0}  {1}" -f $nic, $(if ($nic -eq 'bridged') { '정상' } else { '← 브리지 어댑터로 바꿔야 합니다' }))
Write-Host ("    펌웨어   : {0}  {1}" -f $fw, $(if ($fw -eq 'EFI') { '정상' } else { '← EFI 를 켜야 부팅됩니다' }))
Write-Host ("    메모리   : {0} MB  {1}" -f $mem, $(if ([int]$mem -ge 2048) { '정상' } else { '← 2048 이상 권장' }))
if ($nic -ne 'bridged') { Fail "VM 네트워크가 브리지가 아닙니다. NAT 면 HA 가 매장 PC 를 못 봅니다. VM 을 끄고 설정 > 네트워크 > 어댑터1 > 브리지 어댑터로 바꾸세요." }

if ($DryRun) { Write-Host ""; Write-Host "  (DryRun: 작업을 등록하지 않았습니다)"; exit 0 }

# --- 로그인 시 VM 시작 작업 등록 ---------------------------------------------
$taskName = "VISTA HA VM 자동시작"
$action = New-ScheduledTaskAction -Execute $vbox -Argument "startvm `"$VmName`" --type headless"
$trigger = New-ScheduledTaskTrigger -AtLogOn -User $identity.Name
$trigger.Delay = "PT30S"
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -ExecutionTimeLimit (New-TimeSpan -Minutes 5)
Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Settings $settings -Description "로그인 30초 뒤 HA VM 을 headless 로 시작" -Force | Out-Null
Write-Host ""
Write-Host "  작업 등록: $taskName (로그인 30초 뒤)" -ForegroundColor Green

# --- 절전 끄기 (전원 연결 시) -------------------------------------------------
try {
  powercfg /change standby-timeout-ac 0 | Out-Null
  powercfg /change hibernate-timeout-ac 0 | Out-Null
  Write-Host "  절전·최대절전 끔 (전원 연결 시)" -ForegroundColor Green
} catch {
  Write-Host "  절전 설정은 직접 바꿔주세요: 설정 > 시스템 > 전원 > 절전 모드 '안 함'" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "==================================================" -ForegroundColor Green
Write-Host " 완료. 아래 두 가지는 사장님이 직접 해주세요" -ForegroundColor Green
Write-Host "==================================================" -ForegroundColor Green
Write-Host "  1) Windows 자동 로그인: Win+R > netplwiz > '사용자 이름과 암호를 입력해야 이 컴퓨터를"
Write-Host "     사용할 수 있음' 체크 해제 > 비밀번호 입력. (로그인이 돼야 VM 이 켜집니다)"
Write-Host "  2) BIOS 정전 복구: 'Restore on AC Power Loss' 를 'Power On' 으로."
Write-Host "     (정전 뒤 전기가 들어오면 PC 가 스스로 켜집니다)"
Write-Host ""
Read-Host "엔터를 누르면 닫습니다" | Out-Null
