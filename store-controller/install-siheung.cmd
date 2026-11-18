@echo off
rem VISTA Siheung store controller install. Run on the Siheung HA Windows PC.
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0setup-controller.ps1" -StoreId 11111111-1111-4111-8111-111111111111 -ControllerId vista-siheung-controller
echo.
pause
