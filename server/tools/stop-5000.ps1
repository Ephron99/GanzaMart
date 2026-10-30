$conns = Get-NetTCPConnection -LocalPort 5000 -State Listen -ErrorAction SilentlyContinue
if ($conns) {
  $conns.OwningProcess | Select-Object -Unique | ForEach-Object {
    $proc = Get-Process -Id $_ -ErrorAction SilentlyContinue
    if ($proc) {
      Write-Output ("Stopping PID " + $proc.Id + " (" + $proc.ProcessName + ")")
      Stop-Process -Id $proc.Id -Force
    }
  }
} else {
  Write-Output "No listener on 5000"
}
