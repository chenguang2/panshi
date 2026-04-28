# Windows 启动指南

从 Mac 拷贝项目到 Windows 后，按以下步骤启动：

## 快速启动

```powershell
# 方法1: 双击运行
win-start.ps1

# 方法2: 命令行
powershell -ExecutionPolicy Bypass -File win-start.ps1
```

## 首次 setup（仅需执行一次）

```powershell
# 1. 安装 uv（如果不存在）
pip install uv -i https://pypi.tuna.tsinghua.edu.cn/simple --break-system-packages

# 2. 安装后端依赖
cd backend
uv sync --index-url https://pypi.tuna.tsinghua.edu.cn/simple

# 3. 安装前端依赖
cd ../frontend
npm install --registry https://registry.npmmirror.com

# 4. 运行单元测试
cd ../backend
pytest -v
```

## 启动服务

```powershell
# 启动
.\win-start.ps1

# 停止
.\win-stop.ps1
```

## 访问

- 前端：http://localhost:9100
- 后端：http://localhost:9000
- 账号：admin / panshi123

## 常见问题

### npm.ps1 被记事本打开
- 修复：使用 `cmd.exe /c npm` 而非直接 `npm`

### uv 命令找不到
- 修复：添加 `Python\Python313\Scripts` 到 PATH

### 端口被占用
- 运行 `win-stop.ps1` 停止服务后重试