# scripts/setup.ps1
# Sets up the 100% local development environment for PDF Canvas

Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "Setting up PDF Canvas (100% Local-First)  " -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan

# 1. Check prerequisites
Write-Host "`n[1/4] Checking prerequisites..." -ForegroundColor Yellow
$python = Get-Command python -ErrorAction SilentlyContinue
if (-not $python) {
    Write-Error "Python 3.12+ was not found on PATH. Please install Python."
    exit 1
}
Write-Host "Found Python: $($python.Source)" -ForegroundColor Green

$node = Get-Command node -ErrorAction SilentlyContinue
if (-not $node) {
    Write-Error "Node.js was not found on PATH. Please install Node.js LTS."
    exit 1
}
Write-Host "Found Node: $($node.Source)" -ForegroundColor Green

# 2. Create local_data directories
Write-Host "`n[2/4] Initializing local storage directories..." -ForegroundColor Yellow
$localDirs = @(
    "local_data\originals",
    "local_data\working",
    "local_data\exports",
    "local_data\templates",
    "local_data\thumbnails",
    "local_data\history",
    "local_data\temp"
)
foreach ($dir in $localDirs) {
    if (-not (Test-Path $dir)) {
        New-Item -ItemType Directory -Path $dir -Force | Out-Null
        Write-Host "  Created $dir" -ForegroundColor Gray
    }
}
Write-Host "Storage directories initialized." -ForegroundColor Green

# 3. Setup Backend
Write-Host "`n[3/4] Installing backend dependencies..." -ForegroundColor Yellow
python -m pip install -r backend/requirements.txt
Write-Host "Backend dependencies installed successfully." -ForegroundColor Green

# 4. Setup Frontend
Write-Host "`n[4/4] Installing frontend dependencies..." -ForegroundColor Yellow
Set-Location frontend
npm install
Set-Location ..
Write-Host "Frontend dependencies installed successfully." -ForegroundColor Green

# Optional tools notice
Write-Host "`nChecking optional OCR and Office conversion tools..." -ForegroundColor Yellow
$tesseract = Get-Command tesseract -ErrorAction SilentlyContinue
if ($tesseract) {
    Write-Host "  Tesseract OCR: Found ($($tesseract.Source))" -ForegroundColor Green
} else {
    Write-Host "  Tesseract OCR: Not installed (needed for Phase 7 OCR). Download from: https://github.com/UB-Mannheim/tesseract/wiki" -ForegroundColor DarkGray
}

$libreoffice = Get-Command soffice -ErrorAction SilentlyContinue
if ($libreoffice) {
    Write-Host "  LibreOffice: Found ($($libreoffice.Source))" -ForegroundColor Green
} else {
    Write-Host "  LibreOffice: Not installed (needed for Phase 6 Office conversion). Download from: https://www.libreoffice.org" -ForegroundColor DarkGray
}

Write-Host "`n==========================================" -ForegroundColor Cyan
Write-Host "Setup Complete! Start the app using:" -ForegroundColor Green
Write-Host "  .\scripts\start.ps1" -ForegroundColor White
Write-Host "==========================================" -ForegroundColor Cyan
