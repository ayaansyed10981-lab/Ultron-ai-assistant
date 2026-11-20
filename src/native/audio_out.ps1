param(
    [string]$DefaultVoice = "Mark"
)

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
[Console]::InputEncoding = [System.Text.Encoding]::UTF8

Add-Type -AssemblyName System.Runtime.WindowsRuntime

$asTaskGeneric = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
    $_.Name -eq 'AsTask' -and
    $_.GetParameters().Count -eq 1 -and
    $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1'
})[0]

function Await-WinRT($WinRtTask, $ResultType) {
    $netTask = $asTaskGeneric.MakeGenericMethod($ResultType).Invoke($null, @($WinRtTask))
    $netTask.Wait(-1) | Out-Null
    return $netTask.Result
}

[void][Windows.Media.SpeechSynthesis.SpeechSynthesizer, Windows.Media.SpeechSynthesis, ContentType=WindowsRuntime]
[void][Windows.Media.SpeechSynthesis.SpeechSynthesisStream, Windows.Media.SpeechSynthesis, ContentType=WindowsRuntime]
[void][Windows.Storage.Streams.DataReader, Windows.Storage.Streams, ContentType=WindowsRuntime]

$synth = New-Object Windows.Media.SpeechSynthesis.SpeechSynthesizer

function Select-Voice($preferred) {
    if ([string]::IsNullOrWhiteSpace($preferred)) { return }
    try {
        $match = [Windows.Media.SpeechSynthesis.SpeechSynthesizer]::AllVoices |
            Where-Object { $_.DisplayName -like "*$preferred*" } |
            Select-Object -First 1
        if ($null -ne $match) {
            $synth.Voice = $match
        }
    } catch {}
}

Select-Voice $DefaultVoice

function Play-WavStream([System.IO.Stream]$stream) {
    $player = New-Object System.Media.SoundPlayer($stream)
    try {
        $player.Load()
        $player.PlaySync()
    } finally {
        $player.Dispose()
    }
}

function Synthesize-ToBytes([string]$text, [string]$voice) {
    if (-not [string]::IsNullOrWhiteSpace($voice)) {
        Select-Voice $voice
    }
    $stream = Await-WinRT ($synth.SynthesizeTextToStreamAsync($text)) ([Windows.Media.SpeechSynthesis.SpeechSynthesisStream])
    try {
        $size = [uint32]$stream.Size
        $reader = New-Object Windows.Storage.Streams.DataReader($stream.GetInputStreamAt(0))
        try {
            $loadOp = $reader.LoadAsync($size)
            $loadTask = $asTaskGeneric.MakeGenericMethod([uint32]).Invoke($null, @($loadOp))
            $loadTask.Wait(-1) | Out-Null
            $bytes = New-Object byte[] $size
            $reader.ReadBytes($bytes)
            return ,$bytes
        } finally {
            $reader.Dispose()
        }
    } finally {
        $stream.Dispose()
    }
}

function Speak-WinRT([string]$text, [string]$voice) {
    $bytes = Synthesize-ToBytes $text $voice
    $ms = New-Object System.IO.MemoryStream(,$bytes)
    try {
        Play-WavStream $ms
    } finally {
        $ms.Dispose()
    }
}

# Pre-synthesize instant wake replies in distinct agent voices at startup!
# Ultron: Mark (Male Commander), Vision: David (Male Engineer), Friday: Zira (Female Architect), Jarvis: David/QA
$cachedUltronBytes = $null
$cachedVisionBytes = $null
$cachedFridayBytes = $null
$cachedJarvisBytes = $null
try { $cachedUltronBytes = Synthesize-ToBytes "Yes, sir?" "Mark" } catch {}
try { $cachedVisionBytes = Synthesize-ToBytes "Yes, sir? Vision here. What are we building or querying?" "David" } catch {}
try { $cachedFridayBytes = Synthesize-ToBytes "Yes, sir? Friday here. Which document or report shall I create?" "Zira" } catch {}
try { $cachedJarvisBytes = Synthesize-ToBytes "Jarvis at your service, sir. What code, query, or document shall I inspect?" "David" } catch {}

