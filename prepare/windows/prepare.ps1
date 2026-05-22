$ErrorActionPreference = "Stop"

$ScriptDir = $PSScriptRoot
if (-not $ScriptDir) { $ScriptDir = Get-Location }
$ProjectRoot = (Resolve-Path (Join-Path $ScriptDir "..\..")).Path

Write-Host "=========================================="
Write-Host "  部署准备脚本 (Windows)"
Write-Host "  项目根目录: $ProjectRoot"
Write-Host "=========================================="

# ---------- 停止已有进程（释放 .venv 文件锁）----------
Write-Host ""
Write-Host "[检查] 停止运行中的服务..."
try {
    $conn = Get-NetTCPConnection -LocalPort 9000 -ErrorAction SilentlyContinue
    if ($conn -and $conn.OwningProcess -gt 0) {
        Stop-Process -Id $conn.OwningProcess -Force
        Write-Host "  已停止端口 9000 的进程 (PID: $($conn.OwningProcess))"
        Start-Sleep -Seconds 2
    } else {
        Write-Host "  端口 9000 无占用"
    }
} catch { Write-Host "  无法检查端口状态，继续..." }

# ---------- 前置检查 ----------
Write-Host ""
Write-Host "[检查] uv 是否安装..."
try { $null = Get-Command uv -ErrorAction Stop }
catch { Write-Error "请先安装 uv → https://docs.astral.sh/uv/"; exit 1 }

Write-Host "[检查] npm 是否安装..."
try { $null = Get-Command npm -ErrorAction Stop }
catch { Write-Error "请先安装 Node.js/npm"; exit 1 }

# ---------- 1. 下载 standalone Python 3.11 ----------
Write-Host ""
Write-Host "[1/4] 准备 Python 3.11 解释器..."
uv python install 3.11
$pythonPath = uv python find 3.11
if (-not $pythonPath) { Write-Error "无法找到 Python 3.11"; exit 1 }
Write-Host "  源路径: $pythonPath"

# 拷贝 Python 整个目录到 backend\python\
$pythonDir = Split-Path -Parent $pythonPath
$targetPythonDir = Join-Path $ProjectRoot "backend\python"
$targetPythonExe = Join-Path $targetPythonDir "python.exe"
if (Test-Path $targetPythonExe) {
    Write-Host "  Python 解释器已存在，跳过拷贝"
} else {
    if (Test-Path $targetPythonDir) {
        Write-Host "  删除旧的 Python 目录..."
        # 先用 cmd /c rmdir 尝试（绕过 PowerShell 文件枚举锁）
        & cmd /c "rmdir /s /q `"$targetPythonDir`" 2>nul"
        Start-Sleep -Milliseconds 200
        # 如果没删干净再用 Remove-Item 补刀
        if (Test-Path $targetPythonDir) {
            Remove-Item $targetPythonDir -Recurse -Force -ErrorAction SilentlyContinue
            Start-Sleep -Milliseconds 200
        }
    }
    if (Test-Path $targetPythonDir) {
        Write-Warning "  无法完全删除旧目录，尝试强制覆盖..."
    }
    Copy-Item $pythonDir $targetPythonDir -Recurse
    # 确保权限可读
    & cmd /c "icacls `"$targetPythonDir`" /grant Everyone:R /T /Q 2>nul"
    Write-Host "  已拷贝到: $targetPythonDir"
}

# ---------- 2. 创建 .venv ----------
Write-Host ""
Write-Host "[2/4] 创建虚拟环境..."
$venvDir = Join-Path $ProjectRoot "backend\.venv"
$pipExe = Join-Path $venvDir "Scripts\pip.exe"
$pythonExe = Join-Path $targetPythonDir "python.exe"

if (-not (Test-Path $pythonExe)) { Write-Error "找不到 Python 解释器: $pythonExe"; exit 1 }

# 如果 .venv 已存在且 pip 可用，跳过重建
if ((Test-Path $pipExe) -and ((& $pipExe --version 2>$null) -match "pip")) {
    Write-Host "  虚拟环境已存在，跳过重建"
} else {
    if (Test-Path $venvDir) {
        Write-Host "  重命名旧虚拟环境..."
        $oldVenv = Join-Path $ProjectRoot "backend\.venv_old_$(Get-Date -Format 'yyyyMMddHHmmss')"
        Rename-Item $venvDir $oldVenv -ErrorAction SilentlyContinue
        Start-Sleep -Milliseconds 200
    }
    if (Test-Path $venvDir) {
        Write-Warning "  旧虚拟环境无法重命名，将创建到临时目录..."
        $venvDir = Join-Path $ProjectRoot "backend\.venv_prepare"
    }
    & $pythonExe -m venv $venvDir
    if ($LASTEXITCODE -ne 0) { Write-Error "创建虚拟环境失败"; exit 1 }
    Write-Host "  .venv 已创建 ($venvDir)"
}

# ---------- 3. 安装后端依赖 ----------
Write-Host ""
Write-Host "[3/4] 安装后端依赖..."
# standalone Python 内置了固定路径，设 PYTHONHOME 强制指向拷贝后的 Python
$env:PYTHONHOME = $targetPythonDir
$pip = Join-Path $venvDir "Scripts\pip.exe"
& $pip install -e "$ProjectRoot\backend"
Remove-Item Env:PYTHONHOME -ErrorAction SilentlyContinue
Write-Host "  后端依赖安装完成"

# ---------- 4. 构建前端 ----------
Write-Host ""
Write-Host "[4/4] 构建前端..."
Set-Location "$ProjectRoot\frontend"
npm install
npm run build
Write-Host "  前端构建完成 → frontend\dist\"

# ---------- 完成 ----------
Write-Host ""
Write-Host "=========================================="
Write-Host "  准备完成！"
Write-Host "=========================================="
Write-Host ""
Write-Host "部署步骤："
Write-Host "  1. 将整个项目目录拷贝到目标 Windows 机器"
Write-Host "     (可以排除 node_modules，仅部署需要)"
Write-Host "  2. 在目标机器上运行启动脚本:"
Write-Host "     .\prepare\windows\start.ps1"
Write-Host ""
Write-Host "目标机器不需要安装 uv、npm、Python、Node.js"
Write-Host "目标机器不需要公网访问"
