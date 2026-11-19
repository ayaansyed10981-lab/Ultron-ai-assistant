@echo off
title Ultron Personal Voice Training (Windows ARM64)
cd /d "%~dp0"
powershell -NoProfile -Command "Get-CimInstance Win32_Process -ErrorAction SilentlyContinue | Where-Object { $_.CommandLine -like '*jarvis-assistant*src*index.js*' -or $_.CommandLine -like '*jarvis-assistant*mic_stream.ps1*' -or $_.CommandLine -like '*jarvis-assistant*tray.ps1*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }" >nul 2>&1
node src/enroll_voice.js
echo.
echo Restarting Ultron in 24/7 background mode with your new voice profile...
wscript.exe "%~dp0start-jarvis-background.vbs"
echo Done! Say "Hey Ultron" anytime.
pause
