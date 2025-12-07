# Run E2E Tests Against Live Backend
# This script loads .env.e2e and runs Playwright tests

$ErrorActionPreference = "Stop"

if (-not (Test-Path ".env.e2e")) {
    Write-Error ".env.e2e file not found. Copy .env.e2e.example to .env.e2e and configure with test user credentials."
    exit 1
}

Write-Host "Loading E2E environment variables..." -ForegroundColor Cyan

# Load .env.e2e file
$envVars = @{}
Get-Content ".env.e2e" | ForEach-Object {
    if ($_ -match '^([^=]+)=(.*)$') {
        $key = $matches[1].Trim()
        $value = $matches[2].Trim()
        $envVars[$key] = $value
        [Environment]::SetEnvironmentVariable($key, $value, "Process")
    }
}

Write-Host "Running E2E tests against live backend..." -ForegroundColor Cyan
Write-Host ""

# Run Playwright tests with live- prefix
npx playwright test --grep "live-"

if ($LASTEXITCODE -eq 0) {
    Write-Host ""
    Write-Host "✅ All E2E tests passed!" -ForegroundColor Green
} else {
    Write-Host ""
    Write-Host "❌ Some E2E tests failed. Check reports/playwright-html/index.html for details." -ForegroundColor Red
    exit 1
}

