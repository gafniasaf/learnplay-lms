$ErrorActionPreference = "Stop"

param(
  [string]$Destination = "$env:USERPROFILE\IgniteZero",
  [string]$ReleaseUrl = "https://zhrhuxjagenhhhttphmu.supabase.co/storage/v1/object/public/releases/ignite-zero-release.zip"
)

function Write-Section($text) {
  Write-Host ""
  Write-Host "==== $text ====" -ForegroundColor Cyan
}

function Ensure-Winget {
  if (-not (Get-Command winget -ErrorAction SilentlyContinue)) {
    Write-Error "winget (App Installer) is required. Install it from the Microsoft Store then rerun this script."
  }
}

function Install-App {
  param(
    [Parameter(Mandatory = $true)][string]$Id,
    [Parameter(Mandatory = $true)][string]$Name
  )

  $existing = & winget list --id $Id --exact 2>$null
  if ($LASTEXITCODE -eq 0 -and $existing) {
    Write-Host "$Name already installed."
    return
  }

  Write-Host "Installing $Name..."
  & winget install --id $Id --exact --accept-package-agreements --accept-source-agreements
  if ($LASTEXITCODE -ne 0) {
    throw "Failed to install $Name (winget exited with code $LASTEXITCODE)."
  }
}

function Install-NpmGlobal {
  param(
    [Parameter(Mandatory = $true)][string]$Package
  )

  Write-Host "Installing global npm package $Package ..."
  & npm install -g $Package
  if ($LASTEXITCODE -ne 0) {
    throw "Failed to install npm package $Package."
  }
}

Ensure-Winget

Write-Section "Installing prerequisites"
Install-App -Id "Git.Git" -Name "Git"
Install-App -Id "OpenJS.NodeJS.LTS" -Name "Node.js LTS"
Install-App -Id "Docker.DockerDesktop" -Name "Docker Desktop"
Install-App -Id "GitHub.GitHubDesktop" -Name "GitHub Desktop"

Write-Section "Installing Supabase CLI"
Install-NpmGlobal -Package "supabase@latest"

Write-Section "Downloading Ignite Zero"
if (-not (Test-Path $Destination)) {
  New-Item -ItemType Directory -Path $Destination | Out-Null
}

$downloadUrl = $ReleaseUrl
if (-not $downloadUrl) {
  throw "ReleaseUrl parameter missing. Copy the secure link from the Setup page and rerun with -ReleaseUrl '<signed-url>'."
}

$tempZip = Join-Path $env:TEMP "ignite-zero-release.zip"
Write-Host "Downloading release from $downloadUrl ..."
Invoke-WebRequest -Uri $downloadUrl -OutFile $tempZip -UseBasicParsing

Write-Host "Extracting to $Destination ..."
Expand-Archive -Path $tempZip -DestinationPath $Destination -Force
Remove-Item $tempZip

Write-Section "All done"
Write-Host "Ignite Zero files are in: $Destination" -ForegroundColor Green
Write-Host ""
Write-Host "Next steps:"
Write-Host "1. Open Terminal in $Destination"
Write-Host "2. Run 'npm install'"
Write-Host "3. Run 'npm run factory' to launch the Factory menu"
Write-Host ""
Write-Host "Reminder: Docker Desktop may ask you to log out/sign in the first time it runs."


