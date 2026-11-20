@echo off
title Ultron Multi-Agent Voice Training (Windows ARM64)
cd /d "%~dp0"
echo ============================================================
echo      ULTRON MULTI-AGENT VOICE TRAINING (ARM64)
echo ============================================================
echo.
echo Stopping any running Ultron instances to free microphone...
taskkill /F /IM node.exe >nul 2>&1
ping -n 2 127.0.0.1 >nul

node src/enroll_voice.js %*

echo.
echo ============================================================
echo Restarting Ultron Multi-Agent Team in background 24/7...
wscript.exe "%~dp0start-ultron-background.vbs"
ping -n 3 127.0.0.1 >nul
echo.
echo   [+] Voice training complete! Ultron is active 24/7.
echo       - Say "Hey Ultron" for Supreme Commander
echo       - Say "Hey Vision" for Coding and SQL
echo       - Say "Hey Friday" for Word and PDF Documents
echo       - Say "Hey Jarvis" for QA and Inspector
echo ============================================================
echo.
pause
