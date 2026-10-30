# Manual smoke test of the live API (spec §13 step 12).
# Usage: start the server (npm run dev) in one terminal, then run:
#   powershell -File tools/smoke-auth.ps1
$ErrorActionPreference = 'Stop'
$base = 'http://localhost:5000'

function Show($label, $value) { Write-Host ("{0,-34} {1}" -f $label, $value) }

$admin = Invoke-RestMethod -Uri "$base/api/auth/login" -Method Post -ContentType 'application/json' `
  -Body '{"email":"admin@ganza.com","password":"Admin@123"}'
Show '1. admin login role' $admin.data.user.role
$tok = $admin.data.token

$me = Invoke-RestMethod -Uri "$base/api/auth/me" -Headers @{ Authorization = "Bearer $tok" }
Show '2. GET /auth/me' $me.data.user.email

$users = Invoke-RestMethod -Uri "$base/api/admin/users?limit=3" -Headers @{ Authorization = "Bearer $tok" }
Show '3. admin user list total' $users.pagination.total
Show '4. first page' (($users.data | ForEach-Object { $_.email }) -join ', ')

try {
  Invoke-RestMethod -Uri "$base/api/admin/users" -Headers @{ Authorization = 'Bearer garbage.token.value' } | Out-Null
  Show '5. forged token' 'NOT BLOCKED (unexpected!)'
} catch { Show '5. forged token rejected' $_.Exception.Response.StatusCode.value__ }

try {
  Invoke-RestMethod -Uri "$base/api/auth/login" -Method Post -ContentType 'application/json' `
    -Body '{"email":"admin@ganza.com","password":"wrongpassword1"}' | Out-Null
  Show '6. bad password' 'NOT BLOCKED (unexpected!)'
} catch { Show '6. bad password rejected' $_.Exception.Response.StatusCode.value__ }

Invoke-RestMethod -Uri "$base/api/auth/logout" -Method Post -Headers @{ Authorization = "Bearer $tok" } | Out-Null
Show '7. logout' 'ok'

try {
  Invoke-RestMethod -Uri "$base/api/auth/me" -Headers @{ Authorization = "Bearer $tok" } | Out-Null
  Show '8. old token after logout' 'STILL ACCEPTED (unexpected!)'
} catch { Show '8. old token now revoked' $_.Exception.Response.StatusCode.value__ }

Write-Host ''
Write-Host 'Done.'
