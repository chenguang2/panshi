$ErrorActionPreference = "Stop"

$ScriptDir = $PSScriptRoot
if (-not $ScriptDir) { $ScriptDir = Get-Location }
$ProjectRoot = (Resolve-Path (Join-Path $ScriptDir "..\..")).Path

Write-Host "=========================================="
Write-Host "  部署准备脚本 (Windows)"
Write-Host "  项目根目录: $ProjectRoot"
Write-Host "=========================================="

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
if (Test-Path $targetPythonDir) { Remove-Item $targetPythonDir -Recurse -Force }
Copy-Item $pythonDir $targetPythonDir -Recurse
Write-Host "  已拷贝到: $targetPythonDir"

# ---------- 2. 创建 .venv ----------
Write-Host ""
Write-Host "[2/4] 创建虚拟环境..."
$venvDir = Join-Path $ProjectRoot "backend\.venv"
if (Test-Path $venvDir) { Remove-Item $venvDir -Recurse -Force }
$pythonExe = Join-Path $targetPythonDir "python.exe"
& $pythonExe -m venv $venvDir
Write-Host "  .venv 已创建"

# ---------- 3. 安装后端依赖 ----------
Write-Host ""
Write-Host "[3/4] 安装后端依赖..."
$pip = Join-Path $ProjectRoot "backend\.venv\Scripts\pip.exe"
& $pip install -e "$ProjectRoot\backend"
Write-Host "  后端依赖安装完成"

# ---------- 4. 构建前端 ----------
Write-Host ""
Write-Host "[4/4] 构建前端..."
Set-Location "$ProjectRoot\frontend"
npm install
npm run build:deploy
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
