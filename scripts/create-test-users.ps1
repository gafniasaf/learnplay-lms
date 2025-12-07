# Create Test Users for E2E Testing
# This script helps create test users via Supabase Management API

Param(
    [string]$SupabaseUrl = "",
    [string]$ServiceRoleKey = "",
    [string]$AdminEmail = "admin@test.local",
    [string]$AdminPassword = "TestAdmin123!",
    [string]$TeacherEmail = "teacher@test.local",
    [string]$TeacherPassword = "TestTeacher123!",
    [string]$StudentEmail = "student@test.local",
    [string]$StudentPassword = "TestStudent123!",
    [string]$ParentEmail = "parent@test.local",
    [string]$ParentPassword = "TestParent123!"
)

$ErrorActionPreference = "Stop"

# Get credentials from .deploy.env if not provided
if (-not $SupabaseUrl -or -not $ServiceRoleKey) {
    if (Test-Path "supabase/.deploy.env") {
        $deployEnv = Get-Content "supabase/.deploy.env" -Raw
        if (-not $SupabaseUrl -and $deployEnv -match "SUPABASE_URL=(.+)") {
            $SupabaseUrl = $matches[1].Trim()
        }
        if (-not $ServiceRoleKey -and $deployEnv -match "SUPABASE_SERVICE_ROLE_KEY=(.+)") {
            $ServiceRoleKey = $matches[1].Trim()
        }
    }
    
    if (-not $SupabaseUrl -or -not $ServiceRoleKey) {
        Write-Error "SupabaseUrl and ServiceRoleKey are required. Provide as parameters or set in supabase/.deploy.env"
        exit 1
    }
}

Write-Host "Creating test users for E2E testing..." -ForegroundColor Cyan
Write-Host ""

function CreateUser {
    param(
        [string]$Email,
        [string]$Password,
        [string]$Role
    )
    
    Write-Host "Creating $Role user: $Email..." -ForegroundColor Yellow
    
    $body = @{
        email = $Email
        password = $Password
        email_confirm = $true
        user_metadata = @{
            role = $Role
        }
    } | ConvertTo-Json
    
    try {
        $response = Invoke-RestMethod -Uri "$SupabaseUrl/auth/v1/admin/users" `
            -Method POST `
            -Headers @{
                "apikey" = $ServiceRoleKey
                "Authorization" = "Bearer $ServiceRoleKey"
                "Content-Type" = "application/json"
            } `
            -Body $body
        
        Write-Host "  SUCCESS: User created (ID: $($response.id))" -ForegroundColor Green
        return $response
    } catch {
        if ($_.Exception.Response.StatusCode -eq 422) {
            Write-Host "  SKIP: User already exists" -ForegroundColor Yellow
        } else {
            Write-Host "  ERROR: $($_.Exception.Message)" -ForegroundColor Red
        }
        return $null
    }
}

# Create users
CreateUser -Email $AdminEmail -Password $AdminPassword -Role "admin"
CreateUser -Email $TeacherEmail -Password $TeacherPassword -Role "teacher"
CreateUser -Email $StudentEmail -Password $StudentPassword -Role "student"
CreateUser -Email $ParentEmail -Password $ParentPassword -Role "parent"

Write-Host ""
Write-Host "Test users created. Configure .env.e2e with these credentials." -ForegroundColor Green
Write-Host ""

