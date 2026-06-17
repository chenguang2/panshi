$ErrorActionPreference = "SilentlyContinue"

$BACKEND_PORT = 12344
$FRONTEND_PORT = 12345

Write-Host "Stopping Panshi Admin..."

# 端口兜底停止（带进程名双重确认）
foreach ($PORT in @($BACKEND_PORT, $FRONTEND_PORT)) {
    $conn = Get-NetTCPConnection -LocalPort $PORT -ErrorAction SilentlyContinue
    if ($conn -and $conn.OwningProcess -gt 0) {
        $proc = Get-CimInstance -Query "SELECT * FROM Win32_Process WHERE ProcessId = $($conn.OwningProcess)" -ErrorAction SilentlyContinue
        if ($proc -and $proc.CommandLine -match "app\.main:app|npm|vite") {
            Stop-Process -Id $conn.OwningProcess -Force
            Write-Host "Stopped port $PORT (PID: $($conn.OwningProcess))"
        }
    }
}

Start-Sleep -Seconds 1

Write-Host "Panshi Admin stopped."