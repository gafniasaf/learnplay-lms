# PowerShell script to cap WSL2 memory usage for 16GB RAM machines
# Usage: Run in PowerShell as: .\scripts\setup-wsl-memory-cap.ps1

$ConfigPath = "$env:UserProfile\.wslconfig"
$ConfigContent = @"
[wsl2]
memory=6GB
processors=4
swap=8GB
"@

Write-Host "Configuring WSL2 for 16GB RAM Environment..." -ForegroundColor Cyan

if (Test-Path $ConfigPath) {
    $Existing = Get-Content $ConfigPath -Raw
    if ($Existing -match "memory=6GB") {
        Write-Host "Configuration already applied at $ConfigPath" -ForegroundColor Green
    } else {
        Write-Host "Existing configuration found. Backing up to .wslconfig.bak" -ForegroundColor Yellow
        Copy-Item $ConfigPath "$ConfigPath.bak" -Force
        Set-Content -Path $ConfigPath -Value $ConfigContent
        Write-Host "Updated configuration at $ConfigPath" -ForegroundColor Green
    }
} else {
    Set-Content -Path $ConfigPath -Value $ConfigContent
    Write-Host "Created new configuration at $ConfigPath" -ForegroundColor Green
}

Write-Host "Restarting WSL to apply changes..." -ForegroundColor Cyan
wsl --shutdown

Write-Host "Done! Please restart Docker Desktop now." -ForegroundColor Green
