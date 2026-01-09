$token = 'qowKPPj1GDxNkwyzMojB70V2'
$headers = @{'Authorization' = "Bearer $token" }
$projects = Invoke-RestMethod -Headers $headers -Uri 'https://api.vercel.com/v9/projects'
$proj = $projects.projects | Where-Object { $_.name -eq 'logistica-v2' }
if (-not $proj) { Write-Host 'Project not found' ; exit 1 }
$projId = $proj.id
Write-Host "ProjectId: $projId"
$envs = @(
    @{ key = 'VITE_SUPABASE_URL'; value = 'https://xdsoctyzmsxbhtjehsqd.supabase.co'; type = 'encrypted'; target = @('production', 'preview') },
    @{ key = 'VITE_SUPABASE_ANON_KEY'; value = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inhkc29jdHl6bXN4Ymh0amVoc3FkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjYzMjcxMDMsImV4cCI6MjA4MTkwMzEwM30.WjvJ9E52JXJzjnWAocxQsS9vSAZmrndUuAjUKW_pyCk'; type = 'encrypted'; target = @('production', 'preview') }
)
foreach ($e in $envs) {
    $body = $e | ConvertTo-Json -Depth 6
    $resp = Invoke-RestMethod -Headers $headers -Uri "https://api.vercel.com/v9/projects/$projId/env" -Method Post -Body $body -ContentType 'application/json'
    Write-Host "Added: $($resp.key)"
}
