param(
  [string]$AppName = $env:FLY_APP_NAME,
  [string]$Region = $env:FLY_REGION
)

$ErrorActionPreference = 'Stop'

function Load-KeyValueEnvFile([string]$FilePath) {
  if (-not (Test-Path $FilePath)) { return }
  try {
    $lines = Get-Content -Path $FilePath -ErrorAction Stop
    foreach ($line in $lines) {
      $t = [string]$line
      if (-not $t) { continue }
      $t = $t.Trim()
      if (-not $t) { continue }
      if ($t.StartsWith("#")) { continue }
      $idx = $t.IndexOf("=")
      if ($idx -lt 1) { continue }
      $k = $t.Substring(0, $idx).Trim()
      $v = $t.Substring($idx + 1).Trim()
      if (-not $k) { continue }
      if (-not $v) { continue }
      # Strip surrounding quotes (best-effort)
      if ($v.StartsWith("\"") -and $v.EndsWith("\"")) { $v = $v.Substring(1, $v.Length - 2) }
      if ($v.StartsWith("'") -and $v.EndsWith("'")) { $v = $v.Substring(1, $v.Length - 2) }

      $existing = [string]($env:$k)
      if (-not $existing -or -not $existing.Trim()) {
        $env:$k = $v
      }
    }
  } catch {
    # ignore unreadable local env files
  }
}

