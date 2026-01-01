<# 
.SYNOPSIS
    MES Migration Daemon - Background migration with auto-restart

.DESCRIPTION
    Runs the MES content migration in the background with:
    - Auto-restart on crash/hang
    - Real-time log output
    - Status monitoring

.PARAMETER Start
    Start the migration daemon in background

.PARAMETER Stop
    Stop the running daemon

.PARAMETER Status
    Show current migration status

.PARAMETER Watch
    Watch live migration progress

.PARAMETER Reset
    Reset checkpoint and start fresh

.PARAMETER MigrateImages
    Also migrate images from Azure Blob Storage

.EXAMPLE
    .\scripts\mes-migration-daemon.ps1 -Start
    .\scripts\mes-migration-daemon.ps1 -Status
    .\scripts\mes-migration-daemon.ps1 -Watch
    .\scripts\mes-migration-daemon.ps1 -Stop
#>

param(
    [switch]$Start,
    [switch]$Stop,
    [switch]$Status,
    [switch]$Watch,
    [switch]$Reset,
    [switch]$MigrateImages
)

$ErrorActionPreference = "Stop"

$ArtifactsDir = Join-Path $PSScriptRoot "..\artifacts"
$StatusFile = Join-Path $ArtifactsDir "mes-migration-status.json"
$LockFile = Join-Path $ArtifactsDir "mes-migration.lock"
$CheckpointFile = Join-Path $ArtifactsDir "mes-migration-checkpoint.json"
$LogFile = Join-Path $ArtifactsDir "mes-migration.log"
$PidFile = Join-Path $ArtifactsDir "mes-migration-daemon.pid"

$HangTimeoutSeconds = 120

function Ensure-Artifacts {
    if (-not (Test-Path $ArtifactsDir)) {
        New-Item -ItemType Directory -Path $ArtifactsDir -Force | Out-Null
    }
}

function Get-MigrationStatus {
    if (Test-Path $StatusFile) {
        try {
            return Get-Content $StatusFile -Raw | ConvertFrom-Json
        } catch {
            return $null
        }
    }
    return $null
}

function Is-WorkerHung {
    param($Status)
    if ($Status.state -ne "running") { return $false }
    $lastHB = [DateTime]::Parse($Status.last_heartbeat)
    $elapsed = (Get-Date) - $lastHB
    return $elapsed.TotalSeconds -gt $HangTimeoutSeconds
}

function Get-DaemonPid {
    if (Test-Path $PidFile) {
        $content = Get-Content $PidFile -Raw
        if ($content -match '^\d+$') {
            return [int]$content
        }
    }
    return $null
}

function Write-Header {
    Write-Host ""
    Write-Host "=======================================================" -ForegroundColor Cyan
    Write-Host "         MES CONTENT MIGRATION DAEMON                  " -ForegroundColor Cyan
    Write-Host "=======================================================" -ForegroundColor Cyan
    Write-Host ""
}

