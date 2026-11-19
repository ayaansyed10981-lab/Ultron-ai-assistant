@echo off
cd /d "%~dp0"
if not exist "node_modules" (
    echo Installing dependencies...
    call npm.cmd install
)
powershell -NoProfile -Command "Get-CimInstance Win32_Process -ErrorAction SilentlyContinue | Where-Object { $_.CommandLine -like '*jarvis-assistant*src*index.js*' -or $_.CommandLine -like '*jarvis-assistant*wake_listener.ps1*' -or $_.CommandLine -like '*jarvis-assistant*mic_stream.ps1*' -or $_.CommandLine -like '*jarvis-assistant*tray.ps1*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }" >nul 2>&1
wscript.exe "%~dp0start-jarvis-background.vbs"
exit
