$ErrorActionPreference = "Stop"

$projectDir = Split-Path -Parent $PSScriptRoot
$nodePath = (Get-Command node.exe -ErrorAction Stop).Source
$entryScript = Join-Path $projectDir "src\index.js"
$vbsLauncher = Join-Path $projectDir "start-jarvis-background.vbs"
$taskName = "JarvisAIAssistant"

Write-Host "Installing 24/7 Windows Auto-Start Task: $taskName" -ForegroundColor Cyan
Write-Host "  Project: $projectDir"
Write-Host "  Node.js: $nodePath"

# Remove existing task if present
$existing = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
if ($null -ne $existing) {
    Unregister-ScheduledTask -TaskName $taskName -Confirm:$false
}

# Use wscript.exe + start-jarvis-background.vbs so no console window flashes on login
$action = New-ScheduledTaskAction -Execute "wscript.exe" -Argument "`"$vbsLauncher`"" -WorkingDirectory $projectDir
$trigger = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME

# Crucial Snapdragon / ARM64 laptop settings: run on battery, never time out, auto-restart on failure
$settings = New-ScheduledTaskSettingsSet `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries `
    -StartWhenAvailable `
    -ExecutionTimeLimit ([TimeSpan]::Zero) `
    -RestartCount 999 `
    -RestartInterval (New-TimeSpan -Minutes 1) `
    -MultipleInstances IgnoreNew

Register-ScheduledTask `
    -TaskName $taskName `
    -Action $action `
    -Trigger $trigger `
    -Settings $settings `
    -Description "Jarvis Personal AI Assistant (24/7 native Windows ARM64 voice assistant powered by Gemini API)" | Out-Null

Write-Host "`nSuccess! Jarvis will now start automatically whenever you log into Windows and stay active 24/7 while your PC is on." -ForegroundColor Green
Write-Host "To start Jarvis silently right now, run: Start-ScheduledTask -TaskName $taskName"
Write-Host "To remove auto-start later, run: npm.cmd run uninstall-autostart"
