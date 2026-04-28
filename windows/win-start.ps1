$ErrorActionPreference = "Stop"

# Determine project root (parent of windows folder)
$ScriptDir = $PSScriptRoot
if (-not $ScriptDir) {
    $ScriptDir = Get-Location
}
$ProjectRoot = "D:\data0\test-03"

Write-Host "Starting Panshi Admin..."
Write-Host "Project root: $ProjectRoot"

# 1. Add npm to PATH
$env:Path = "D:\Program Files\nodejs;$env:Path"

# 2. Add uv to PATH  
$env:Path = "C:\Users\28814\AppData\Roaming\Python\Python313\Scripts;$env:Path"

# 3. Create data directory
$DataDir = "$ProjectRoot\backend\data"
if (-not (Test-Path $DataDir)) {
    New-Item -ItemType Directory -Path $DataDir -Force | Out-Null
}

# 4. Stop processes on ports
$conn = Get-NetTCPConnection -LocalPort 9000 -ErrorAction SilentlyContinue
if ($conn) {
    Stop-Process -Id $conn.OwningProcess -Force -ErrorAction SilentlyContinue
}

$conn = Get-NetTCPConnection -LocalPort 9100 -ErrorAction SilentlyContinue
if ($conn) {
    Stop-Process -Id $conn.OwningProcess -Force -ErrorAction SilentlyContinue
}

Start-Sleep -Seconds 2

# 5. Start backend
Write-Host "Starting Backend..."
Start-Process -FilePath "uv" -ArgumentList "run","uvicorn","app.main:app","--reload","--port","9000" -WorkingDirectory "$ProjectRoot\backend" -PassThru -WindowStyle Hidden

Start-Sleep -Seconds 3

# 6. Start frontend
Write-Host "Starting Frontend..."
Start-Process -FilePath "cmd.exe" -ArgumentList "/c npm run dev" -WorkingDirectory "$ProjectRoot\frontend" -PassThru -WindowStyle Hidden

Start-Sleep -Seconds 5

# 7. Verify
$listening = Get-NetTCPConnection -LocalPort 9100 -State Listen -ErrorAction SilentlyContinue
if ($listening) {
    Write-Host ""
    Write-Host "Panshi Admin started!"
    Write-Host "Backend: http://localhost:9000"
    Write-Host "Frontend: http://localhost:9100"
    Write-Host "Login: admin / panshi123"
} else {
    Write-Host "Warning: Frontend may not have started"
}