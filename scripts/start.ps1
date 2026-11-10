# scripts/start.ps1
# Starts both Backend and Frontend in separate local PowerShell windows

Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "Launching PDF Canvas (100% Local Monolith)" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan

$root = (Get-Item $PSScriptRoot).Parent.FullName

Write-Host "Starting Backend on http://127.0.0.1:8000..." -ForegroundColor Yellow
Start-Process powershell -ArgumentList "-NoExit", "-ExecutionPolicy", "Bypass", "-File", "$root\scripts\start-backend.ps1"

Start-Sleep -Seconds 2

Write-Host "Starting Frontend on http://localhost:5173..." -ForegroundColor Yellow
Start-Process powershell -ArgumentList "-NoExit", "-ExecutionPolicy", "Bypass", "-File", "$root\scripts\start-frontend.ps1"

Start-Sleep -Seconds 2

Write-Host "Opening browser..." -ForegroundColor Green
Start-Process "http://localhost:5173"

Write-Host "`nPDF Canvas is running! Use scripts\stop.ps1 to shut down." -ForegroundColor Green
