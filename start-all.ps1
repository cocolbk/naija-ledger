# One-click local start: Postgres (if not running) + API serving the app.
$pgBin = 'C:\Users\HomePC\pg17\pgsql\bin'
$data = 'C:\Users\HomePC\AppData\Local\naija-ledger\pgdata'
$serverDir = 'C:\Users\HomePC\Desktop\naija ledger\server'

& "$pgBin\pg_ctl.exe" -D $data -l "$data\server.log" -w start 2>&1 | Select-Object -Last 1
Start-Process -FilePath 'npm.cmd' -ArgumentList 'run dev' -WorkingDirectory $serverDir `
  -RedirectStandardOutput "$serverDir\dev.log" -RedirectStandardError "$serverDir\dev.err.log" -WindowStyle Hidden
Start-Sleep -Seconds 10
curl.exe -s http://localhost:3000/api/health
Write-Output ''
Write-Output 'Open http://localhost:3000 in your browser.'
