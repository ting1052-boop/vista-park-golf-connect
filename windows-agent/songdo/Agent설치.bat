@echo off
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0install-agent.ps1"
set "INSTALL_EXIT=%ERRORLEVEL%"
echo.
echo Installer exit code: %INSTALL_EXIT%
pause
exit /b %INSTALL_EXIT%
