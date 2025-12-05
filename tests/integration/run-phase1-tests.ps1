# run-phase1-tests.ps1
# Script to run Phase 1 edge function integration tests (Windows)

$ErrorActionPreference = "Stop"

Write-Host "🧪 Running Phase 1 Edge Function Integration Tests" -ForegroundColor Cyan
Write-Host "==================================================" -ForegroundColor Cyan
Write-Host ""

# Check for required environment variables
if (-not $env:SUPABASE_URL) {
    Write-Host "❌ Error: SUPABASE_URL not set" -ForegroundColor Red
    exit 1
}

if (-not $env:SUPABASE_SERVICE_ROLE_KEY) {
    Write-Host "❌ Error: SUPABASE_SERVICE_ROLE_KEY not set" -ForegroundColor Red
    exit 1
}

if (-not $env:ANTHROPIC_API_KEY) {
    Write-Host "⚠️  Warning: ANTHROPIC_API_KEY not set - tests will be skipped" -ForegroundColor Yellow
}

Write-Host "✓ Environment variables configured" -ForegroundColor Green
Write-Host "  SUPABASE_URL: $env:SUPABASE_URL"
$apiStatus = if ($env:ANTHROPIC_API_KEY) { "✓ Anthropic" } else { "✗ Anthropic" }
Write-Host "  API keys: $apiStatus"
Write-Host ""

# Run the tests
Write-Host "Running integration tests..." -ForegroundColor Cyan
Write-Host ""

deno test `
  --allow-net `
  --allow-env `
  tests/integration/phase1-edge-functions.test.ts `
  $args

Write-Host ""
Write-Host "==================================================" -ForegroundColor Cyan
Write-Host "✅ Tests completed" -ForegroundColor Green
