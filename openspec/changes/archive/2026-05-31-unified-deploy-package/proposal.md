## Why

`product/linux/gen-linux.sh` 生成的离线部署包散落在项目各目录（`backend/python/`、`backend/.venv/`、`frontend/dist/` 等），用户无法区分哪些是部署必需文件，只能拷贝整个项目。同时部署后的边缘节点操作因缺少 `backend/ansible/` 目录而报错。

## What Changes

1. **输出目录统一** — `gen-linux.sh` 将所有部署产物生成到 `product/linux/panshi/`，用户只需拷贝这一个目录
2. **新增 `backend/ansible/` 拷贝** — 确保边缘节点启停、统计等 Ansible 操作正常
3. **脚本 POSIX 兼容** — 消除 `&>/dev/null` 等 bash-ism，使脚本在 `sh` 下也能正确运行
4. **可迁移部署** — `editable install` 的 `.pth` 文件改为相对路径，部署目录可放在目标机器任意位置
5. **同步修改** — `.gitignore` 更新，`start.sh`/`stop.sh` 的路径引用修正

## Capabilities

### New Capabilities
- `unified-deploy-output`: 生成自包含的离线部署包到 `product/linux/panshi/`，结构清晰、即拷即用

### Modified Capabilities
- (无现有 spec 被修改)

## Impact

- `product/linux/gen-linux.sh` — 核心修改，输出目录和内容变更
- `product/linux/start.sh` — 修正 `&>` 为 POSIX 兼容语法
- `product/linux/stop.sh` — 修正 `&>` 为 POSIX 兼容语法
- `.gitignore` — 忽略路径从 `product/panshi/` 改为 `product/linux/panshi/`
