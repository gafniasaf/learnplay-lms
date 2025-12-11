# Configure Supabase Secrets Script
# This script helps set required secrets for Edge Functions

Param(
    [string]$ProjectRef = "",
    [string]$AgentToken = "",
    [string]$OpenAIKey = "",
    [string]$AnthropicKey = "",
    [string]$SentryDSN = ""
)

$ErrorActionPreference = "Stop"

if (-not $env:SUPABASE_ACCESS_TOKEN) {
    Write-Error "SUPABASE_ACCESS_TOKEN is not set. Set your Supabase PAT in the environment and retry."
    exit 1
}

# Get project ref from .deploy.env if not provided
if (-not $ProjectRef) {
    if (Test-Path "supabase/.deploy.env") {
        $deployEnv = Get-Content "supabase/.deploy.env" -Raw
        if ($deployEnv -match "SUPABASE_URL=https://([^.]+)\.supabase\.co") {
            $ProjectRef = $matches[1]
            Write-Host "📋 Detected project ref: $ProjectRef" -ForegroundColor Cyan
        }
    }
    
    if (-not $ProjectRef) {
        Write-Error "Project ref not found. Provide it with -ProjectRef parameter or set SUPABASE_URL in supabase/.deploy.env"
        exit 1
    }
}

Write-Host "🔐 Configuring secrets for project: $ProjectRef" -ForegroundColor Cyan
Write-Host ""

# AGENT_TOKEN
if ($AgentToken) {
    Write-Host "Setting AGENT_TOKEN..." -ForegroundColor Yellow
    supabase secrets set AGENT_TOKEN="$AgentToken" --project-ref $ProjectRef
    if ($LASTEXITCODE -eq 0) {
        Write-Host "✅ AGENT_TOKEN set" -ForegroundColor Green
    } else {
        Write-Host "❌ Failed to set AGENT_TOKEN" -ForegroundColor Red
    }
} else {
    Write-Host "⏭️  Skipping AGENT_TOKEN (provide with -AgentToken parameter)" -ForegroundColor Yellow
}

# OPENAI_API_KEY
if ($OpenAIKey) {
    Write-Host "Setting OPENAI_API_KEY..." -ForegroundColor Yellow
    supabase secrets set OPENAI_API_KEY="$OpenAIKey" --project-ref $ProjectRef
    if ($LASTEXITCODE -eq 0) {
        Write-Host "✅ OPENAI_API_KEY set" -ForegroundColor Green
    } else {
        Write-Host "❌ Failed to set OPENAI_API_KEY" -ForegroundColor Red
    }
} else {
    Write-Host "⏭️  Skipping OPENAI_API_KEY (provide with -OpenAIKey parameter)" -ForegroundColor Yellow
}

# ANTHROPIC_API_KEY
if ($AnthropicKey) {
    Write-Host "Setting ANTHROPIC_API_KEY..." -ForegroundColor Yellow
    supabase secrets set ANTHROPIC_API_KEY="$AnthropicKey" --project-ref $ProjectRef
    if ($LASTEXITCODE -eq 0) {
        Write-Host "✅ ANTHROPIC_API_KEY set" -ForegroundColor Green
    } else {
        Write-Host "❌ Failed to set ANTHROPIC_API_KEY" -ForegroundColor Red
    }
} else {
    Write-Host "⏭️  Skipping ANTHROPIC_API_KEY (provide with -AnthropicKey parameter)" -ForegroundColor Yellow
}

# SENTRY_DSN (optional)
if ($SentryDSN) {
    Write-Host "Setting SENTRY_DSN..." -ForegroundColor Yellow
    supabase secrets set SENTRY_DSN="$SentryDSN" --project-ref $ProjectRef
    if ($LASTEXITCODE -eq 0) {
        Write-Host "✅ SENTRY_DSN set" -ForegroundColor Green
    } else {
        Write-Host "❌ Failed to set SENTRY_DSN" -ForegroundColor Red
    }
} else {
    Write-Host "⏭️  Skipping SENTRY_DSN (optional, provide with -SentryDSN parameter)" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "═══════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host "📋 Summary" -ForegroundColor Cyan
Write-Host "═══════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host ""
Write-Host "Verify secrets are set:" -ForegroundColor Yellow
Write-Host "  supabase secrets list --project-ref $ProjectRef" -ForegroundColor White
Write-Host ""


