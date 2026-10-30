# Phase 5 live walkthrough: starts nothing, expects `npm run dev` (or `npm start`) to be running.
#   PowerShell:  .\tools\smoke-catalog.ps1
$ErrorActionPreference = 'Stop'
$base = 'http://localhost:5000'

function Show($label) { Write-Host "`n=== $label ===" -ForegroundColor Cyan }

Show '1. Health'
Invoke-RestMethod "$base/api/health" | ConvertTo-Json -Depth 4

Show '2. Public catalogue: phones under the parent slug "electronics", cheapest first'
$list = Invoke-RestMethod "$base/api/products?category=electronics&sort=price-asc&limit=3"
"total={$($list.pagination.total)}  page={$($list.pagination.page)}/{$($list.pagination.pages)}"
$list.data | ForEach-Object { "{0,-38} {1,10} RWF  rating={2} sold={3}" -f $_.name, $_.effectivePrice, $_.rating, $_.soldCount }

Show '3. Search + filters (a shopper typing "gal")'
(Invoke-RestMethod "$base/api/products?search=gal").data | ForEach-Object { $_.name }

Show '4. Product detail bundle (card image is images[0], plus related items)'
$detail = Invoke-RestMethod "$base/api/products/1"
"product   : $($detail.data.product.name)"
"gallery   : $($detail.data.images.Count) image(s), first = $($detail.data.images[0].url)"
"related   : $($detail.data.related | ForEach-Object { $_.name })"

Show '5. Category tree with rolled-up counts'
$tree = Invoke-RestMethod "$base/api/categories"
$tree.data | ForEach-Object {
  "{0,-18} own={1,-3} total={2,-3} children={3}" -f $_.name, $_.productCount, $_.totalProductCount, ($_.children.name -join ', ')
}

Show '6. Anonymous caller must NOT reach the admin product list'
try {
  Invoke-RestMethod "$base/api/admin/products"
  Write-Host 'UNEXPECTED SUCCESS' -ForegroundColor Red
} catch { "blocked with HTTP $($_.Exception.Response.StatusCode.value__) (expected 401)" }

Show '7. Admin sees archive/inventory fields and can filter low stock'
$login = Invoke-RestMethod -Method Post -Uri "$base/api/auth/login" -ContentType 'application/json' `
  -Body (@{ email = 'admin@ganza.com'; password = 'Admin@123' } | ConvertTo-Json)
$hdr = @{ Authorization = "Bearer $($login.data.token)" }
$low = Invoke-RestMethod -Headers $hdr "$base/api/admin/products?lowStock=true&limit=100"
"low-stock products: $($low.data.Count)"
$low.data | ForEach-Object { "{0,-38} stock={1,-4} threshold={2} isLowStock={3}" -f $_.name, $_.stock, $_.lowStockThreshold, $_.isLowStock }

Show '8. Create a product, upload a real PNG, read it back, then delete it'
# Windows PowerShell 5.1 has no multipart support in Invoke-RestMethod, so curl.exe
# (shipped with Windows 10/11) is used here. A 1x1 PNG is written from base64 so the
# script needs no extra image tooling.
$pngPath = Join-Path $PSScriptRoot 'smoke.png'
[IO.File]::WriteAllBytes($pngPath, [Convert]::FromBase64String(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='))
$stamp = Get-Date -Format 'yyyyMMddHHmmss'
$raw = & curl.exe -s -X POST "$base/api/products" -H "Authorization: Bearer $($login.data.token)" `
  -F "name=Smoke Test Product $stamp" -F 'description=Created by tools/smoke-catalog.ps1 to prove the upload path works.' `
  -F 'categoryId=9' -F 'price=12500' -F 'stock=2' -F "sku=SMK-$stamp" -F "images=@$pngPath"
Remove-Item $pngPath
$created = $raw | ConvertFrom-Json
$id = $created.data.product.id
"created id=$id slug=$($created.data.product.slug) image=$($created.data.product.imageUrl)"
$img = Invoke-WebRequest "$base$($created.data.product.imageUrl)" -UseBasicParsing
"served /uploads file: HTTP $($img.StatusCode) $($img.Headers['Content-Type']) $($img.RawContentLength) bytes"

Invoke-RestMethod -Method Patch -Uri "$base/api/products/${id}/stock" -Headers $hdr -ContentType 'application/json' -Body '{"stock":7}' |
  ForEach-Object { "stock adjusted -> $($_.data.product.stock) (isLowStock=$($_.data.product.isLowStock))" }

# NOTE the braces around ${id}: in a PowerShell double-quoted string a variable
# written as "$id?mode=permanent" does NOT expand (the '?' is swallowed), so the
# request would go out as /api/products/=permanent. '.' and '-' are fine; '?' is
# not. Delimit a variable followed by '?' with ${}, or build the URL by concatenation.
Invoke-RestMethod -Method Delete -Uri "$base/api/products/${id}?mode=permanent" -Headers $hdr |
  ForEach-Object { "cleanup: mode=$($_.data.mode) id=$($_.data.id)" }

Write-Host "`nAll catalogue checks completed." -ForegroundColor Green
