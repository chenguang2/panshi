# 磐石 Admin — 离线的便携部署方案

## 背景与问题

### 目标环境约束

| 约束条件 | 说明 |
|----------|------|
| 无公网 | 目标机器完全无法访问互联网 |
| 无 Docker | 不能使用容器化部署 |
| 无 root | 没有管理员权限，不能安装系统软件包 |
| 无 Python 3 | 系统可能只有 Python 2.7，无法运行项目 |
| 无 Node.js | 没有 JavaScript 运行时 |
| 拷贝安装 | 只能通过 U 盘/内网传输的方式拷贝项目目录 |

### 核心思路

**不是"一次打包到处跑"，而是"同平台内，拷贝即用"**

- 在**开发机**上（有网、有权限）分别准备好 Windows 和 Linux 两套环境
- 把**源码 + 已安装好的依赖**整个目录拷贝到同平台的目标机器
- 直接运行启动脚本，目标机器不需要执行任何安装操作

### 关键技术点

| 问题 | 解决方案 |
|------|----------|
| Python 解释器不存在 | 用 `uv python install` 下载 standalone Python，打包进项目目录 |
| `.venv/` 跨平台失效 | `.venv` 包含平台二进制，必须在每类平台分别创建 |
| `.venv/bin/python` 是符号链接 | 用 `--copies` 参数创建 venv，确保是独立文件副本 |
| `node_modules/` 含原生编译产物 | 前端不走 `npm run dev`，改为预构建 `dist/` + Python 内置 http.server 托管 |
| 不需要 npm run dev | FastAPI 可 mount 静态文件，或 deploy 脚本直接用 Python 起 http.server |

---

## 目录结构说明

```
project-root/
├── backend/
│   ├── app/                   # 源码
│   ├── python/                # 【prepare 生成】standalone Python 3.11 解释器
│   ├── .venv/                 # 【prepare 生成】Python 虚拟环境（含所有依赖）
│   ├── pyproject.toml
│   └── uv.lock
│
├── frontend/
│   ├── src/                   # 源码
│   ├── dist/                  # 【prepare 生成】npm run build 构建产物
│   ├── node_modules/          # 【prepare 需要】构建时依赖，部署时可排除
│   └── package.json
│
├── develop/                   # 【开发启动脚本】依赖本机安装的 uv + npm
│   ├── linux/
│   │   ├── start.sh           # 对应原 linux/start.sh
│   │   └── stop.sh            # 对应原 linux/stop.sh
│   └── windows/
│       ├── start.ps1          # 对应原 windows/win-start.ps1
│       └── stop.ps1           # 对应原 windows/win-stop.ps1
│
├── prepare/                   # 【部署启动脚本】零依赖，拷贝即用
│   ├── linux/
│   │   ├── prepare.sh         # 【开发机】准备 Python 环境 + 构建前端
│   │   ├── start.sh           # 【目标机】启动服务（用 .venv 内的 Python）
│   │   └── stop.sh            # 【目标机】停止服务
│   └── windows/
│       ├── prepare.ps1        # 【开发机】准备 Python 环境 + 构建前端
│       ├── start.ps1          # 【目标机】启动服务
│       └── stop.ps1           # 【目标机】停止服务
│
├── linux/                     # （保留，同 develop/linux/）
├── windows/                   # （保留，同 develop/windows/）
└── docs/
    └── deploy-portable-guide.md  # 本文档
```

---

## 使用流程

### 第一步：在开发机上准备环境（每种平台做一次）

#### Linux 开发机

```bash
# 要求：有公网，已安装 uv + npm
bash prepare/linux/prepare.sh
```

执行过程：
1. `uv python install 3.11` — 下载 standalone Python
2. 将 standalone Python 拷贝到 `backend/python/`
3. 用该 Python 创建 `.venv`（`--copies` 确保文件副本）
4. `pip install -e backend/` — 安装所有 Python 依赖
5. `cd frontend && npm install && npm run build` — 构建前端为静态文件

#### Windows 开发机

```powershell
# 要求：有公网，已安装 uv + npm
.\prepare\windows\prepare.ps1
```

执行过程同上（Windows 版）。

### 第二步：打包并拷贝到目标机器

```bash
# 排除不需要的目录
# 必须保留:
#   - backend/.venv/
#   - backend/python/
#   - backend/app/
#   - frontend/dist/
#   - prepare/

# 可以排除:
#   - frontend/node_modules/       # 部署不需要
#   - backend/.venv/.gitignore     # 保留即可
#   - linux/develop/backup/        # 按需

# 示例：tar 打包（Linux → Linux）
tar czf panshi-admin-deploy.tar.gz \
    --exclude='frontend/node_modules' \
    --exclude='.git' \
    --exclude='__pycache__' \
    -C /path/to/project .
```

### 第三步：在目标机器上启动

#### Linux 目标机

```bash
# 解压后执行
bash prepare/linux/start.sh
```

#### Windows 目标机

```powershell
# 解压后执行
.\prepare\windows\start.ps1
```

启动脚本做的事情：
1. 直接用 `backend/.venv/bin/python3`（或 `python.exe`）启动 uvicorn
2. 用同一个 Python 启动 `http.server` 托管 `frontend/dist/` 静态文件
3. 不从 `npm` 或 `uv` 启动任何东西 — 完全自包含

---

## 两种模式对比

| 维度 | develop/（开发模式） | prepare/（部署模式） |
|------|---------------------|---------------------|
| 目标 | 开发调试，快速迭代 | 离线部署，稳定运行 |
| 依赖 | 本机需装 `uv` + `npm` | 零依赖 |
| 前端 | `npm run dev`（热更新） | Python `http.server` 托管 `dist/` |
| 后端 | `uv run uvicorn --reload` | `.venv/bin/python -m uvicorn` |
| 重启 | 改代码自动热重载 | 需手动重启 |
| 离线 | ❌ 不支持 | ✅ 完全离线 |
| 适用 | 日常开发 | 客户现场部署 |

---

## 常见问题

### Q: `backend/.venv/` 可以跨 Linux 不同发行版用吗？

同架构（x86_64）的 Linux 发行版一般可以。standalone Python 是静态链接的，不依赖系统 libpython。但如果目标机器的 glibc 版本比开发机的**更老**，可能会有兼容问题。建议在相同或更老的 OS 上准备。

### Q: 为什么前端不用 nginx 托管？

因为目标机器没有 root 权限，没法装 nginx。Python 内置的 `http.server` 足够开发/演示场景。生产环境建议用 Docker 方案（见 `docker-compose.yml`）。

### Q: 每次更新代码后需要重新跑 prepare 吗？

- 如果只改了后端 Python 代码：不需要重新 prepare，拷贝 `backend/app/` 即可
- 如果改了后端依赖（`pyproject.toml`）：需要重新跑 `pip install -e backend/`
- 如果改了前端代码：需要重新跑 `npm run build`
- 如果 Python 版本没变：`backend/python/` 不需要重新拷贝

### Q: 目标机器是 32 位怎么办？

开发机也要用 32 位的 Python。`uv python install` 默认下载当前系统架构，所以开发机和目标机架构必须一致。

### Q: 能同时在同一个项目目录里维护 Windows 和 Linux 两套环境吗？

可以。`.venv` 和 `python/` 是按平台分别生成的，只要目录结构一致就能共存。
