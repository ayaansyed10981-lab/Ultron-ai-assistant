$ErrorActionPreference = "Stop"
$taskName = "JarvisAIAssistant"

$existing = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
if ($null -ne $existing) {
    Stop-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
    Unregister-ScheduledTask -TaskName $taskName -Confirm:$false
    Write-Host "Removed scheduled task '$taskName'. Jarvis will no longer auto-start at login." -ForegroundColor Green
} else {
    Write-Host "Scheduled task '$taskName' was not installed." -ForegroundColor Yellow
}
