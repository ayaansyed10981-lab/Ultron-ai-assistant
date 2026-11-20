@echo off
title Train Agent Friday Voice ("Hey Friday")
cd /d "%~dp0"
echo ============================================================
echo   TRAIN AGENT FRIDAY: EXECUTIVE DOCUMENT ARCHITECT (WORD & PDF)
echo ============================================================
echo.
echo Stopping any running Ultron instances to free microphone...
taskkill /F /IM node.exe >nul 2>&1
ping -n 2 127.0.0.1 >nul

node src/enroll_voice.js --agent friday

echo.
echo ============================================================
echo Restarting Ultron Multi-Agent Team in background 24/7...
wscript.exe "%~dp0start-ultron-background.vbs"
ping -n 3 127.0.0.1 >nul
echo.
echo   [+] Friday voice profile calibrated! Say "Hey Friday".
echo ============================================================
echo.
pause