function Load-RawFlyTokenFile([string]$FilePath) {
  if (-not (Test-Path $FilePath)) { return }
  $existing = [string]($env:FLY_API_TOKEN)
  if ($existing -and $existing.Trim()) { return }
  try {
    $raw = Get-Content -Raw -Path $FilePath -ErrorAction Stop
    if (-not $raw) { return }
    $raw = $raw.Trim()
    if (-not $raw) { return }

    # If the file is key=value, let the normal parser handle it.
    if ($raw -match "(?m)^\\s*FLY_API_TOKEN\\s*=") { return }

    # Otherwise treat the first non-empty, non-comment line as the token.
    $line = $null
    foreach ($l in ($raw -split \"`n\")) {
      $t = [string]$l
      if (-not $t) { continue }
      $t = $t.Trim()
      if (-not $t) { continue }
      if ($t.StartsWith("#")) { continue }
      $line = $t
      break
    }
    if (-not $line) { return }

    # Some UIs copy multiple tokens separated by commas; keep the first one.
    if ($line.Contains(",")) {
      $line = $line.Split(",", 2)[0].Trim()
    }

    if ($line.Length -lt 20) { return }
    $env:FLY_API_TOKEN = $line
  } catch {
    # ignore
  }
}

function Load-LocalEnvFiles([string]$RepoRoot) {
  $candidates = @(
    (Join-Path $RepoRoot "supabase\\.deploy.env"),
    (Join-Path $RepoRoot "learnplay.env"),
    (Join-Path $RepoRoot ".env"),
    (Join-Path $RepoRoot ".env.local"),
    (Join-Path $RepoRoot ".env.development"),
    (Join-Path $RepoRoot ".env.production"),
    # Optional local-only token file for Fly (gitignored by *.env)
    (Join-Path $RepoRoot "flytoken.env")
  )
  foreach ($f in $candidates) { Load-KeyValueEnvFile $f }

  # Optional override: explicitly point to a fly token env file.
  if ($env:FLY_ENV_PATH -and $env:FLY_ENV_PATH.Trim() -and (Test-Path $env:FLY_ENV_PATH)) {
    Load-KeyValueEnvFile $env:FLY_ENV_PATH
    Load-RawFlyTokenFile $env:FLY_ENV_PATH
  }
  # Support raw-token style flytoken.env as well.
  Load-RawFlyTokenFile (Join-Path $RepoRoot "flytoken.env")

  # Normalize common aliases.
  if ($env:SUPABASE_URL -and (-not $env:VITE_SUPABASE_URL -or -not $env:VITE_SUPABASE_URL.Trim())) {
    $env:VITE_SUPABASE_URL = $env:SUPABASE_URL
  }
  if ($env:VITE_SUPABASE_URL -and (-not $env:SUPABASE_URL -or -not $env:SUPABASE_URL.Trim())) {
    $env:SUPABASE_URL = $env:VITE_SUPABASE_URL
  }
}

function Require-Env([string]$Name) {
  $v = [string]($env:$Name)
  if (-not $v -or -not $v.Trim()) {
    Write-Error "BLOCKED: $Name is REQUIRED"
    exit 1
  }
  return $v.Trim()
}

function Ensure-Flyctl() {
  $cmd = Get-Command flyctl -ErrorAction SilentlyContinue
  if ($cmd) { return }
  Write-Error "BLOCKED: flyctl is not installed. Install it first using the official installer: iwr https://fly.io/install.ps1 -useb | iex"
  exit 1
}

function New-TmpDir([string]$Path) {
  if (-not (Test-Path $Path)) { New-Item -ItemType Directory -Path $Path | Out-Null }
}

function Replace-Template([string]$TemplatePath, [string]$OutPath, [string]$App, [string]$Reg) {
  if (-not (Test-Path $TemplatePath)) {
    Write-Error "BLOCKED: missing template file: $TemplatePath"
    exit 1
  }
  $raw = Get-Content -Raw -Path $TemplatePath
  $raw = $raw.Replace('REPLACE_ME_APP', $App)
  $raw = $raw.Replace('REPLACE_ME_REGION', $Reg)
  Set-Content -Path $OutPath -Value $raw -Encoding UTF8
}

# Attempt to resolve required values from local env files (silently; never prints secrets).
$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..\\..")
Load-LocalEnvFiles $repoRoot

# Required creds (do not print values)
Require-Env "FLY_API_TOKEN" | Out-Null
$supabaseUrl = Require-Env "SUPABASE_URL"
$agentToken = Require-Env "AGENT_TOKEN"
$orgId = Require-Env "ORGANIZATION_ID"

if (-not $AppName -or -not $AppName.Trim()) {
  Write-Error "BLOCKED: FLY_APP_NAME is REQUIRED (set env var FLY_APP_NAME)"
  exit 1
}

if (-not $Region -or -not $Region.Trim()) {
  # Not a secret; default to Amsterdam for EU latency. Override via FLY_REGION.
  $Region = "ams"
}

Ensure-Flyctl

Write-Host "[fly] Using app '$AppName' in region '$Region'"

# Generate a fly.toml from template (so we can keep app name out of git).
$tmpDir = Join-Path $PSScriptRoot "..\\..\\tmp"
New-TmpDir $tmpDir
$template = Join-Path $PSScriptRoot "..\\..\\queue-pump\\fly.template.toml"
$flyToml = Join-Path $tmpDir "fly.queue-pump.generated.toml"
Replace-Template -TemplatePath $template -OutPath $flyToml -App $AppName -Reg $Region

# Create app if it doesn't exist (idempotent).
try {
  flyctl apps create $AppName | Out-Null
  Write-Host "[fly] Created app: $AppName"
} catch {
  # If creation fails, ensure the app is still accessible (name might be taken).
  try {
    flyctl apps show -a $AppName | Out-Null
    Write-Host "[fly] Using existing app: $AppName"
  } catch {
    Write-Error "BLOCKED: Could not create or access Fly app '$AppName'. The name may be taken. Set a different FLY_APP_NAME and retry."
    exit 1
  }
}

# Set required runtime secrets (do NOT echo values).
flyctl secrets set -a $AppName `
  SUPABASE_URL="$supabaseUrl" `
  AGENT_TOKEN="$agentToken" `
  ORGANIZATION_ID="$orgId" | Out-Null

Write-Host "[fly] Secrets set (SUPABASE_URL, AGENT_TOKEN, ORGANIZATION_ID)"

# Deploy worker.
flyctl deploy -a $AppName -c $flyToml

Write-Host "[fly] Deploy complete. To view logs: flyctl logs -a $AppName"


