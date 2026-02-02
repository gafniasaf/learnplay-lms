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
      if ($v.StartsWith('"') -and $v.EndsWith('"')) { $v = $v.Substring(1, $v.Length - 2) }
      if ($v.StartsWith("'") -and $v.EndsWith("'")) { $v = $v.Substring(1, $v.Length - 2) }

      $existing = [string]([Environment]::GetEnvironmentVariable($k))
      if (-not $existing -or -not $existing.Trim()) {
        [Environment]::SetEnvironmentVariable($k, $v, 'Process')
      }
    }
  } catch {
    # ignore unreadable local env files
  }
}

function Load-HeadingStyleEnvFile([string]$FilePath) {
  if (-not (Test-Path $FilePath)) { return }
  try {
    $lines = Get-Content -Path $FilePath -ErrorAction Stop
    $nextNonEmptyLine = {
      param([int]$StartIdx)
      for ($j = $StartIdx; $j -lt $lines.Length; $j++) {
        $v = [string]($lines[$j])
        if (-not $v) { continue }
        $v = $v.Trim()
        if (-not $v) { continue }
        return $v
      }
      return ""
    }

    for ($i = 0; $i -lt $lines.Length; $i++) {
      $line = [string]($lines[$i])
      if (-not $line) { continue }
      $line = $line.Trim()
      if (-not $line) { continue }
      if ($line.StartsWith("#")) { continue }

      # Only handle heading-style lines when no KEY=VALUE is present.
      if ($line.IndexOf("=") -ge 1) { continue }

      $next = & $nextNonEmptyLine ($i + 1)
      if (-not $next) { continue }

      # Only set if not already set (env vars take precedence).
      if ($line -match '(?i)Project url' -and (-not $env:SUPABASE_URL -or -not $env:SUPABASE_URL.Trim())) {
        $env:SUPABASE_URL = $next
        continue
      }
      if ($line -match '(?i)anon public' -and (-not $env:SUPABASE_ANON_KEY -or -not $env:SUPABASE_ANON_KEY.Trim())) {
        $env:SUPABASE_ANON_KEY = $next
        continue
      }
      if ($line -match '(?i)service role key' -and (-not $env:SUPABASE_SERVICE_ROLE_KEY -or -not $env:SUPABASE_SERVICE_ROLE_KEY.Trim())) {
        $env:SUPABASE_SERVICE_ROLE_KEY = $next
        continue
      }
      if ($line -match '(?i)openai (api )?key' -and (-not $env:OPENAI_API_KEY -or -not $env:OPENAI_API_KEY.Trim())) {
        $env:OPENAI_API_KEY = $next
        continue
      }
      if ($line -match '(?i)anthropic (api )?key' -and (-not $env:ANTHROPIC_API_KEY -or -not $env:ANTHROPIC_API_KEY.Trim())) {
        $env:ANTHROPIC_API_KEY = $next
        continue
      }
      if ($line -match '(?i)agent token' -and (-not $env:AGENT_TOKEN -or -not $env:AGENT_TOKEN.Trim())) {
        $env:AGENT_TOKEN = $next
        continue
      }
      if ($line -match '(?i)organization id' -and (-not $env:ORGANIZATION_ID -or -not $env:ORGANIZATION_ID.Trim())) {
        $env:ORGANIZATION_ID = $next
        continue
      }
    }
  } catch {
    # ignore
  }
}

