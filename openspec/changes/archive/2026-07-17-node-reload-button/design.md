## Context

后端已支持 reload：`POST /clusters/{cluster_id}/nodes/{node_id}/restart` → `nginx_cmd: nginx_reload`。前端 NodeList.vue 和 ClusterNodes.vue 的操作栏缺少 reload 按钮，详情按钮占用了操作栏空间。

## Goals / Non-Goals

**Goals:**
- 操作栏新增 reload 按钮，位于启动/停止之后
- 后端新增 `/reload` 路由，复用 `/restart` 的 `nginx_reload` 逻辑
- 详情按钮移入更多菜单，放在编辑上方

**Non-Goals:**
- 不修改 `nginx_cmd` 映射或 `_nginx_extravars`
- 不修改数据库模型

## Decisions

### 1. 后端 `/restart` 路由改名为 `/reload`
- `POST /{cluster_id}/nodes/{node_id}/restart` → `POST /{cluster_id}/nodes/{node_id}/reload`
- 内部逻辑不变，仍执行 `nginx_cmd: nginx_reload`
- 前端统一使用 `/reload`

### 2. reload 按钮复用已有 executeAction 模式
- 后端 API 返回格式与 start/stop 一致（`{ status, rc, stdout, stderr }`）
- 前端 `handleReload` 复用 `executeAction(record, 'reload', 'reload')`，与 `handleStart`/`handleStop` 完全对称

### 2. 按钮布局调整（NodeList.vue）
- 操作栏：`▶ 启动 | ⏹ 停止 | ⟳ reload | ✓ 状态 | ⋯`
- 更多菜单：`ⓘ 详情 | 编辑 | 删除 | 数据库对比 | ...`

### 3. ClusterNodes.vue 调整
- ClusterNodes.vue 没有行内操作栏和详情按钮，仅在操作栏按钮组中"⏹ 停止"和"状态查询"之间新增"⟳ reload"按钮
- 不需要移动详情按钮（ClusterNodes 详情功能通过表格行点击或其他方式触发）
