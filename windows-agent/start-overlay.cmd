@echo off
cd /d "%~dp0"
if not exist node_modules\electron (
  echo Installing Electron dependencies...
  npm install
)
npm run start:overlay
