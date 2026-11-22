@echo off
title Restarting Ultron Multi-Agent Team
cd /d "%~dp0"
echo ============================================================
echo        RESTARTING ULTRON MULTI-AGENT TEAM
echo ============================================================
echo.
echo Stopping previous instances...
taskkill /F /IM node.exe >nul 2>&1
ping -n 2 127.0.0.1 >nul

echo Starting Ultron, Vision, Friday, and Jarvis in the background...
wscript.exe "%~dp0start-ultron-background.vbs"
ping -n 3 127.0.0.1 >nul

echo.
echo ============================================================
echo   [+] ULTRON HAS BEEN RESTARTED IN THE BACKGROUND!
echo   You can safely close this window and File Explorer now.
echo     - Say "Hey Ultron" for Commander Ultron
echo     - Say "Hey Vision" for Coding and SQL
echo     - Say "Hey Friday" for Word and PDF Documents
echo     - Say "Hey Jarvis" for QA and Inspector
echo     - Say "Hey Veronica" for Visual Media and Video Loops
echo ============================================================
echo.
ping -n 3 127.0.0.1 >nul
exit
