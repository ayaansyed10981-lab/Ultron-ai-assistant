@echo off
title Stopping Ultron
cd /d "%~dp0"
echo ============================================================
echo          STOPPING ULTRON MULTI-AGENT TEAM
echo ============================================================
echo.
echo Stopping all running agent processes...
taskkill /F /IM node.exe >nul 2>&1
echo Done! Ultron, Vision, and Friday have been stopped.
ping -n 3 127.0.0.1 >nul
exit
