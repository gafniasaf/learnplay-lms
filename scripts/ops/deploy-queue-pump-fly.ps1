param(
  [string]$AppName = $env:FLY_APP_NAME,
  [string]$Region = $env:FLY_REGION
)

$ErrorActionPreference = 'Stop'

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
  Write-Host "[fly] App may already exist: $AppName (continuing)"
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