function Build-ToneWav([double[]]$freqs, [int]$noteMs = 55, [double]$volume = 0.16) {
    $sampleRate = 24000
    $samplesPerNote = [int]($sampleRate * $noteMs / 1000)
    $totalSamples = $samplesPerNote * $freqs.Length
    $pcmBytes = New-Object byte[] ($totalSamples * 2)

    $offset = 0
    for ($n = 0; $n -lt $freqs.Length; $n++) {
        $freq = $freqs[$n]
        for ($i = 0; $i -lt $samplesPerNote; $i++) {
            $t = $i / [double]$sampleRate
            $env = 1.0
            $fade = [int]($samplesPerNote * 0.18)
            if ($i -lt $fade) { $env = $i / [double]$fade }
            elseif ($i -gt ($samplesPerNote - $fade)) { $env = ($samplesPerNote - $i) / [double]$fade }

            $val = [Math]::Sin(2.0 * [Math]::PI * $freq * $t) * $volume * $env
            $sample = [int16]([Math]::Max(-32767, [Math]::Min(32767, [int]($val * 32767))))
            $pcmBytes[$offset] = [byte]($sample -band 0xFF)
            $pcmBytes[$offset + 1] = [byte](($sample -shr 8) -band 0xFF)
            $offset += 2
        }
    }

    $ms = New-Object System.IO.MemoryStream
    $bw = New-Object System.IO.BinaryWriter($ms)
    $bw.Write([char[]]('R','I','F','F'))
    $bw.Write([int](36 + $pcmBytes.Length))
    $bw.Write([char[]]('W','A','V','E'))
    $bw.Write([char[]]('f','m','t',' '))
    $bw.Write([int]16)
    $bw.Write([int16]1)
    $bw.Write([int16]1)
    $bw.Write([int]$sampleRate)
    $bw.Write([int]($sampleRate * 2))
    $bw.Write([int16]2)
    $bw.Write([int16]16)
    $bw.Write([char[]]('d','a','t','a'))
    $bw.Write([int]$pcmBytes.Length)
    $bw.Write($pcmBytes)
    $bw.Flush()
    $ms.Position = 0
    return $ms
}

function Emit-Json($obj) {
    [Console]::Out.WriteLine(($obj | ConvertTo-Json -Compress))
    [Console]::Out.Flush()
}

Emit-Json @{ type = "ready" }

while ($null -ne ($line = [Console]::In.ReadLine())) {
    $trimmed = $line.Trim()
    if ([string]::IsNullOrWhiteSpace($trimmed)) { continue }

    $id = $null
    try {
        $req = $trimmed | ConvertFrom-Json
        $id = $req.id
        $action = $req.action

        if ($action -eq "exit") {
            Emit-Json @{ id = $id; ok = $true }
            break
        } elseif ($action -eq "wake_reply") {
            $agent = [string]$req.agent
            $streamBytes = $null
            if ($agent -like "*vision*" -and $null -ne $cachedVisionBytes) {
                $streamBytes = $cachedVisionBytes
            } elseif ($agent -like "*friday*" -and $null -ne $cachedFridayBytes) {
                $streamBytes = $cachedFridayBytes
            } elseif ($agent -like "*jarvis*" -and $null -ne $cachedJarvisBytes) {
                $streamBytes = $cachedJarvisBytes
            } elseif ($null -ne $cachedUltronBytes) {
                $streamBytes = $cachedUltronBytes
            }

            if ($null -ne $streamBytes) {
                $ms = New-Object System.IO.MemoryStream(,$streamBytes)
                try { Play-WavStream $ms } finally { $ms.Dispose() }
            } else {
                Speak-WinRT "Yes, sir?" $DefaultVoice
            }
            Emit-Json @{ id = $id; ok = $true }
        } elseif ($action -eq "play") {
            if (-not (Test-Path $req.path)) {
                throw "Audio file not found: $($req.path)"
            }
            $fs = [System.IO.File]::OpenRead($req.path)
            try {
                Play-WavStream $fs
            } finally {
                $fs.Dispose()
            }
            Emit-Json @{ id = $id; ok = $true }
        } elseif ($action -eq "speak") {
            Speak-WinRT $req.text $req.voice
            Emit-Json @{ id = $id; ok = $true }
        } elseif ($action -eq "roll_call") {
            Speak-WinRT "Avengers assemble! Commander Ultron reporting: mission control, PC operations, and system automation online." "Mark"
            Start-Sleep -Milliseconds 200
            Speak-WinRT "Vision reporting, sir: software engineering, web applications, and SQL database architecture ready." "David"
            Start-Sleep -Milliseconds 200
            Speak-WinRT "Friday reporting, sir: executive document architecture, Word documents, and PDF reports standing by." "Zira"
            Start-Sleep -Milliseconds 200
            Speak-WinRT "Jarvis reporting, sir: quality assurance, deliverable verification, and system inspection at your service." "David"
            Start-Sleep -Milliseconds 200
            Speak-WinRT "All four operatives assembled and standing by for your command, sir. What is our objective?" "Mark"
            Emit-Json @{ id = $id; ok = $true }
        } elseif ($action -eq "chime") {
            $kind = $req.kind
            $ms = switch ($kind) {
                "wake"  { Build-ToneWav @(659.25, 880.0) 55 0.16 }
                "done"  { Build-ToneWav @(659.25, 523.25) 50 0.12 }
                "error" { Build-ToneWav @(330.0, 261.63) 90 0.15 }
                "timer" { Build-ToneWav @(880.0, 1046.5, 880.0, 1046.5) 110 0.24 }
                default { Build-ToneWav @(659.25, 880.0) 55 0.16 }
            }
            try {
                Play-WavStream $ms
            } finally {
                $ms.Dispose()
            }
            Emit-Json @{ id = $id; ok = $true }
        } else {
            throw "Unknown action: $action"
        }
    } catch {
        Emit-Json @{ id = $id; ok = $false; error = $_.Exception.Message }
    }
}

$synth.Dispose()
