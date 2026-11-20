@echo off
title Push Ultron Multi-Agent Team to GitHub
cd /d "%~dp0"
echo ============================================================
echo      PUSH ULTRON MULTI-AGENT TEAM TO GITHUB
echo ============================================================
echo.

:: 1. Locate Git executable
set "GIT_CMD=git"
where git >nul 2>&1
if %ERRORLEVEL% equ 0 goto :GIT_FOUND

if exist "C:\Program Files\Git\cmd\git.exe" (
    set "GIT_CMD=C:\Program Files\Git\cmd\git.exe"
    goto :GIT_FOUND
)
if exist "%LOCALAPPDATA%\Programs\Git\cmd\git.exe" (
    set "GIT_CMD=%LOCALAPPDATA%\Programs\Git\cmd\git.exe"
    goto :GIT_FOUND
)
for /d %%D in ("%LOCALAPPDATA%\GitHubDesktop\app-*") do (
    if exist "%%D\resources\app\git\cmd\git.exe" (
        set "GIT_CMD=%%D\resources\app\git\cmd\git.exe"
        goto :GIT_FOUND
    )
)

echo [!] Notice: Git CLI was not found in standard PATH.
echo.
echo If you use GitHub Desktop:
echo   1. Open GitHub Desktop app.
echo   2. You will see all your updated files on the left panel.
echo   3. In the Summary box at the bottom-left, type:
echo      Update Ultron Multi-Agent Team (Vision, Friday, Jarvis, Avengers assemble)
echo   4. Click the blue 'Commit to main' button.
echo   5. Click 'Push origin' at the top bar.
echo.
pause
exit /b 1

:GIT_FOUND
echo [+] Git detected: %GIT_CMD%
echo.

:: 2. Safety Enforcer: ensure sensitive files are never cached or staged
"%GIT_CMD%" rm --cached .env >nul 2>&1
"%GIT_CMD%" rm -r --cached voice-profile >nul 2>&1
"%GIT_CMD%" rm -r --cached logs >nul 2>&1
"%GIT_CMD%" rm -r --cached models >nul 2>&1
"%GIT_CMD%" rm -r --cached .tmp >nul 2>&1

:: 3. Stage public project files
echo [+] Staging code and documentation...
"%GIT_CMD%" add -A

:: 4. Strict Security Verification Check
set "SECURITY_ALERT=0"
for /f "tokens=*" %%F in ('"%GIT_CMD%" diff --cached --name-only') do (
    if "%%F"==".env" (
        echo [!] SECURITY WARNING: .env was staged. Unstaging immediately...
        "%GIT_CMD%" reset HEAD .env >nul 2>&1
        set "SECURITY_ALERT=1"
    )
    echo %%F | findstr /i /c:"voice-profile" >nul 2>&1
    if not errorlevel 1 (
        echo [!] SECURITY WARNING: voice-profile was staged. Unstaging immediately...
        "%GIT_CMD%" reset HEAD voice-profile >nul 2>&1
        set "SECURITY_ALERT=1"
    )
)

echo.
echo ============================================================
echo   [SAFE] Verified files staged to be pushed:
echo ============================================================
"%GIT_CMD%" diff --cached --name-only
echo ============================================================
echo   Notice: .env (API Key) and voice-profile (Voice Data) are
echo   EXCLUDED from this list and will NEVER be uploaded to GitHub.
echo ============================================================
echo.

:: 5. Commit
echo [+] Creating commit...
"%GIT_CMD%" commit -m "Update Ultron Multi-Agent Team: Vision, Friday, Jarvis, Avengers assemble, and parallel execution"
if %ERRORLEVEL% neq 0 (
    echo.
    echo [i] Note: Working tree is clean or already committed.
)

:: 6. Push
echo.
echo [+] Pushing to GitHub (origin main)...
"%GIT_CMD%" push origin main

if %ERRORLEVEL% equ 0 (
    echo.
    echo ============================================================
    echo   [+] SUCCESSFULLY PUSHED TO GITHUB!
    echo   Repository: https://github.com/ayaansyed10981-lab/Ultron-ai-assistant
    echo   - Your Gemini API Key is 100%% SAFE and STAYED LOCAL.
    echo   - Your Voice Profile recordings are 100%% SAFE and STAYED LOCAL.
    echo ============================================================
) else (
    echo.
    echo [!] Push encountered an issue or authentication is required.
    echo If prompted, sign in via browser or your GitHub Personal Access Token.
    echo You can also open GitHub Desktop and click 'Push origin'.
)

echo.
pause
