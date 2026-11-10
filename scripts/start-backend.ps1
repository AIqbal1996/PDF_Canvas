# scripts/start-backend.ps1
Write-Host "Starting PDF Canvas Local Backend on 127.0.0.1:8000..." -ForegroundColor Cyan
Set-Location "$PSScriptRoot\..\backend"
python -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
