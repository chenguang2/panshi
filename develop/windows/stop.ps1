$ErrorActionPreference = "SilentlyContinue"

Write-Host "Stopping Panshi Admin..."

# Stop by port 9000
$conn = Get-NetTCPConnection -LocalPort 9000 -ErrorAction SilentlyContinue
if ($conn) {
    $procId = $conn.OwningProcess
    if ($procId -gt 0) {
        Stop-Process -Id $procId -Force
        Write-Host "Stopped port 9000 (PID: $procId)"
    }
}

# Stop by port 9100
$conn = Get-NetTCPConnection -LocalPort 9100 -ErrorAction SilentlyContinue
if ($conn) {
    $procId = $conn.OwningProcess
    if ($procId -gt 0) {
        Stop-Process -Id $procId -Force
        Write-Host "Stopped port 9100 (PID: $procId)"
    }
}

Start-Sleep -Seconds 1

Write-Host "Panshi Admin stopped."