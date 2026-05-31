## Context

当前 `product/linux/gen-linux.sh` 在项目根目录下生成部署产物：
- `backend/python/` — standalone Python
- `backend/.venv/` — 虚拟环境
- `frontend/dist/` — 前端构建产物
- `backend/data/` — 运行时数据库（空目录）

用户需要手动辨别哪些文件是部署必需的，体验差且容易遗漏。`gen-linux.sh` 使用 `&>/dev/null` 等 bash-ism，在 `sh`（dash）下运行异常。

## Goals / Non-Goals

**Goals:**
- 所有部署产物统一输出到 `product/linux/panshi/`
- 包含运行所需全部内容（含 `backend/ansible/`）
- 部署目录可迁移到目标机器任意路径
- 脚本 POSIX 兼容，`sh gen-linux.sh` 也能正常工作

**Non-Goals:**
- 不改动应用代码（`backend/app/` 内的 Python 源码不修改）
- 不改动部署启动逻辑（start.sh/stop.sh 功能不变）
- 不改动开发环境启动脚本

## Decisions

1. **输出目录定位** — 使用 `$SCRIPT_DIR/panshi`（相对于脚本自身），而非 `$PROJECT_ROOT/product/linux/panshi`。这样 gen-linux.sh 移至其他位置时输出路径自动跟随。
2. **Editable install + 相对路径 .pth** — 保留 `pip install -e` 确保 `main.py` 中 `__file__` 路径解析正确（前端静态文件托管），安装后用 Python 计算相对路径重写 `.pth` 文件，使部署目录可迁移。
3. **拷贝 ansible 目录** — 不依赖 `PANSHI_ANSIBLE_DIR` 环境变量覆盖，直接拷贝 `backend/ansible/` 到部署包，开箱即用。
4. **POSIX 兼容** — 将 `&>/dev/null` 替换为 `>/dev/null 2>&1`，`#!/bin/bash` shebang 保留，用户也可用 `bash` 运行。

## Risks / Trade-offs

- **[部署包体积增大]** `backend/ansible/` 包含 playbook 和 roles，会增加部署包体积 → 接受，这是运行必需文件
- **[相对路径 .pth 依赖 Python]** 修正 .pth 时需要 standalone Python 执行路径计算 → 在 gen-linux.sh 中该 Python 已经就绪，无额外依赖
