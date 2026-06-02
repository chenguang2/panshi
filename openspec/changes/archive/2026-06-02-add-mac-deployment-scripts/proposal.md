## Why

磐石 Admin 项目已支持 Linux（`product/linux/`）和 Windows（`product/windows/`）的离线部署脚本，但缺少 macOS 平台的部署能力。macOS 开发者或目标机器无法直接使用 Linux 脚本（`ss`/`netstat` 不可用、`sed -i` 行为不同、`venv --copies` 因 `@rpath` 问题崩溃）。需要在 `product/mac/` 下创建对应的部署准备、启动和停止脚本，使 macOS 也能顺利完成离线部署。

## What Changes

1. **新增 `product/mac/gen-mac.sh`** — macOS 部署准备脚本，用于下载 standalone Python、创建虚拟环境、安装依赖、构建前端，生成离线部署包到 `product/mac/panshi/`
2. **新增 `product/mac/start.sh`** — macOS 启动脚本，用 `lsof` 替代 `ss`/`netstat` 进行端口监听检查
3. **新增 `product/mac/stop.sh`** — macOS 停止脚本（与 Linux 版本一致，`lsof` 通用）
4. **修复 macOS 特有 Bug** — `venv --copies` 创建的 `.venv/bin/python3` 因 `@rpath/libpython3.11.dylib` 找不到而 SIGABRT，需手动拷贝 dylib 并用 `--without-pip` 分步创建

## Capabilities

### New Capabilities
- `mac-deployment`: macOS 平台的离线部署能力，包括部署准备（gen-mac.sh）、启动（start.sh）、停止（stop.sh）三个脚本

### Modified Capabilities

None — 不修改现有代码逻辑，仅新增 macOS 平台的部署脚本。

## Impact

- 新增 `product/mac/gen-mac.sh` — 部署准备脚本
- 新增 `product/mac/start.sh` — 部署启动脚本
- 新增 `product/mac/stop.sh` — 部署停止脚本
- macOS 旧版 `product/mac/` 目录原为空，无影响
