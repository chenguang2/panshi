$ErrorActionPreference = "Stop"

$BACKEND_PORT = 12344
$FRONTEND_PORT = 12345

# Determine project root
$ScriptDir = $PSScriptRoot
if (-not $ScriptDir) {
    $ScriptDir = Get-Location
}
$ProjectRoot = (Resolve-Path (Join-Path $ScriptDir "..\..")).Path

Write-Host "Starting Panshi Admin..."
Write-Host "Project root: $ProjectRoot"

# 1. Ensure npm is in PATH (find from common locations if not available)
$npmCmd = "npm"
try {
    $null = Get-Command npm -ErrorAction Stop
} catch {
    $possibleNodePaths = @(
        "${env:ProgramFiles}\nodejs",
        "${env:ProgramFiles(x86)}\nodejs",
        "$env:LocalAppData\Programs\nodejs"
    )
    foreach ($path in $possibleNodePaths) {
        $npmExe = Join-Path $path "npm.exe"
        if (Test-Path $npmExe) {
            $env:Path = "$path;$env:Path"
            $npmCmd = $npmExe
            break
        }
    }
}

# 2. Ensure uv is in PATH
$uvCmd = "uv"
try {
    $null = Get-Command uv -ErrorAction Stop
} catch {
    $possibleUvPaths = @(
        "$env:APPDATA\Python\Python313\Scripts",
        "$env:LOCALAPPDATA\Programs\Python\Python313\Scripts",
        "$env:USERPROFILE\AppData\Roaming\Python\Python313\Scripts",
        "$env:USERPROFILE\.local\bin"
    )
    foreach ($path in $possibleUvPaths) {
        $uvExe = Join-Path $path "uv.exe"
        if (Test-Path $uvExe) {
            $env:Path = "$path;$env:Path"
            $uvCmd = $uvExe
            break
        }
    }
}

# 3. Ensure Python 3.11+ is available (project requires >=3.11)
Write-Host "Checking Python 3.11..."
$python311Path = & $uvCmd python find 3.11
if (-not $python311Path) {
    Write-Host "Installing Python 3.11..."
    & $uvCmd python install 3.11
    $python311Path = & $uvCmd python find 3.11
}
Write-Host "Using Python: $python311Path"

# 4. Create data directory
$DataDir = Join-Path $ProjectRoot "backend\data"
if (-not (Test-Path $DataDir)) {
    New-Item -ItemType Directory -Path $DataDir -Force | Out-Null
}

# 5. Stop processes on ports
$conn = Get-NetTCPConnection -LocalPort $BACKEND_PORT -ErrorAction SilentlyContinue
if ($conn) {
    Stop-Process -Id $conn.OwningProcess -Force -ErrorAction SilentlyContinue
}

$conn = Get-NetTCPConnection -LocalPort $FRONTEND_PORT -ErrorAction SilentlyContinue
if ($conn) {
    Stop-Process -Id $conn.OwningProcess -Force -ErrorAction SilentlyContinue
}

Start-Sleep -Seconds 2

# 6. Start backend with uv run and explicit Python 3.11
Write-Host "Starting Backend..."
$backendDir = Join-Path $ProjectRoot "backend"
$uvArgs = "run --python `"$python311Path`" uvicorn app.main:app --host 127.0.0.1 --port $BACKEND_PORT"
Start-Process -FilePath $uvCmd -ArgumentList $uvArgs -WorkingDirectory $backendDir -PassThru -WindowStyle Hidden

Start-Sleep -Seconds 5

# 7. Start frontend
Write-Host "Starting Frontend..."
$frontendDir = Join-Path $ProjectRoot "frontend"
Start-Process -FilePath "cmd.exe" -ArgumentList "/c npm run dev -- --port $FRONTEND_PORT" -WorkingDirectory $frontendDir -PassThru -WindowStyle Hidden

Start-Sleep -Seconds 5

# 8. Verify
$backendListening = Get-NetTCPConnection -LocalPort $BACKEND_PORT -State Listen -ErrorAction SilentlyContinue
$frontendListening = Get-NetTCPConnection -LocalPort $FRONTEND_PORT -State Listen -ErrorAction SilentlyContinue

if ($backendListening -and $frontendListening) {
    Write-Host ""
    Write-Host "Panshi Admin started!"
    Write-Host "Backend: http://localhost:$BACKEND_PORT"
    Write-Host "Frontend: http://localhost:$FRONTEND_PORT"
    Write-Host "Login: admin / panshi123"
} else {
    if (-not $backendListening) {
        Write-Host "Warning: Backend not listening on port $BACKEND_PORT"
    }
    if (-not $frontendListening) {
        Write-Host "Warning: Frontend not listening on port $FRONTEND_PORT"
    }
}