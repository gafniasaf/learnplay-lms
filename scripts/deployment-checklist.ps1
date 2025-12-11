# Deployment Checklist Script
# This script helps verify all prerequisites are met before deployment

$ErrorActionPreference = "Stop"

Write-Host "Deployment Pre-Flight Checklist" -ForegroundColor Cyan
Write-Host ""

# Check 1: Verify .deploy.env exists and has required values
Write-Host "1. Checking deployment environment file..." -ForegroundColor Yellow
if (Test-Path "supabase/.deploy.env") {
    $deployEnv = Get-Content "supabase/.deploy.env" -Raw
    $checks = @{}
    $checks["SUPABASE_URL"] = $deployEnv -match "SUPABASE_URL=https://"
    $checks["SUPABASE_ANON_KEY"] = $deployEnv -match "SUPABASE_ANON_KEY=eyJ"
    $checks["SUPABASE_SERVICE_ROLE_KEY"] = $deployEnv -match "SUPABASE_SERVICE_ROLE_KEY=eyJ"
    $checks["AGENT_TOKEN"] = ($deployEnv -match "AGENT_TOKEN=") -and ($deployEnv -notmatch "AGENT_TOKEN=YOUR_")
    $checks["ORGANIZATION_ID"] = ($deployEnv -match "ORGANIZATION_ID=") -and ($deployEnv -notmatch "ORGANIZATION_ID=00000000")
    
    $allPassed = $true
    foreach ($key in $checks.Keys) {
        if ($checks[$key]) {
            Write-Host "   PASS: $key" -ForegroundColor Green
        } else {
            Write-Host "   FAIL: $key - NOT CONFIGURED" -ForegroundColor Red
            $allPassed = $false
        }
    }
    
    if (-not $allPassed) {
        Write-Host ""
        Write-Host "WARNING: Please configure supabase/.deploy.env with your actual values" -ForegroundColor Yellow
        Write-Host "   See supabase/.deploy.env.example for reference" -ForegroundColor Yellow
    }
} else {
    Write-Host "   FAIL: supabase/.deploy.env not found" -ForegroundColor Red
    Write-Host "   Copy supabase/.deploy.env.example to supabase/.deploy.env and configure" -ForegroundColor Yellow
}

Write-Host ""

# Check 2: Verify SUPABASE_ACCESS_TOKEN is set
Write-Host "2. Checking SUPABASE_ACCESS_TOKEN..." -ForegroundColor Yellow
if ($env:SUPABASE_ACCESS_TOKEN) {
    Write-Host "   PASS: SUPABASE_ACCESS_TOKEN is set" -ForegroundColor Green
} else {
    Write-Host "   FAIL: SUPABASE_ACCESS_TOKEN not set" -ForegroundColor Red
    Write-Host "   Set it with: " -NoNewline -ForegroundColor Yellow
    Write-Host '$env:SUPABASE_ACCESS_TOKEN = "sbp_..."' -ForegroundColor White
}

Write-Host ""

# Check 3: Verify TypeScript compiles
Write-Host "3. Checking TypeScript compilation..." -ForegroundColor Yellow
$typecheckResult = & npm run typecheck 2>&1
if ($LASTEXITCODE -eq 0) {
    Write-Host "   PASS: TypeScript compiles successfully" -ForegroundColor Green
} else {
    Write-Host "   FAIL: TypeScript errors found" -ForegroundColor Red
    Write-Host "   Run 'npm run typecheck' to see errors" -ForegroundColor Yellow
}

Write-Host ""

# Check 4: Verify Supabase CLI is installed
Write-Host "4. Checking Supabase CLI..." -ForegroundColor Yellow
$supabaseCheck = & supabase --version 2>&1
if ($LASTEXITCODE -eq 0) {
    Write-Host "   PASS: Supabase CLI installed" -ForegroundColor Green
} else {
    Write-Host "   FAIL: Supabase CLI not found" -ForegroundColor Red
    Write-Host "   Install with: npm install -g supabase" -ForegroundColor Yellow
}

Write-Host ""

# Summary
Write-Host "===============================================" -ForegroundColor Cyan
Write-Host "Summary" -ForegroundColor Cyan
Write-Host "===============================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Yellow
Write-Host "1. Configure supabase/.deploy.env with your Supabase credentials" -ForegroundColor White
Write-Host "2. Set SUPABASE_ACCESS_TOKEN environment variable" -ForegroundColor White
Write-Host "3. Run deployment: .\scripts\ci\deploy-functions.ps1 -EnvPath supabase/.deploy.env" -ForegroundColor White
Write-Host "4. Configure secrets: See docs/DEPLOYMENT_GUIDE.md Phase 3" -ForegroundColor White
Write-Host "5. Verify deployment: npx tsx scripts/verify-live-deployment.ts" -ForegroundColor White
Write-Host ""
