@echo off
title Train Jarvis Voice Profile ("Hey Jarvis")
cd /d "%~dp0"
echo ============================================================
echo      TRAIN AGENT JARVIS VOICE PROFILE ("Hey Jarvis")
echo      Chief Quality Assurance Engineer ^& System Inspector
echo ============================================================
echo.
echo Stopping any running Ultron instances to free microphone...
taskkill /F /IM node.exe >nul 2>&1
ping -n 2 127.0.0.1 >nul

node src/enroll_voice.js --agent jarvis

echo.
echo ============================================================
echo Restarting Ultron Multi-Agent Team in background 24/7...
wscript.exe "%~dp0start-ultron-background.vbs"
ping -n 3 127.0.0.1 >nul
echo.
echo   [+] Jarvis voice profile saved! Operatives active 24/7.
echo ============================================================
echo.
pause
