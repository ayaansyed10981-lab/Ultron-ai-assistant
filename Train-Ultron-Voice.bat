@echo off
title Train Commander Ultron Voice ("Hey Ultron")
cd /d "%~dp0"
echo ============================================================
echo   TRAIN COMMANDER ULTRON: SUPREME COMMANDER
echo ============================================================
echo.
echo Stopping any running Ultron instances to free microphone...
taskkill /F /IM node.exe >nul 2>&1
ping -n 2 127.0.0.1 >nul

node src/enroll_voice.js --agent ultron

echo.
echo ============================================================
echo Restarting Ultron Multi-Agent Team in background 24/7...
wscript.exe "%~dp0start-ultron-background.vbs"
ping -n 3 127.0.0.1 >nul
echo.
echo   [+] Ultron voice profile calibrated! Say "Hey Ultron".
echo ============================================================
echo.
pause
