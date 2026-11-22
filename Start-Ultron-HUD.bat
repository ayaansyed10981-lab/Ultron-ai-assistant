@echo off
title Ultron Multi-Agent Holographic HUD
cd /d "%~dp0"

echo ============================================================
echo        ULTRON MULTI-AGENT HOLOGRAPHIC HUD & GESTURE HUB
echo ============================================================
echo.

:: 1. Check if Ultron background process is already running
tasklist /FI "IMAGENAME eq node.exe" 2>NUL | find /I /N "node.exe">NUL
if %ERRORLEVEL% equ 0 goto :ULTRON_RUNNING

:: 2. If not running, start Ultron 24/7 background service first
echo [+] Starting Ultron 24/7 Multi-Agent background service...
wscript.exe "%~dp0start-ultron-background.vbs"
ping -n 3 127.0.0.1 >nul

:ULTRON_RUNNING
echo [+] Ultron background service is active.
echo [+] Launching Holographic HUD desktop window...

:: 3. Launch Edge in standalone desktop app window mode (looks like a native frameless app)
set "EDGE_EXE="
if exist "%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe" set "EDGE_EXE=%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe"
if exist "%ProgramFiles%\Microsoft\Edge\Application\msedge.exe" set "EDGE_EXE=%ProgramFiles%\Microsoft\Edge\Application\msedge.exe"
if exist "%LOCALAPPDATA%\Microsoft\Edge\Application\msedge.exe" set "EDGE_EXE=%LOCALAPPDATA%\Microsoft\Edge\Application\msedge.exe"

if defined EDGE_EXE (
    start "" "%EDGE_EXE%" --app=http://localhost:3800
) else (
    start "" "http://localhost:3800"
)

echo.
echo ============================================================
echo   [+] HUD IS NOW ACTIVE!
echo.
echo   - Camera hand gestures are active on the left radar.
echo   - If you close the HUD window (click 'X' or Fist gesture),
echo     Ultron stays running 24/7 in background.
echo   - Say "Hey Ultron, open UI" anytime to bring it back!
echo ============================================================
echo.
exit
