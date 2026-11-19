$ErrorActionPreference = "Stop"
$projectDir = Split-Path -Parent $PSScriptRoot

Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "  JARVIS AI ASSISTANT - WINDOWS ARM64 DIAGNOSTICS" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan

# 1. Architecture & Node.js
$osArch = [System.Runtime.InteropServices.RuntimeInformation]::OSArchitecture
$psArch = [System.Runtime.InteropServices.RuntimeInformation]::ProcessArchitecture
$nodeArch = (& node -p "process.arch")
$nodeVer = (& node --version)
Write-Host "[OK] OS Architecture: $osArch | PowerShell: $psArch | Node.js: $nodeVer ($nodeArch)" -ForegroundColor Green

# 2. Audio Input Device (winmm.dll)
Add-Type -TypeDefinition @"
using System.Runtime.InteropServices;
public class DiagWinMm {
    [DllImport("winmm.dll")]
    public static extern uint waveInGetNumDevs();
}
"@
$micCount = [DiagWinMm]::waveInGetNumDevs()
if ($micCount -gt 0) {
    Write-Host "[OK] Microphone input devices detected: $micCount" -ForegroundColor Green
} else {
    Write-Host "[WARN] No microphone input devices detected!" -ForegroundColor Yellow
}

# 3. WinRT Speech Synthesis & Recognition (Native ARM64)
Add-Type -AssemblyName System.Runtime.WindowsRuntime
$asTaskGeneric = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
    $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1'
})[0]
function Await-WinRT($WinRtTask, $ResultType) {
    $netTask = $asTaskGeneric.MakeGenericMethod($ResultType).Invoke($null, @($WinRtTask))
    $netTask.Wait(-1) | Out-Null
    return $netTask.Result
}

[void][Windows.Media.SpeechSynthesis.SpeechSynthesizer, Windows.Media.SpeechSynthesis, ContentType=WindowsRuntime]
[void][Windows.Media.SpeechSynthesis.SpeechSynthesisStream, Windows.Media.SpeechSynthesis, ContentType=WindowsRuntime]
$voices = [Windows.Media.SpeechSynthesis.SpeechSynthesizer]::AllVoices | ForEach-Object { "$($_.DisplayName) ($($_.Language))" }
$synth = New-Object Windows.Media.SpeechSynthesis.SpeechSynthesizer
$stream = Await-WinRT ($synth.SynthesizeTextToStreamAsync("Jarvis diagnostic check passed.")) ([Windows.Media.SpeechSynthesis.SpeechSynthesisStream])
Write-Host "[OK] WinRT Native TTS: $($stream.Size) bytes WAV | Voices: $($voices -join ', ')" -ForegroundColor Green
$stream.Dispose()
$synth.Dispose()

[void][Windows.Media.SpeechRecognition.SpeechRecognizer, Windows.Media.SpeechRecognition, ContentType=WindowsRuntime]
[void][Windows.Media.SpeechRecognition.ISpeechRecognitionConstraint, Windows.Media.SpeechRecognition, ContentType=WindowsRuntime]
[void][Windows.Media.SpeechRecognition.SpeechRecognitionListConstraint, Windows.Media.SpeechRecognition, ContentType=WindowsRuntime]
[void][Windows.Media.SpeechRecognition.SpeechRecognitionCompilationResult, Windows.Media.SpeechRecognition, ContentType=WindowsRuntime]
$rec = New-Object Windows.Media.SpeechRecognition.SpeechRecognizer
$phrases = [System.Collections.Generic.List[string]]::new()
$phrases.Add("Jarvis")
$phrases.Add("Hey Jarvis")
$constraint = New-Object Windows.Media.SpeechRecognition.SpeechRecognitionListConstraint($phrases, "wake")
$icoll = [System.Collections.Generic.ICollection[Windows.Media.SpeechRecognition.ISpeechRecognitionConstraint]]
$icoll.GetMethod("Add").Invoke($rec.Constraints.PSObject.BaseObject, [object[]]@($constraint.PSObject.BaseObject))
$comp = Await-WinRT ($rec.CompileConstraintsAsync()) ([Windows.Media.SpeechRecognition.SpeechRecognitionCompilationResult])
Write-Host "[OK] WinRT Offline Wake-Word Engine ('Jarvis'): $($comp.Status)" -ForegroundColor Green
$rec.Dispose()

# 4. Dependencies & .env check
$genaiDir = Join-Path $projectDir "node_modules\@google\genai"
if (Test-Path $genaiDir) {
    Write-Host "[OK] @google/genai SDK installed." -ForegroundColor Green
} else {
    Write-Host "[WARN] node_modules missing. Run: npm.cmd install" -ForegroundColor Yellow
}

$envFile = Join-Path $projectDir ".env"
if (Test-Path $envFile) {
    $envText = Get-Content $envFile -Raw
    if ($envText -match "GEMINI_API_KEY=\S+") {
        Write-Host "[OK] GEMINI_API_KEY is configured in .env." -ForegroundColor Green
    } else {
        Write-Host "[ACTION NEEDED] GEMINI_API_KEY is empty in .env. Paste your key or run start-jarvis.bat for guided setup." -ForegroundColor Yellow
    }
}

Write-Host "`nDiagnostics complete!" -ForegroundColor Cyan
