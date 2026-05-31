$ErrorActionPreference = "SilentlyContinue"

$ScriptDir = $PSScriptRoot
if (-not $ScriptDir) { $ScriptDir = Get-Location }
$ProjectRoot = (Resolve-Path (Join-Path $ScriptDir "..\..")).Path

# 默认端口
$DEFAULT_PORT = 9000

# 端口获取优先级: 参数 > 环境变量 > 端口文件 > 默认值
$portFile = Join-Path $ProjectRoot "backend\.port"
$filePort = if (Test-Path $portFile) { Get-Content $portFile -Raw | ForEach-Object { $_.Trim() } } else { $null }
$PORT = if ($args[0]) { $args[0] } elseif ($env:PANSHI_PORT) { $env:PANSHI_PORT } elseif ($filePort) { $filePort } else { $DEFAULT_PORT }

Write-Host "Stopping Panshi Admin (port $PORT)..."

# 停止指定端口
$conn = Get-NetTCPConnection -LocalPort $PORT -ErrorAction SilentlyContinue
if ($conn -and $conn.OwningProcess -gt 0) {
    Stop-Process -Id $conn.OwningProcess -Force
    Write-Host "Stopped port $PORT (PID: $($conn.OwningProcess))"
}

# 清理端口文件
Remove-Item $portFile -ErrorAction SilentlyContinue

Start-Sleep -Seconds 1

Write-Host "Panshi Admin stopped."