function Show-Status {
    $status = Get-MigrationStatus
    if (-not $status) {
        Write-Host "  No migration status found." -ForegroundColor Yellow
        Write-Host "  Start with: .\scripts\mes-migration-daemon.ps1 -Start"
        return
    }

    $stateColor = switch ($status.state) {
        "idle" { "Gray" }
        "running" { "Green" }
        "paused" { "Yellow" }
        "completed" { "Cyan" }
        "error" { "Red" }
        default { "White" }
    }

    $displayState = $status.state
    if (Is-WorkerHung $status) {
        $displayState = "HUNG"
        $stateColor = "Red"
    }

    Write-Host "  State: " -NoNewline
    Write-Host $displayState.ToUpper() -ForegroundColor $stateColor
    Write-Host "  PID: $($status.pid)"
    Write-Host "  Last Heartbeat: $($status.last_heartbeat)"
    Write-Host ""

    # Progress
    $progress = 0
    if ($status.total_courses -gt 0) {
        $progress = [Math]::Round(($status.processed / $status.total_courses) * 100)
    }
    $filled = [Math]::Floor($progress / 2.5)
    $empty = 40 - $filled
    $barFilled = [string]::new([char]0x2588, [Math]::Max(0, $filled))
    $barEmpty = [string]::new([char]0x2591, [Math]::Max(0, $empty))
    $bar = $barFilled + $barEmpty
    Write-Host "  Progress: [$bar] $progress%"
    Write-Host "            $($status.processed) / $($status.total_courses) courses"
    Write-Host ""

    # Stats
    Write-Host "  Successful: $($status.successful)" -ForegroundColor Green
    $failColor = if ($status.failed -gt 0) { "Red" } else { "White" }
    Write-Host "  Failed: $($status.failed)" -ForegroundColor $failColor
    Write-Host "  Items: $($status.items_imported)"
    Write-Host "  Study Texts: $($status.study_texts_imported)"
    Write-Host ""

    # ETA
    if ($status.eta_seconds -and $status.state -eq "running") {
        $eta = [TimeSpan]::FromSeconds($status.eta_seconds)
        Write-Host "  ETA: $($eta.ToString('hh\:mm\:ss'))"
    }

    # Instructions
    if ($displayState -eq "HUNG") {
        Write-Host ""
        Write-Host "  Worker hung! Will auto-restart..." -ForegroundColor Yellow
    }
}

if ($Status) {
    Write-Header
    Show-Status
    exit 0
}

if ($Watch) {
    Write-Host "  Watching migration status (Ctrl+C to stop)..." -ForegroundColor Cyan
    while ($true) {
        Clear-Host
        Write-Header
        Show-Status
        Write-Host ""
        Write-Host "  Updated: $(Get-Date -Format 'HH:mm:ss')" -ForegroundColor Gray
        Start-Sleep -Seconds 2
    }
}

if ($Reset) {
    Write-Host "  Resetting migration state..." -ForegroundColor Yellow
    
    # Stop any running daemon
    $daemonPid = Get-DaemonPid
    if ($daemonPid) {
        try {
            Stop-Process -Id $daemonPid -Force -ErrorAction SilentlyContinue
        } catch {}
    }
    
    # Delete files
    if (Test-Path $StatusFile) { Remove-Item $StatusFile -Force }
    if (Test-Path $CheckpointFile) { Remove-Item $CheckpointFile -Force }
    if (Test-Path $LockFile) { Remove-Item $LockFile -Force }
    if (Test-Path $PidFile) { Remove-Item $PidFile -Force }
    if (Test-Path $LogFile) { Remove-Item $LogFile -Force }
    
    Write-Host "  Reset complete." -ForegroundColor Green
    exit 0
}

if ($Stop) {
    Write-Host "  Stopping migration daemon..." -ForegroundColor Yellow
    
    $daemonPid = Get-DaemonPid
    if ($daemonPid) {
        try {
            Stop-Process -Id $daemonPid -Force -ErrorAction SilentlyContinue
            Write-Host "  Daemon stopped." -ForegroundColor Green
        } catch {
            Write-Host "  Could not stop daemon." -ForegroundColor Yellow
        }
    } else {
        Write-Host "  No daemon running." -ForegroundColor Gray
    }
    
    if (Test-Path $LockFile) { Remove-Item $LockFile -Force }
    if (Test-Path $PidFile) { Remove-Item $PidFile -Force }
    exit 0
}

