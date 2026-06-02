## Context

磐石 Admin 项目在 `product/` 下已有 Linux 和 Windows 的部署脚本，macOS 目录为空。macOS 与 Linux 同为 Unix 系但存在若干关键差异：
- 端口监听检查工具：macOS 无 `ss`/`netstat`，需使用 `lsof`
- `sed -i` 命令：macOS 需要空备份扩展名参数 `sed -i ''`
- `venv --copies`：macOS 上 `cp -rL` 拷贝的 standalone Python 创建 venv 时，`.venv/bin/python3` 的 `@rpath` 指向 `libpython3.11.dylib`，但 venv 不会自动拷贝该 dylib，导致 SIGABRT

## Goals / Non-Goals

**Goals:**
- 提供 macOS 平台的离线部署全套脚本（生成、启动、停止）
- 脚本在 macOS ARM64（Apple Silicon）上可正常工作
- 生成的部署包结构与 Linux/Windows 一致，便于运维人员理解

**Non-Goals:**
- 不修改现有 Linux/Windows 脚本
- 不修改后端或前端代码
- 不处理 macOS Intel 平台的兼容性（只保证 ARM64）

## Decisions

### Decision 1: 沿用 Linux 的 standalone Python + .venv 架构

**Choice**: 沿用 Linux 的部署准备方式——通过 `uv python install 3.11` 下载 standalone Python，拷贝到 `panshi/backend/python/`，再用 `--copies` 创建 `.venv`。

**Rationale**: 保持跨平台部署体验一致，运维人员无需理解多种部署模式。

### Decision 2: macOS `venv --copies` 采用分步创建策略

**Choice**: 创建 venv 时加 `--without-pip` 跳过 ensurepip，然后手动拷贝 `libpython3.11.dylib` 到 `.venv/lib/`，再运行 `ensurepip` 安装 pip。

**Rationale**: `venv --copies` 会拷贝 python 二进制，但其 `@rpath` 仍指向 `libpython3.11.dylib`，在 `.venv/lib/` 中找不到该 dylib 时直接 SIGABRT。这是 macOS 上拷贝式 Python 安装的已知问题。

**Alternative considered**: 使用 `install_name_tool` 修改 `@rpath`。更复杂且需要管理员权限，不采用。

### Decision 3: 端口检查使用 `lsof -iTCP -sTCP:LISTEN`

**Choice**: 使用 `lsof -iTCP -sTCP:LISTEN -P -n` 替代 Linux 的 `ss`/`netstat`。

**Rationale**: macOS 默认不安装 `ss` 和 `netstat`，但 `lsof` 是标配。`-iTCP -sTCP:LISTEN` 精确过滤监听中的 TCP 端口。

## Risks / Trade-offs

- **Risk**: `libpython3.11.dylib` 拷贝到 `.venv/lib/` 是临时方案，如果 uv 后续更新 Python 布局，路径可能变化。**Mitigation**: 在 gen-mac.sh 中使用通配符匹配 dylib 名称而非硬编码版本号
- **Trade-off**: `--without-pip` + 手动 `ensurepip` 比单步 `venv --copies` 多一个步骤，但避免了 SIGABRT 崩溃

## Migration Plan

1. 在开发机上运行 `bash product/mac/gen-mac.sh` 生成部署包
2. 将 `product/mac/panshi/` 拷贝到目标 macOS 机器
3. 在目标机器上运行 `bash start.sh` 启动服务
4. 运行 `bash stop.sh` 停止服务

## Open Questions

- 无
