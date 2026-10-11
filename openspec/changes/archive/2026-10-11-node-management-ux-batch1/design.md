# Design: node-management-ux-batch1

## Context

评审报告（des-2）18 条全部核码成立。关键事实：
- 后端节点删除端点对 `delete_edge` **固定 skipped**（`cluster_nodes.py:331-333` 单个 / `:369-373` 批量，消息「节点是 Edge 运行时，无对应的 Edge API 删除操作」），且 400 守卫要求至少勾一项（`:311-312`）——现有共享弹窗的「Edge 节点」勾选对节点是安慰剂。
- Node 模型无 name 列（`models/cluster.py:112-128`），`nodes.py:17` `ALLOWED_SEARCH_FIELDS = {"ip","name"}` 经 `hasattr` 过滤后实际只搜 IP。
- 批量导入预览表对 `edge_path`/`openresty_path` 填固定默认值（`/edge`、`/usr/local/nginx`），但行校验不查 openresty_path 空（spec `node-copy-batch-import` Preview 场景）。

## Decisions

### D1 节点删除确认落共享层，新增节点变体（方案 A，用户已拍板）
`useClusterUtils` 新增节点删除确认（如 `showNodeDeleteConfirm`，或在 `showDeleteConfirm` 内加资源分支）：
- 无勾选项；标题「删除节点 {ip}」；正文三层后果（① 平台管理记录将被删除，不可恢复，如需恢复须重新添加节点 ② 节点机上的 Edge/OpenResty 进程不受影响，将继续运行（脱离平台监控）③ 该节点将从下次发布与中继网关白名单中移除）+ 提示「如需先停止流量，请先执行『⏹ 停止』操作」；确认按钮危险色。
- 渲染复用现有 AppModal 形态（`.app-modal`，与 `showDeleteConfirm` 同款），禁止再造第三份手写 overlay。
- **两入口统一**：NodeList（替换自建 `showConfirm` 硬编码）与 Tab `useClusterNodes.deleteNode`（替换安慰剂勾选版 `showDeleteConfirm`）都走它。

### D2 删除 API 语义不变
前端固定传 `{delete_db: true, delete_edge: false}`；后端端点零改动（skipped 分支保留，不拆）。进度统一走 `executeDeleteWithProgress`（批量/单条模式按现有签名）。

### D3 命令预览去硬编码
- Node 页 fallback 命令串改相对路径：`ansible-playbook -i inventory -e @env/extravars -e '{ev}' --tags {tag} edge.yml`（对齐 `useClusterNodes.ts` buildCommandString 形态）。
- SSH 腿去 `jboss@`/`~/.ssh/id_rsa`：展示 `ssh -p {ssh_port 占位 22} {ip}` 最小通用形态（不再虚构账号与密钥）。
- 服务端 `data.command` 优先逻辑（NodeList.vue:785 回退）保留不动。

### D4 SSE 结构化事件：展示层过滤，转发语义不动
`useInstallStream` 的 `onLine(JSON.stringify(data))` 转发**保留**（业务层依赖 onLine 判定 complete），过滤发生在**消费侧**：NodeList（及其余视图若有同款展示）的 onLine 回调中，对「能被 JSON.parse 且含 type 字段」的行不入 `execLogs` 展示（业务分支照常处理）。改动面最小、不碰共享转发契约。

### D5 NodeExecutionResultDrawer 加 mode prop，向后兼容
`mode?: 'install' | 'action' | 'auto'`，默认 `'auto'`（保持 `title.startsWith('安装')` 现行为，其他调用方零破坏）。NodeList 三处流式调用（关联新OpenResty / 添加版本包 / 切换版本）显式传 `mode="action"`；安装类调用显式传 `mode="install"`。组件内摘要模板按 mode 分流。

### D6 后端搜索字段清理
`ALLOWED_SEARCH_FIELDS` 移除 `"name"`（行为与现状等价——`hasattr` 本就过滤掉它——但消除误导性声明）。测试钉住 `?search=` 只按 IP 过滤。

## Known Non-Goals（本批不做）

- 状态三态（未检测 neutral）/ 刷新按钮 / 最近检测时间 / 详情弹窗归属标注 / 假排序移除 / 确认弹窗收敛 useOverlayModal / 假进度改不确定态 —— 批 2。
- 批量/导入/复制/列配置上提独立页、`buildInstallCommand`/`handleCancelInstall` 收敛 —— 批 3。
- 后端删除端点 delete_edge skipped 语义变更（真清理方案 B）—— 未立项。
