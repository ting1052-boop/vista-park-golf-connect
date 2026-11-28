$ErrorActionPreference = 'Stop'
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class VistaInputSnapshot {
    [StructLayout(LayoutKind.Sequential)]
    public struct LastInput { public uint cbSize; public uint dwTime; }
    [DllImport("user32.dll")] public static extern bool GetLastInputInfo(ref LastInput info);
    [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr window, out uint processId);
}
'@
$inputInfo = New-Object VistaInputSnapshot+LastInput
$inputInfo.cbSize = [System.Runtime.InteropServices.Marshal]::SizeOf($inputInfo)
if (-not [VistaInputSnapshot]::GetLastInputInfo([ref]$inputInfo)) { throw 'Input snapshot unavailable' }
$foregroundId = [uint32]0
$null = [VistaInputSnapshot]::GetWindowThreadProcessId([VistaInputSnapshot]::GetForegroundWindow(), [ref]$foregroundId)
$process = Get-Process -Id $foregroundId -ErrorAction Stop
# No key values, window titles, or customer information are collected.
@{ inputTick = [long]$inputInfo.dwTime; foregroundProcess = $process.ProcessName } | ConvertTo-Json -Compress
