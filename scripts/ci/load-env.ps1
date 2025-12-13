Param(
  [Parameter(Mandatory = $true)]
  [string]$EnvPath
)

$ErrorActionPreference = "Stop"

if (!(Test-Path $EnvPath)) {
  Write-Error "Env file not found: $EnvPath"
  exit 1
}

# Load KEY=VALUE lines into process env (no printing of values)
Get-Content -Encoding UTF8 $EnvPath | ForEach-Object {
  $line = $_.Trim()
  if ($line -eq "" -or $line.StartsWith("#")) { return }
  if ($line -match "^([A-Za-z_][A-Za-z0-9_]*)=(.*)$") {
    $name = $matches[1]
    $val = $matches[2].Trim()
    if (($val.StartsWith('"') -and $val.EndsWith('"')) -or ($val.StartsWith("'") -and $val.EndsWith("'"))) {
      $val = $val.Substring(1, $val.Length - 2)
    }
    [System.Environment]::SetEnvironmentVariable($name, $val, "Process")
  }
}

Write-Host "Loaded env vars from $EnvPath (sanitized: values not printed)."


