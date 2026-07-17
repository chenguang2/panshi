## Why

当前系统支持安装 OpenResty 和安装 Edge，但升级 Edge 功能缺失。用户安装新版本 OpenResty 后，无法将已有 Edge 实例绑定到新 OpenResty；也无法独立管理 Edge 小版本包（查看、添加、切换版本）。需要补齐这些能力，形成完整的 Edge 生命周期管理。

## What Changes

1. **关联新OpenResty** — 修改 `upgrade_openresty.yml`，支持将已有 Edge 实例绑定到新安装的 OpenResty，`manager upgrade` 内部自动处理升级和初始化
2. **小版本列表 (pack-list)** — 新增 endpoint 查询 Edge 实例当前可用的小版本包列表
3. **添加版本包 (pack-add)** — 新增 endpoint + 文件选择，从 soft/ 目录选择 edge-pack 文件，传输到远端并注册
4. **切换版本 (pack-rebase)** — 新增 endpoint 选择目标版本，执行 rebase 并 reload

## Capabilities

### New Capabilities
- `edge-pack-management`: Edge 小版本包管理（pack-list / pack-add / pack-rebase）

### Modified Capabilities
- `edge-node-lifecycle`: 新增"关联新OpenResty"操作（修改现有 `upgrade_openresty.yml`）

## Impact

- `backend/ansible/roles/edge/tasks/upgrade_openresty.yml` — 改用 `edge_target` 动态取值，支持自定义 Edge 目录名
- `backend/ansible/roles/edge/tasks/` — 新增 `edge_pack_list.yml`、`edge_pack_add.yml`、`edge_pack_rebase.yml`
- `backend/ansible/roles/edge/tasks/main.yml` — 新增 3 个 import_tasks
- `backend/app/api/v1/cluster_install.py` — 新增 4 个 endpoint + edge-pack-files 文件列表路由
- `frontend/src/views/NodeList.vue` — 新增菜单项"关联新OpenResty"和"升级Edge小版本"
- `frontend/src/views/clusters/ClusterNodes.vue` — 同上
