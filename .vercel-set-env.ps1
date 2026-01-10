param(
    [Parameter(Mandatory=$false)]
    [string]$token = $env:VERCEL_TOKEN
)

if (-not $token) {
    Write-Host "VERCEL_TOKEN is not set. Set environment variable VERCEL_TOKEN or run this script with -token '<token>'"
    exit 1
}

$headers = @{'Authorization' = "Bearer $token" }
$projects = Invoke-RestMethod -Headers $headers -Uri 'https://api.vercel.com/v9/projects'
$proj = $projects.projects | Where-Object { $_.name -eq 'logistica-v2' }
if (-not $proj) { Write-Host 'Project not found' ; exit 1 }
$projId = $proj.id
Write-Host "ProjectId: $projId"

# Read env values from environment variables to avoid committing secrets.
$envs = @(
    @{ key = 'VITE_SUPABASE_URL'; value = $env:VITE_SUPABASE_URL; type = 'encrypted'; target = @('production', 'preview') },
    @{ key = 'VITE_SUPABASE_ANON_KEY'; value = $env:VITE_SUPABASE_ANON_KEY; type = 'encrypted'; target = @('production', 'preview') },
    @{ key = 'VITE_GOOGLE_MAPS_API_KEY'; value = $env:VITE_GOOGLE_MAPS_API_KEY; type = 'encrypted'; target = @('production', 'preview') }
)

# Validate env values are provided
$missing = @()
foreach ($e in $envs) { if (-not $e.value) { $missing += $e.key } }
if ($missing.Count -gt 0) {
    Write-Host "Missing environment variables for: $($missing -join ', ')";
    Write-Host "Please set the corresponding environment variables before running this script (ex: VITE_GOOGLE_MAPS_API_KEY)"
    exit 1
}

foreach ($e in $envs) {
    $body = $e | ConvertTo-Json -Depth 6
    $resp = Invoke-RestMethod -Headers $headers -Uri "https://api.vercel.com/v9/projects/$projId/env" -Method Post -Body $body -ContentType 'application/json'
    Write-Host "Added: $($resp.key)"
}
