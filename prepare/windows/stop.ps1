$ErrorActionPreference = "SilentlyContinue"

Write-Host "Stopping Panshi Admin..."

# 停止 9000 端口（后端 + 前端页面）
$conn = Get-NetTCPConnection -LocalPort 9000 -ErrorAction SilentlyContinue
if ($conn -and $conn.OwningProcess -gt 0) {
    Stop-Process -Id $conn.OwningProcess -Force
    Write-Host "Stopped port 9000 (PID: $($conn.OwningProcess))"
}

Start-Sleep -Seconds 1

Write-Host "Panshi Admin stopped."
