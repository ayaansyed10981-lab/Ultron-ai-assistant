@echo off
title Install Ultron 24/7 Windows Auto-Start
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\install-autostart.ps1"
echo.
echo Starting Ultron in 24/7 background mode now...
wscript.exe "%~dp0start-ultron-background.vbs"
echo.
pause
