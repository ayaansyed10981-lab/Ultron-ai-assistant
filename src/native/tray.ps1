param(
    [string]$LogPath = "",
    [string]$EnvPath = ""
)

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

Add-Type -TypeDefinition @"
using System;
using System.Collections.Concurrent;
using System.Threading;

public static class TrayStdinReader {
    private static readonly ConcurrentQueue<string> _queue = new ConcurrentQueue<string>();
    private static volatile bool _closed = false;

    public static void Start() {
        var t = new Thread(() => {
            try {
                string line;
                while ((line = Console.In.ReadLine()) != null) {
                    _queue.Enqueue(line.Trim());
                }
            } catch {
            } finally {
                _closed = true;
            }
        });
        t.IsBackground = true;
        t.Start();
    }

    public static string TryDequeue() {
        string val;
        return _queue.TryDequeue(out val) ? val : null;
    }

    public static bool IsClosed {
        get { return _closed; }
    }
}
"@

function Emit-Event($action) {
    $json = @{ type = "tray"; action = $action } | ConvertTo-Json -Compress
    [Console]::Out.WriteLine($json)
    [Console]::Out.Flush()
}

function Create-ArcReactorIcon([System.Drawing.Color]$accentColor) {
    $bmp = New-Object System.Drawing.Bitmap(32, 32)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $g.Clear([System.Drawing.Color]::Transparent)

    $bgBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 12, 22, 38))
    $g.FillEllipse($bgBrush, 1, 1, 30, 30)

    $outerPen = New-Object System.Drawing.Pen($accentColor, 2.5)
    $g.DrawEllipse($outerPen, 3, 3, 26, 26)

    $innerPen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(220, 220, 250, 255), 1.8)
    $g.DrawEllipse($innerPen, 9, 9, 14, 14)

    $coreBrush = New-Object System.Drawing.SolidBrush($accentColor)
    $g.FillEllipse($coreBrush, 12, 12, 8, 8)

    $icon = [System.Drawing.Icon]::FromHandle($bmp.GetHicon())
    $g.Dispose()
    $bgBrush.Dispose()
    $outerPen.Dispose()
    $innerPen.Dispose()
    $coreBrush.Dispose()
    $bmp.Dispose()
    return $icon
}

$iconIdle = Create-ArcReactorIcon ([System.Drawing.Color]::FromArgb(255, 0, 212, 255))
$iconActive = Create-ArcReactorIcon ([System.Drawing.Color]::FromArgb(255, 64, 255, 128))
$iconMuted = Create-ArcReactorIcon ([System.Drawing.Color]::FromArgb(255, 160, 160, 170))

$notify = New-Object System.Windows.Forms.NotifyIcon
$notify.Icon = $iconIdle
$notify.Text = 'Jarvis AI - Listening for "Jarvis"'
$notify.Visible = $true

$menu = New-Object System.Windows.Forms.ContextMenuStrip

$statusItem = New-Object System.Windows.Forms.ToolStripMenuItem
$statusItem.Text = 'Status: Listening for "Jarvis"'
$statusItem.Enabled = $false
[void]$menu.Items.Add($statusItem)
[void]$menu.Items.Add((New-Object System.Windows.Forms.ToolStripSeparator))

$listenItem = New-Object System.Windows.Forms.ToolStripMenuItem
$listenItem.Text = "Listen Now (Trigger Jarvis)"
$listenItem.Add_Click({ Emit-Event "listen_now" })
[void]$menu.Items.Add($listenItem)

$muteItem = New-Object System.Windows.Forms.ToolStripMenuItem
$muteItem.Text = "Pause Wake Word"
$muteItem.Add_Click({ Emit-Event "toggle_mute" })
[void]$menu.Items.Add($muteItem)

[void]$menu.Items.Add((New-Object System.Windows.Forms.ToolStripSeparator))

if (-not [string]::IsNullOrWhiteSpace($LogPath)) {
    $logItem = New-Object System.Windows.Forms.ToolStripMenuItem
    $logItem.Text = "Open Activity Log"
    $logItem.Add_Click({
        if (Test-Path $LogPath) { Start-Process notepad.exe $LogPath }
    })
    [void]$menu.Items.Add($logItem)
}

if (-not [string]::IsNullOrWhiteSpace($EnvPath)) {
    $envItem = New-Object System.Windows.Forms.ToolStripMenuItem
    $envItem.Text = "Edit Config (.env)"
    $envItem.Add_Click({
        if (Test-Path $EnvPath) { Start-Process notepad.exe $EnvPath }
    })
    [void]$menu.Items.Add($envItem)
}

[void]$menu.Items.Add((New-Object System.Windows.Forms.ToolStripSeparator))

$exitItem = New-Object System.Windows.Forms.ToolStripMenuItem
$exitItem.Text = "Exit Jarvis"
$exitItem.Add_Click({
    Emit-Event "exit"
    $notify.Visible = $false
    [System.Windows.Forms.Application]::Exit()
})
[void]$menu.Items.Add($exitItem)

$notify.ContextMenuStrip = $menu
$notify.Add_DoubleClick({ Emit-Event "listen_now" })

[TrayStdinReader]::Start()

$timer = New-Object System.Windows.Forms.Timer
$timer.Interval = 200
$timer.Add_Tick({
    if ([TrayStdinReader]::IsClosed) {
        $notify.Visible = $false
        $timer.Stop()
        [System.Windows.Forms.Application]::Exit()
        return
    }
    while ($true) {
        $line = [TrayStdinReader]::TryDequeue()
        if ($null -eq $line) { break }
        try {
            $msg = $line | ConvertFrom-Json
            if ($msg.action -eq "exit") {
                $notify.Visible = $false
                $timer.Stop()
                [System.Windows.Forms.Application]::Exit()
                return
            } elseif ($msg.action -eq "status") {
                $state = [string]$msg.state
                $label = [string]$msg.label
                if ($label.Length -gt 62) { $label = $label.Substring(0, 62) }
                $notify.Text = $label
                $statusItem.Text = "Status: $label"
                if ($state -eq "muted") {
                    $notify.Icon = $iconMuted
                    $muteItem.Text = "Resume Wake Word"
                } elseif ($state -eq "active") {
                    $notify.Icon = $iconActive
                    $muteItem.Text = "Pause Wake Word"
                } else {
                    $notify.Icon = $iconIdle
                    $muteItem.Text = "Pause Wake Word"
                }
            } elseif ($msg.action -eq "notify") {
                $notify.BalloonTipTitle = if ($msg.title) { [string]$msg.title } else { "Jarvis AI" }
                $notify.BalloonTipText = [string]$msg.text
                $notify.ShowBalloonTip(3500)
            }
        } catch {}
    }
})
$timer.Start()

Emit-Event "ready"
[System.Windows.Forms.Application]::Run()
$notify.Dispose()
