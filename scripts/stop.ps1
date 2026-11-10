# scripts/stop.ps1
# Stops local PDF Canvas backend and frontend processes

Write-Host "Stopping PDF Canvas local processes..." -ForegroundColor Yellow

$port8000 = Get-NetTCPConnection -LocalPort 8000 -ErrorAction SilentlyContinue
if ($port8000) {
    $pids = $port8000.OwningProcess | Select-Object -Unique
    foreach ($p in $pids) {
        Write-Host "Stopping Backend process (PID $p)..."
        Stop-Process -Id $p -Force -ErrorAction SilentlyContinue
    }
} else {
    Write-Host "Backend is not running on port 8000."
}

$port5173 = Get-NetTCPConnection -LocalPort 5173 -ErrorAction SilentlyContinue
if ($port5173) {
    $pids = $port5173.OwningProcess | Select-Object -Unique
    foreach ($p in $pids) {
        Write-Host "Stopping Frontend process (PID $p)..."
        Stop-Process -Id $p -Force -ErrorAction SilentlyContinue
    }
} else {
    Write-Host "Frontend is not running on port 5173."
}

Write-Host "All PDF Canvas processes stopped." -ForegroundColor Green
