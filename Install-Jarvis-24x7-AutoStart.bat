@echo off
title Install Jarvis 24/7 Windows Auto-Start
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\install-autostart.ps1"
echo.
echo Starting Jarvis in 24/7 background mode now...
wscript.exe "%~dp0start-jarvis-background.vbs"
echo.
pause
