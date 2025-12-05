Param(
  [string]$EnvPath = "lms-mcp/.env.local"
)

$ErrorActionPreference = "Stop"

if (!(Test-Path $EnvPath)) {
  Write-Error "Env file not found: $EnvPath"
  exit 1
}

$lines = Get-Content $EnvPath | Where-Object { $_ -and -not $_.StartsWith('#') }

$dict = @{}
foreach ($line in $lines) {
  $kv = $line -split '=', 2
  if ($kv.Length -eq 2) {
    $dict[$kv[0].Trim()] = $kv[1].Trim()
  }
}

$origin = git config --get remote.origin.url
if (-not $origin) {
  Write-Error "No git origin URL configured"
  exit 1
}

if ($origin -match 'github.com[:/](.+?)/(.+?)(\.git)?$') {
  $owner = $Matches[1]
  $repo  = $Matches[2]
} else {
  Write-Error "Unsupported origin: $origin"
  exit 1
}

$secrets = @(
  'MCP_AUTH_TOKEN',
  'SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
  'AGENT_TOKEN',
  'TEST_COURSE_ID'
)

foreach ($name in $secrets) {
  if ($dict.ContainsKey($name)) {
    Write-Host "Setting secret $name"
    gh secret set $name -R "$owner/$repo" -b $dict[$name] | Out-Null
  } else {
    Write-Warning "Missing $name in $EnvPath; skipping"
  }
}

Write-Host "Done."


