Param(
  [Parameter(Mandatory=$true)][string]$BaseUrl,
  [Parameter(Mandatory=$true)][string]$AuthToken,
  [string]$TeacherId = "t_demo",
  [string]$SlotId = "slot_demo",
  [string]$PackageId = "pkg_3"
)

$headers = @{ Authorization = "Bearer $AuthToken"; "Content-Type" = "application/json" }

function Invoke-JsonGet([string]$Path) {
  Write-Host "GET $Path" -ForegroundColor Cyan
  Invoke-RestMethod -Method Get -Uri ("$BaseUrl$Path") -Headers $headers
}

function Invoke-JsonPost([string]$Path, $Body) {
  Write-Host "POST $Path" -ForegroundColor Cyan
  $json = $Body | ConvertTo-Json -Depth 10
  Invoke-RestMethod -Method Post -Uri ("$BaseUrl$Path") -Headers $headers -Body $json
}

Write-Host "\n== Packages ==" -ForegroundColor Yellow
Invoke-JsonGet "/v2/available-lessons/packages" | Format-Table | Out-String | Write-Host

Write-Host "\n== Balance (before) ==" -ForegroundColor Yellow
Invoke-JsonGet "/v2/available-lessons/balance" | ConvertTo-Json -Depth 10 | Write-Host

Write-Host "\n== Buy with wallet (idempotent) ==" -ForegroundColor Yellow
$idem = [Guid]::NewGuid().ToString()
Invoke-JsonPost "/v2/available-lessons/buy-with-wallet" @{ packageId=$PackageId; idempotencyKey=$idem } | ConvertTo-Json -Depth 10 | Write-Host
Write-Host "Repeat same idempotencyKey (should return same success)" -ForegroundColor DarkYellow
Invoke-JsonPost "/v2/available-lessons/buy-with-wallet" @{ packageId=$PackageId; idempotencyKey=$idem } | ConvertTo-Json -Depth 10 | Write-Host

Write-Host "\n== Trial eligibility ==" -ForegroundColor Yellow
Invoke-JsonGet ("/v2/trial/eligibility?teacherId=" + [Uri]::EscapeDataString($TeacherId)) | ConvertTo-Json -Depth 10 | Write-Host

Write-Host "\n== Trial verify (wallet) ==" -ForegroundColor Yellow
$idem2 = [Guid]::NewGuid().ToString()
Invoke-JsonPost "/v2/trial/verify" @{ method="wallet"; idempotencyKey=$idem2 } | ConvertTo-Json -Depth 10 | Write-Host

Write-Host "\n== Book credit ==" -ForegroundColor Yellow
$idem3 = [Guid]::NewGuid().ToString()
Invoke-JsonPost "/v2/slots/book" @{ teacherId=$TeacherId; slotId=$SlotId; method="credit"; idempotencyKey=$idem3; studentIanaTimezone="Asia/Riyadh" } | ConvertTo-Json -Depth 10 | Write-Host

Write-Host "\n== Book trial ==" -ForegroundColor Yellow
$idem4 = [Guid]::NewGuid().ToString()
Invoke-JsonPost "/v2/slots/book" @{ teacherId=$TeacherId; slotId=$SlotId; method="trial"; idempotencyKey=$idem4; studentIanaTimezone="Asia/Riyadh" } | ConvertTo-Json -Depth 10 | Write-Host

Write-Host "\nDone." -ForegroundColor Green
