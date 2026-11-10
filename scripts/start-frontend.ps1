# scripts/start-frontend.ps1
Write-Host "Starting PDF Canvas Local Frontend on http://localhost:5173..." -ForegroundColor Cyan
Set-Location "$PSScriptRoot\..\frontend"
npm run dev
