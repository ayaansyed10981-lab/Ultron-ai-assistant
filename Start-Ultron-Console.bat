@echo off
title Ultron Multi-Agent AI Assistant (Live Console)
cd /d "%~dp0"
echo ============================================================
echo           ULTRON MULTI-AGENT VOICE TEAM ONLINE
echo ============================================================
echo.
echo Operatives Ready:
echo   [+] Ultron : Supreme Commander and PC Control (Say "Hey Ultron")
echo   [+] Vision : Software and SQL Database       (Say "Hey Vision")
echo   [+] Friday : Word and PDF Document Architect (Say "Hey Friday")
echo   [+] Jarvis : Quality Assurance and Inspector (Say "Hey Jarvis")
echo ============================================================
echo.
echo Note: Keep this window open if you want to view live text logs.
echo (To run silently in the background 24/7, use Start-Ultron.bat instead)
echo.
echo Stopping any stale node instances...
taskkill /F /IM node.exe >nul 2>&1
ping -n 2 127.0.0.1 >nul
echo Starting Ultron...
node src/index.js
echo.
echo [Ultron stopped]
pause
