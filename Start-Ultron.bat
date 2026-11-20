@echo off
title Starting Ultron Multi-Agent Team
cd /d "%~dp0"
echo ============================================================
echo        ULTRON MULTI-AGENT TEAM STARTING 24/7
echo ============================================================
echo.
echo Stopping any previous instances...
taskkill /F /IM node.exe >nul 2>&1
ping -n 2 127.0.0.1 >nul

echo Starting Ultron, Vision, Friday, and Jarvis in the background...
wscript.exe "%~dp0start-ultron-background.vbs"
ping -n 3 127.0.0.1 >nul

echo.
echo ============================================================
echo   [+] ULTRON IS NOW RUNNING 24/7 IN THE BACKGROUND!
echo.
echo   You can safely close this window and File Explorer now.
echo   Ultron, Vision, Friday, and Jarvis will stay alive:
echo     - Say "Hey Ultron" for Commander Ultron
echo     - Say "Hey Vision" for Coding and SQL
echo     - Say "Hey Friday" for Word and PDF Documents
echo     - Say "Hey Jarvis" for QA and Inspector
echo ============================================================
echo.
echo Closing this launcher window in 3 seconds...
ping -n 4 127.0.0.1 >nul
exit