if ($Start) {
    Ensure-Artifacts
    Write-Header
    
    # Check if already running
    $existingPid = Get-DaemonPid
    if ($existingPid) {
        try {
            $proc = Get-Process -Id $existingPid -ErrorAction SilentlyContinue
            if ($proc) {
                Write-Host "  Daemon already running (PID: $existingPid)" -ForegroundColor Yellow
                Write-Host "  Use -Stop first, or -Watch to monitor"
                exit 0
            }
        } catch {}
    }
    
    Write-Host "  Starting migration daemon..." -ForegroundColor Green
    
    # Build worker arguments
    $workerScript = Join-Path $PSScriptRoot "mes-migration-worker.ts"
    $workerArgs = "tsx `"$workerScript`""
    if ($MigrateImages) {
        $workerArgs += " --migrate-images"
    }
    
    # Create daemon wrapper script
    $wrapperScript = Join-Path $ArtifactsDir "mes-daemon-wrapper.ps1"
    
    $wrapperContent = @"
`$ErrorActionPreference = 'Continue'
`$workerScript = '$workerScript'
`$logFile = '$LogFile'
`$lockFile = '$LockFile'
`$statusFile = '$StatusFile'
`$migrateImages = `$$($MigrateImages.ToString().ToLower())

`$maxRestarts = 100
`$restartCount = 0
`$restartDelay = 5

Add-Content -Path `$logFile -Value "[`$(Get-Date)] Daemon started"

while (`$restartCount -lt `$maxRestarts) {
    Add-Content -Path `$logFile -Value "[`$(Get-Date)] Starting worker (attempt `$(`$restartCount + 1))..."
    
    try {
        `$args = @('tsx', `$workerScript)
        if (`$migrateImages) { `$args += '--migrate-images' }
        
        `$proc = Start-Process -FilePath 'npx' -ArgumentList `$args -NoNewWindow -PassThru -Wait
        
        if (`$proc.ExitCode -eq 0) {
            Add-Content -Path `$logFile -Value "[`$(Get-Date)] Worker completed successfully."
            break
        }
        
        Add-Content -Path `$logFile -Value "[`$(Get-Date)] Worker exited with code `$(`$proc.ExitCode)."
        
    } catch {
        Add-Content -Path `$logFile -Value "[`$(Get-Date)] Worker crashed: `$(`$_.Exception.Message)"
    }
    
    # Clean up lock for restart
    if (Test-Path `$lockFile) { Remove-Item `$lockFile -Force }
    
    `$restartCount++
    Add-Content -Path `$logFile -Value "[`$(Get-Date)] Restarting in `$restartDelay seconds..."
    Start-Sleep -Seconds `$restartDelay
}

Add-Content -Path `$logFile -Value "[`$(Get-Date)] Daemon stopping after `$restartCount attempts."
"@

    Set-Content -Path $wrapperScript -Value $wrapperContent -Force
    
    # Start daemon in background
    $daemonProc = Start-Process powershell -ArgumentList "-ExecutionPolicy", "Bypass", "-File", $wrapperScript -WindowStyle Hidden -PassThru
    
    # Save daemon PID
    Set-Content -Path $PidFile -Value $daemonProc.Id -Force
    
    Write-Host "  Daemon started (PID: $($daemonProc.Id))" -ForegroundColor Green
    Write-Host ""
    Write-Host "  Monitor progress:"
    Write-Host "    .\scripts\mes-migration-daemon.ps1 -Watch"
    Write-Host "    .\scripts\mes-migration-daemon.ps1 -Status"
    Write-Host ""
    Write-Host "  Stop daemon:"
    Write-Host "    .\scripts\mes-migration-daemon.ps1 -Stop"
    Write-Host ""
    Write-Host "  View logs:"
    Write-Host "    Get-Content artifacts\mes-migration.log -Wait"
    Write-Host ""
    exit 0
}

# Default: show help
Write-Header
Write-Host "Usage:"
Write-Host "  .\scripts\mes-migration-daemon.ps1 -Start              Start daemon"
Write-Host "  .\scripts\mes-migration-daemon.ps1 -Start -MigrateImages   With images"
Write-Host "  .\scripts\mes-migration-daemon.ps1 -Status             Show status"
Write-Host "  .\scripts\mes-migration-daemon.ps1 -Watch              Live progress"
Write-Host "  .\scripts\mes-migration-daemon.ps1 -Stop               Stop daemon"
Write-Host "  .\scripts\mes-migration-daemon.ps1 -Reset              Reset state"
Write-Host ""
