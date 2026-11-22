@echo off
title Train Agent Veronica Voice ("Hey Veronica")
cd /d "%~dp0"
echo ============================================================
echo   TRAIN AGENT VERONICA: CHIEF VISUAL MEDIA DIRECTOR
echo ============================================================
echo.
echo Stopping any running Ultron instances to free microphone...
taskkill /F /IM node.exe >nul 2>&1
ping -n 2 127.0.0.1 >nul

node src/enroll_voice.js --agent veronica

echo.
echo ============================================================
echo Restarting Ultron Multi-Agent Team in background 24/7...
wscript.exe "%~dp0start-ultron-background.vbs"
ping -n 3 127.0.0.1 >nul
echo.
echo   [+] Veronica voice profile calibrated! Say "Hey Veronica".
echo ============================================================
echo.
pause
