$ErrorActionPreference = "SilentlyContinue"

$BACKEND_PORT = 12344
$FRONTEND_PORT = 12345

Write-Host "Stopping Panshi Admin..."

# 端口兜底停止（带进程名双重确认）
# 逐 PID 校验：一个端口可能有多条连接/多个 OwningProcess（如 reloader + worker），
# 数组直接拼进 WQL 查询会解析失败导致守卫失效、kill 永不执行
foreach ($PORT in @($BACKEND_PORT, $FRONTEND_PORT)) {
    $conns = @(Get-NetTCPConnection -LocalPort $PORT -ErrorAction SilentlyContinue)
    $procIds = @($conns | ForEach-Object { $_.OwningProcess } | Sort-Object -Unique | Where-Object { $_ -gt 0 })
    foreach ($procId in $procIds) {
        $proc = Get-CimInstance -Query "SELECT * FROM Win32_Process WHERE ProcessId = $procId" -ErrorAction SilentlyContinue
        if ($proc -and $proc.CommandLine -match "app\.main:app|npm|vite") {
            Stop-Process -Id $procId -Force
            Write-Host "Stopped port $PORT (PID: $procId)"
        }
    }
}

Start-Sleep -Seconds 1

Write-Host "Panshi Admin stopped."