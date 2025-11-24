# Check Access Logs from Google Cloud
# This script queries Google Cloud Logging for HTTP access logs

Write-Host "`n=== ACC User Management - Access Log Analysis ===" -ForegroundColor Cyan

# Query logs from the last 7 days
$filter = @"
resource.type="gce_instance"
resource.labels.instance_id="acc-user-management-vm"
jsonPayload.type="http_request"
"@

Write-Host "`nQuerying logs from the last 7 days..." -ForegroundColor Yellow

# Get logs
gcloud logging read $filter `
    --limit=1000 `
    --format=json `
    --freshness=7d `
    --project=acc-user-mgmt | ConvertFrom-Json | ForEach-Object {
        $_.jsonPayload
    } | Select-Object timestamp, ip, method, url, userAgent | Out-String

Write-Host "`n=== Summary ===" -ForegroundColor Cyan

# Get unique IPs
Write-Host "`nUnique IP Addresses:" -ForegroundColor Green
gcloud logging read $filter `
    --limit=1000 `
    --format="value(jsonPayload.ip)" `
    --freshness=7d `
    --project=acc-user-mgmt | Sort-Object -Unique

# Count requests
Write-Host "`nTotal Requests:" -ForegroundColor Green
$count = gcloud logging read $filter `
    --limit=1000 `
    --format="value(jsonPayload.ip)" `
    --freshness=7d `
    --project=acc-user-mgmt | Measure-Object | Select-Object -ExpandProperty Count
Write-Host $count -ForegroundColor White

Write-Host "`nNote: To see geographic location of IPs, visit:" -ForegroundColor Yellow
Write-Host "https://console.cloud.google.com/logs/query?project=acc-user-mgmt" -ForegroundColor Cyan
Write-Host "`nOr manually check IPs at: https://www.iplocation.net/`n" -ForegroundColor Cyan
