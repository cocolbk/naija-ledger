# Stop the local Naija Ledger PostgreSQL.
$pgBin = 'C:\Users\HomePC\pg17\pgsql\bin'
$data = 'C:\Users\HomePC\AppData\Local\naija-ledger\pgdata'
& "$pgBin\pg_ctl.exe" -D $data -w stop
