@echo off
rem VISTA round evidence collector (read-only). See README-round-evidence-ko.txt
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0collect-round-evidence.ps1" %*
echo.
pause
