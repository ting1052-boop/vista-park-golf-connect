@echo off
set "VISTA_AGENT_OFFLINE=1"
set "VISTA_AGENT_PROFILE_DIR=%~dp0test-profile"
start "VISTA Agent Offline Test" "%~dp0VISTA Bay Agent.exe"
