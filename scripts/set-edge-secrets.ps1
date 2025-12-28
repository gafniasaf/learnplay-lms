# Set Edge Function secrets from learnplay.env
# Usage: .\scripts\set-edge-secrets.ps1

$ErrorActionPreference = "Stop"

if (-not $env:SUPABASE_ACCESS_TOKEN) {
  Write-Error "SUPABASE_ACCESS_TOKEN is not set. Set your Supabase PAT in the environment and retry."
  exit 1
}

$envFile = "learnplay.env"
if (-not (Test-Path $envFile)) {
  Write-Error "learnplay.env not found"
  exit 1
}

# Read OpenAI key and LEGACY_DATABASE_URL from learnplay.env
$content = Get-Content $envFile -Raw
$openaiKey = $null
$legacyDbUrl = $null
$lines = $content -split "`n"
for ($i = 0; $i -lt $lines.Length; $i++) {
  if ($lines[$i] -match "openai key" -and $i + 1 -lt $lines.Length) {
    $openaiKey = $lines[$i + 1].Trim()
  }
  if ($lines[$i] -match "^LEGACY_DATABASE_URL=") {
    $legacyDbUrl = ($lines[$i] -replace '^LEGACY_DATABASE_URL=','').Trim()
  }
}

if (-not $openaiKey) {
  Write-Error "OpenAI key not found in learnplay.env"
  exit 1
}

# Read project ref from SUPABASE_URL
$supabaseUrl = $null
for ($i = 0; $i -lt $lines.Length; $i++) {
  if ($lines[$i] -match "Project url" -and $i + 1 -lt $lines.Length) {
    $supabaseUrl = $lines[$i + 1].Trim()
    break
  }
}

if (-not $supabaseUrl) {
  Write-Error "Project URL not found in learnplay.env"
  exit 1
}

$projectRef = ($supabaseUrl -replace 'https://','') -replace '\.supabase\.co.*$',''
Write-Host "Project ref: $projectRef"

# Set OPENAI_API_KEY secret
Write-Host "Setting OPENAI_API_KEY secret..."
Write-Host "Project ref: $projectRef"
Write-Host "Key length: $($openaiKey.Length) characters"

# Use Supabase CLI to set secret (syntax: NAME=VALUE)
# Escape the value properly for PowerShell and use --yes to avoid prompts
$escapedKey = $openaiKey -replace '"', '`"'
$command = "supabase secrets set `"OPENAI_API_KEY=$escapedKey`" --project-ref $projectRef --yes"
Write-Host "Running: supabase secrets set OPENAI_API_KEY=*** --project-ref $projectRef --yes"

$result = & cmd /c "$command 2>&1"
$exitCode = $LASTEXITCODE

# Filter out the version warning
$filteredResult = $result | Where-Object { $_ -notmatch "A new version" }

if ($exitCode -eq 0 -or ($filteredResult -match "success" -or $filteredResult -match "Secret set")) {
  Write-Host "✅ OPENAI_API_KEY secret set successfully"
  if ($filteredResult) {
    Write-Host $filteredResult
  }
} else {
  Write-Host "Output: $filteredResult"
  Write-Error "Failed to set OPENAI_API_KEY secret. Exit code: $exitCode"
  exit 1
}

# Set LEGACY_DATABASE_URL secret if found
if ($legacyDbUrl) {
  Write-Host ""
  Write-Host "Setting LEGACY_DATABASE_URL secret..."
  $escapedDbUrl = $legacyDbUrl -replace '"', '`"'
  $command = "supabase secrets set `"LEGACY_DATABASE_URL=$escapedDbUrl`" --project-ref $projectRef --yes"
  Write-Host "Running: supabase secrets set LEGACY_DATABASE_URL=*** --project-ref $projectRef --yes"
  
  $result = & cmd /c "$command 2>&1"
  $exitCode = $LASTEXITCODE
  $filteredResult = $result | Where-Object { $_ -notmatch "A new version" }
  
  if ($exitCode -eq 0 -or ($filteredResult -match "success" -or $filteredResult -match "Secret set")) {
    Write-Host "✅ LEGACY_DATABASE_URL secret set successfully"
    if ($filteredResult) {
      Write-Host $filteredResult
    }
  } else {
    Write-Host "Output: $filteredResult"
    Write-Warning "Failed to set LEGACY_DATABASE_URL secret. Exit code: $exitCode"
    Write-Warning "You may need to set it manually: supabase secrets set LEGACY_DATABASE_URL='...' --project-ref $projectRef"
  }
} else {
  Write-Host ""
  Write-Warning "LEGACY_DATABASE_URL not found in learnplay.env - skipping"
}

Write-Host ""
Write-Host "✅ All secrets configured"

