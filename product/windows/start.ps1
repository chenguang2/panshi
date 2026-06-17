$ErrorActionPreference = "Stop"

# 默认端口（可在脚本中修改）
$DEFAULT_PORT = 12345

# 端口获取优先级: 参数 > 环境变量 > 默认值
$PORT = if ($args[0]) { $args[0] } elseif ($env:PANSHI_PORT) { $env:PANSHI_PORT } else { $DEFAULT_PORT }

$ScriptDir = $PSScriptRoot
if (-not $ScriptDir) { $ScriptDir = Get-Location }
$ProjectRoot = (Resolve-Path (Join-Path $ScriptDir "..\..")).Path

Write-Host "Starting Panshi Admin (deployment mode)..."

# ---------- 路径定义 ----------
$pythonExe = Join-Path $ProjectRoot "backend\.venv\Scripts\python.exe"
if (-not (Test-Path $pythonExe)) {
    Write-Error "错误: 未找到 Python 解释器 ($pythonExe)"
    Write-Error "请先在开发机上运行 prepare\windows\prepare.ps1"
    exit 1
}

$backendDir = Join-Path $ProjectRoot "backend"
$dataDir = Join-Path $ProjectRoot "backend\data"
$logFile = Join-Path $ProjectRoot "backend.log"
$errLogFile = Join-Path $ProjectRoot "backend-err.log"

# ---------- 创建数据目录 ----------
if (-not (Test-Path $dataDir)) {
    New-Item -ItemType Directory -Path $dataDir -Force | Out-Null
}

# ---------- 写入端口文件 ----------
$portFile = Join-Path $ProjectRoot "backend\.port"
Set-Content -Path $portFile -Value $PORT -NoNewline

# ---------- 停止已有进程 ----------
$conn = Get-NetTCPConnection -LocalPort $PORT -ErrorAction SilentlyContinue
if ($conn) { Stop-Process -Id $conn.OwningProcess -Force -ErrorAction SilentlyContinue }

Start-Sleep -Seconds 2

# ---------- 启动后端（自动托管前端 dist/ 静态文件）----------
Write-Host ""
Write-Host "Starting Backend (port $PORT)..."
$backendArgs = @("-m", "uvicorn", "app.main:app", "--host", "127.0.0.1", "--port", "$PORT")
$backendProc = Start-Process -FilePath $pythonExe -ArgumentList $backendArgs -WorkingDirectory $backendDir -PassThru -WindowStyle Hidden -RedirectStandardOutput $logFile -RedirectStandardError $errLogFile
Write-Host "  Backend started (PID: $($backendProc.Id))"

Start-Sleep -Seconds 5

# ---------- 验证 ----------
$listening = Get-NetTCPConnection -LocalPort $PORT -State Listen -ErrorAction SilentlyContinue

Write-Host ""
Write-Host "=========================================="
Write-Host "  Panshi Admin started!"
Write-Host "=========================================="
Write-Host "  URL:   http://localhost:$PORT"
Write-Host "  Login: admin / panshi123"
Write-Host "  Log:   $logFile"
Write-Host ""

if (-not $listening) {
    Write-Host "⚠  Warning: 可能未监听 $PORT 端口，请查看日志:"
    Write-Host "   Get-Content $logFile -Tail 30"
}
Write-Host ""
Write-Host "停止服务: .\prepare\windows\stop.ps1"