function Load-RawFlyTokenFile([string]$FilePath) {
  if (-not (Test-Path $FilePath)) { return }
  $existing = [string]([Environment]::GetEnvironmentVariable("FLY_API_TOKEN"))
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
    foreach ($l in ($raw -split "`n")) {
      $t = [string]$l
      if (-not $t) { continue }
      $t = $t.Trim()
      if (-not $t) { continue }
      if ($t.StartsWith("#")) { continue }
      $line = $t
      break
    }
    if (-not $line) { return }

    # Some UIs copy multiple tokens separated by commas; pick the first usable token.
    $candidates = @($line)
    if ($line.Contains(",")) {
      $candidates = $line.Split(",") | ForEach-Object { [string]($_.Trim()) } | Where-Object { $_ -and $_.Trim() }
    }

    $picked = $null
    foreach ($cand0 in $candidates) {
      $cand = [string]$cand0
      if (-not $cand) { continue }
      $cand = $cand.Trim()
      if (-not $cand) { continue }

      # Common copy format: "FlyV1 fm2_...". FLY_API_TOKEN expects the token value (fm2_...).
      if ($cand -match '^(?i)FlyV1\\s+') {
        $cand = ($cand -replace '^(?i)FlyV1\\s+', '').Trim()
      }

      # Only accept Personal Access Tokens (fm2_*). App Deploy Tokens will not work here.
      if ($cand -match '^fm2_') { $picked = $cand; break }
    }

    if (-not $picked -or $picked.Length -lt 20) { return }
    [Environment]::SetEnvironmentVariable("FLY_API_TOKEN", $picked, 'Process')
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
  foreach ($f in $candidates) {
    Load-KeyValueEnvFile $f
    # Back-compat: support learnplay.env heading-style blocks (never prints secrets).
    Load-HeadingStyleEnvFile $f
  }

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
  $v = [string]([Environment]::GetEnvironmentVariable($Name))
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

function Run-Fly([string[]]$FlyArgs, [string]$Desc) {
  & flyctl @FlyArgs
  if ($LASTEXITCODE -ne 0) {
    Write-Error "BLOCKED: $Desc failed (exit code $LASTEXITCODE)"
    exit 1
  }
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
  # IMPORTANT: Write UTF-8 WITHOUT BOM (PowerShell 5.1 Set-Content UTF8 writes BOM, which breaks fly.toml parsing).
  [System.IO.File]::WriteAllText($OutPath, $raw, (New-Object System.Text.UTF8Encoding($false)))
}

# Attempt to resolve required values from local env files (silently; never prints secrets).
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\\..")).Path
Load-LocalEnvFiles $repoRoot

# Ensure flyctl exists and auth is usable.
Ensure-Flyctl

# If a non-PAT token is present, it can break flyctl auth. Clear it so cached login can work.
$flyToken = [string]([Environment]::GetEnvironmentVariable("FLY_API_TOKEN"))
if ($flyToken -and $flyToken.Trim() -and (-not ($flyToken.Trim() -match '^fm2_'))) {
  [Environment]::SetEnvironmentVariable("FLY_API_TOKEN", $null, 'Process')
  $env:FLY_API_TOKEN = $null
}

& flyctl auth whoami | Out-Null
if ($LASTEXITCODE -ne 0) {
  Write-Error "BLOCKED: Fly auth missing. Set FLY_API_TOKEN (Personal Access Token, fm2_*) or run 'flyctl auth login' and retry."
  exit 1
}

# Required creds (do not print values)
$supabaseUrl = Require-Env "SUPABASE_URL"
$serviceRoleKey = Require-Env "SUPABASE_SERVICE_ROLE_KEY"
$agentToken = Require-Env "AGENT_TOKEN"
$orgId = Require-Env "ORGANIZATION_ID"

# LLM provider keys (require at least one)
$openaiKey = [string]([Environment]::GetEnvironmentVariable("OPENAI_API_KEY"))
$anthropicKey = [string]([Environment]::GetEnvironmentVariable("ANTHROPIC_API_KEY"))
$aiProvider = [string]([Environment]::GetEnvironmentVariable("AI_PROVIDER"))
$openaiChatModel = [string]([Environment]::GetEnvironmentVariable("OPENAI_CHAT_MODEL"))
$openaiCourseModel = [string]([Environment]::GetEnvironmentVariable("OPENAI_COURSE_MODEL"))
$openaiEmbeddingModel = [string]([Environment]::GetEnvironmentVariable("OPENAI_EMBEDDING_MODEL"))
$anthropicModel = [string]([Environment]::GetEnvironmentVariable("ANTHROPIC_MODEL"))
$queueLlmTimeout = [string]([Environment]::GetEnvironmentVariable("QUEUE_PUMP_LLM_TIMEOUT_MS"))

if ((-not $openaiKey -or -not $openaiKey.Trim()) -and (-not $anthropicKey -or -not $anthropicKey.Trim())) {
  Write-Error "BLOCKED: Either OPENAI_API_KEY or ANTHROPIC_API_KEY is REQUIRED to run the queue worker."
  exit 1
}

if (-not $AppName -or -not $AppName.Trim()) {
  Write-Error "BLOCKED: FLY_APP_NAME is REQUIRED (set env var FLY_APP_NAME)"
  exit 1
}

if (-not $Region -or -not $Region.Trim()) {
  # Not a secret; default to Amsterdam for EU latency. Override via FLY_REGION.
  $Region = "ams"
}

Write-Host "[fly] Using app '$AppName' in region '$Region'"

# Generate a fly.toml from template (so we can keep app name out of git).
$tmpDir = Join-Path $PSScriptRoot "..\\..\\tmp"
New-TmpDir $tmpDir
$template = Join-Path $PSScriptRoot "..\\..\\queue-pump\\fly.template.toml"
$flyToml = Join-Path $repoRoot "fly.queue-pump.generated.toml"
Replace-Template -TemplatePath $template -OutPath $flyToml -App $AppName -Reg $Region

# Create app if it doesn't exist (idempotent) — fail loud if the name is taken.
& flyctl apps create $AppName | Out-Null
if ($LASTEXITCODE -eq 0) {
  Write-Host "[fly] Created app: $AppName"
} else {
  # If create fails, ensure the app is still accessible (name might be taken).
  & flyctl status -a $AppName | Out-Null
  if ($LASTEXITCODE -eq 0) {
    Write-Host "[fly] Using existing app: $AppName"
  } else {
    Write-Error "BLOCKED: Could not create or access Fly app '$AppName'. The name may be taken. Set a different FLY_APP_NAME and retry."
    exit 1
  }
}

# Set required runtime secrets (do NOT echo values).
$secretArgs = @(
  "secrets","set","-a",$AppName,
  "SUPABASE_URL=$supabaseUrl",
  "SUPABASE_SERVICE_ROLE_KEY=$serviceRoleKey",
  "AGENT_TOKEN=$agentToken",
  "ORGANIZATION_ID=$orgId"
)

if ($openaiKey -and $openaiKey.Trim()) { $secretArgs += "OPENAI_API_KEY=$openaiKey" }
if ($anthropicKey -and $anthropicKey.Trim()) { $secretArgs += "ANTHROPIC_API_KEY=$anthropicKey" }
if ($aiProvider -and $aiProvider.Trim()) { $secretArgs += "AI_PROVIDER=$aiProvider" }
if ($openaiChatModel -and $openaiChatModel.Trim()) { $secretArgs += "OPENAI_CHAT_MODEL=$openaiChatModel" }
if ($openaiCourseModel -and $openaiCourseModel.Trim()) { $secretArgs += "OPENAI_COURSE_MODEL=$openaiCourseModel" }
if ($openaiEmbeddingModel -and $openaiEmbeddingModel.Trim()) { $secretArgs += "OPENAI_EMBEDDING_MODEL=$openaiEmbeddingModel" }
if ($anthropicModel -and $anthropicModel.Trim()) { $secretArgs += "ANTHROPIC_MODEL=$anthropicModel" }
if ($queueLlmTimeout -and $queueLlmTimeout.Trim()) { $secretArgs += "QUEUE_PUMP_LLM_TIMEOUT_MS=$queueLlmTimeout" }

Run-Fly -FlyArgs $secretArgs -Desc "flyctl secrets set"

Write-Host "[fly] Secrets set (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, LLM keys, AGENT_TOKEN, ORGANIZATION_ID)"

# Deploy worker (force dockerfile path relative to repo root).
Run-Fly -FlyArgs @("deploy","-a",$AppName,"-c",$flyToml,"--dockerfile","queue-pump/Dockerfile") -Desc "flyctl deploy"

Write-Host "[fly] Deploy complete. To view logs: flyctl logs -a $AppName"


