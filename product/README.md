# 磐石 Gateway 离线部署包打包指南

在开发机上生成**离线部署包**：后端源码 + 内嵌 Python 解释器 + 全量依赖 + 前端构建产物 + 启停脚本，产出目录可整体拷贝到无公网的目标机运行。

## 1. 前置条件

| 依赖 | 用途 | 说明 |
|---|---|---|
| uv | 下载 standalone Python 3.11、依赖安装/锁定 | [安装指南](https://docs.astral.sh/uv/) |
| npm + Node | 前端构建（`npm run build`） | |
| 公网访问 | Python 依赖走国内镜像（aliyun）、npm 走 npmmirror | Python 依赖可离线（见 §5.3），npm 仍需网络 |
| 可选：Tongsuo openssl | 国密证书本地生成 | 放 `product/linux/tongsuo/bin/openssl`，缺失仅告警跳过 |

## 2. 快速开始

| 平台 | 命令 | 产物 |
|---|---|---|
| Linux | `bash product/linux/gen-linux.sh` | `product/linux/panshi/` |
| macOS | `bash product/mac/gen-mac.sh` | `product/mac/panshi/` |
| Windows | PowerShell 执行 `product/windows/gen-window.ps1` | `product/windows/panshi/` |

### 我该跑什么？（场景对号）

> 一句话：**日常打包不需要手动跑任何工具脚本**——三个脚本已被接进流程或按需备用。

| 场景 | 怎么做 |
|---|---|
| **A · 日常打包**（99% 的情况） | `bash product/linux/gen-linux.sh` —— 什么都不用改，依赖自动走 aliyun 镜像 + uv 加速 |
| **B · 换镜像**（aliyun 也不可用时） | `./product/tools/switch-pypi-mirror.sh https://mirrors.cloud.tencent.com/pypi/simple`，换源后照常打包。平时不用跑（aliyun 已配置生效） |
| **C · 完全离线**（打包机断网 / 镜像全被限流） | ① 有网时跑一次：`./product/tools/vendor-wheels.sh`（全量包落盘 `product/wheels/`）<br>② 之后每次打包：`WHEELS_DIR=<repo>/product/wheels bash product/linux/gen-linux.sh`，全程不联网<br>注意：`backend/pyproject.toml` 改过依赖后须重跑 ①，否则离线装的是旧包 |

`install-backend-deps.sh` **无需手动执行**——它是 gen 脚本第 4 步内部调用的安装器，单独运行仅用于排查依赖问题。

三方案对应关系：**短期换源 = B，中期 uv 加速 = A（已自动生效），长期离线 = C**。

以 Linux/macOS 版为例，脚本按序执行（Windows 版同构，额外会先停占用 `.venv` 的进程释放文件锁）：

| 步骤 | 做什么 |
|---|---|
| [0/5] | 清理并创建输出目录结构 |
| [1/5] | 拷贝后端源码（剔除 `__pycache__` 等开发工件） |
| [2/5] | `uv python install 3.11` 取 standalone 解释器，实体拷入产物 |
| [3/5] | `python -m venv --copies` 创建文件副本式 venv（非符号链接） |
| [3.5/5] | 检测构建机 glibc；< 2.28（CentOS 7 等）自动把 greenlet 降级到 2.x |
| [4/5] | 安装后端依赖 —— 统一入口 `product/tools/install-backend-deps.sh`（见 §5） |
| [4.6/5] | 安装 Ansible collections（三级回退，见 §6） |
| [4.5/5] | 把 editable install 的 `.pth` 修正为**相对路径** |
| [4.5.1/5] | 把 venv 内脚本 shebang 改为 `#!/usr/bin/env python3` |
| [5/5] | 前端 `npm install`（npmmirror 镜像）+ `npm run build`，dist 拷入产物 |
| [5.5/5] | 拷贝 Tongsuo openssl（存在时） |
| [6/6] | 拷贝启停脚本 |

> `.pth` 相对路径 + shebang 修正意味着**产物目录可迁移**：目标机放任意路径都能跑，不依赖构建机绝对路径。

## 3. 产物结构

```
product/<平台>/panshi/
  backend/
    app/ …            # 后端源码
    .venv/            # 全量依赖（文件副本）
    python/           # standalone Python 3.11（内嵌解释器）
    ansible/          # 剧本 / collections / 清单
    bin/openssl       # Tongsuo（可选，国密用）
  frontend/dist/      # 前端构建产物
  启停脚本 …          # 目标机启停入口
```

## 4. 目标机部署（麒麟 / 凝思等）

国产 OS 的部署说明见各自目录：`product/kylin/setup.md`、`product/ningshi/setup.md`。

## 5. 依赖网络与镜像

Python 依赖默认走 **aliyun 镜像**（2026-10-03 实测清华 tuna 对本机出口渐进式 403，索引与包均拒）。三个工具脚本位于 `product/tools/`：

### 5.1 短期：换镜像

```bash
./product/tools/switch-pypi-mirror.sh [镜像URL]   # 缺省 aliyun
```

一键把三个打包脚本里硬编码的 `-i <镜像>` 换成目标源，幂等可重复执行。当前三处均已为 aliyun。

### 5.2 中期：统一安装入口（已接线）

`gen-linux.sh` 第 4 步已改调 `product/tools/install-backend-deps.sh`：

- PATH 上有 uv → `uv pip install`（缓存激进，重复打包明显提速）；
- 无 uv → 退化 `pip install`（与旧流程等价）；
- 镜像可用 `PIP_INDEX_URL` 环境变量覆盖。

### 5.3 长期：完全离线

```bash
./product/tools/vendor-wheels.sh                 # 一次性：锁定 + 全量 wheel 落盘（→ product/wheels/，54 构件 / 33M）
WHEELS_DIR=<repo>/product/wheels bash product/linux/gen-linux.sh   # 之后每次：全程不联网装依赖
```

- 锁定清单随落盘生成（`product/wheels/requirements.lock.txt`，uv 按当前 `backend/pyproject.toml` 解析）；
- **平台绑定**：本机（x86_64 Linux）落盘只能喂 gen-linux；mac / windows 离线需在对应平台各跑一次 vendor；
- `backend/pyproject.toml` 依赖变更后**必须重跑 vendor**，否则离线装到的是旧依赖集；
- 注意：npm 前端构建仍需网络（npmmirror）。

> **环境变量提醒**：本机 shell 的 `UV_INDEX_URL` 若指向 tuna，任何无显式 index 的 uv 调用（如 `uv venv --seed`）都会撞 403——工具脚本已在进程内覆盖，建议顺手把 shell 配置也换成 aliyun。

## 6. Ansible collections 安装（三级回退）

1. **本地 tarball**（首选）：`backend/ansible/collections/ansible-utils-6.0.2.tar.gz` 存在则直接安装；
2. galaxy 在线：`ansible-galaxy collection install -r requirements.yml`；
3. wget 直下 tarball 兜底；全部失败时脚本会提示手动下载后放置路径。

## 7. 常见问题

| 现象 | 原因与处理 |
|---|---|
| 下载依赖报 `HTTP 403`（tuna） | 镜像限流拉黑了出口 IP。换 aliyun（§5.1）或离线打包（§5.3） |
| `uv venv`/seed 阶段 403 | shell 环境的 `UV_INDEX_URL` 指向 tuna，改掉或跑 §5.3 离线方案 |
| 目标机是 CentOS 7 等旧系统 | 脚本已自动检测 glibc<2.28 并降级 greenlet，无需手工干预 |
| collections 安装警告 | 按 §6 放置本地 tarball 后重跑 |
| Windows 打包报文件被占用 | 脚本会自动停进程；仍失败时手动结束占用 `.venv` 的 python 进程 |
| 离线打包后依赖报缺包 | `pyproject.toml` 改过但未重跑 `vendor-wheels.sh` |
