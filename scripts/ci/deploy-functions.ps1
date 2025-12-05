Param(
  [string]$EnvPath = ".env.local"
)

$ErrorActionPreference = "Stop"

if (-not $env:SUPABASE_ACCESS_TOKEN) {
  Write-Error "SUPABASE_ACCESS_TOKEN is not set. Set your Supabase PAT in the environment and retry."
  exit 1
}

if (!(Test-Path $EnvPath)) {
  Write-Error "Env file not found: $EnvPath"
  exit 1
}

$envLine = (Get-Content $EnvPath | Where-Object { $_ -match '^SUPABASE_URL=' } | Select-Object -First 1)
if (-not $envLine) {
  Write-Error "SUPABASE_URL=... not found in $EnvPath"
  exit 1
}

$projectRef = ($envLine -replace '^SUPABASE_URL=https://','') -replace '\.supabase\.co.*$',''
Write-Host "Project ref: $projectRef"

$funcRoot = "supabase/functions"
if (!(Test-Path $funcRoot)) {
  Write-Error "Functions directory not found: $funcRoot"
  exit 1
}

$blocklist = @(
  "admin-create-tag",
  "assignment-metadata",
  "parent-goals",
  "parent-subjects",
  "parent-timeline",
  "parent-topics",
  "play-session"
)

$funcDirs = Get-ChildItem -Path $funcRoot -Directory | Where-Object {
  $_.Name -ne "_shared" -and -not ($blocklist -contains $_.Name) -and (Test-Path (Join-Path $_.FullName "index.ts"))
}
if (-not $funcDirs) {
  Write-Error "No function directories with index.ts found in $funcRoot"
  exit 1
}

foreach ($d in $funcDirs) {
  $name = $d.Name
  Write-Host "Deploying $name..."
  supabase functions deploy $name --project-ref $projectRef --no-verify-jwt
}

Write-Host "All functions deployed."


