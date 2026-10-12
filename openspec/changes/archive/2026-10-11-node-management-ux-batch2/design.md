# Design: node-management-ux-batch2

## Context

批 1 已统一删除流与搜索口径；本批全部为前端改动，零后端。关键现状（2026-10-11 实测行号）：

- `nginxRunning()`（NodeList.vue:1144）无 `status_detail.nginx.nginx_running` 时回退 `status===1` → 从未检测的新节点假绿「运行中」
- 状态列 :69-75 两条 v-if 非互斥：status=0 节点同时渲染「已禁用」（badge-danger 危险红）+「运行中/已停止」
- 详情弹窗 :263-264 同款二值徽章；:269 集群统计卡片无归属标注
- 列定义 :487-510 每列挂客户端 `sorter`（IP 用 `localeCompare` 字符串序，后端本已全量数值排序）
- 筛选 :25-26 选项「运行中/已停止」，:425 按 `nginxRunning()===wantRunning` 客户端过滤（spec 原文「status=1/0」是漂移）
- `confirmState`/`executeConfirm`（:325-338 模板、:471、:1102-1110）：`visible=false` 先于 `await` → 模板里的 loading 文案永不可见
- 假进度两模型：NodeList :710-718 `elapsed/200s×100` 钉 99%；useClusterNodes :117-136 每 2s +5 脉冲
- Tab 表单 :264-265（a-select）与批量导入 :390-391「正常/禁用」——违反「节点状态控件与措辞统一」需求的「启用/禁用」mandate
- `BadgeStatus.vue` 三态组件已存在（概览页在用，neutral=「未检测」先例），NodeList 未接入
- `utils/format.ts` 无相对时间助手；后端 `status_detail.last_execution` 由 ansible 执行写入（clusters.py:443、cluster_nodes.py:125）

## Decisions

### D1 三元运行态判定：`nginxState(node)` 取代 `nginxRunning(node)`

返回 `'running' | 'stopped' | 'unchecked'`：`status_detail.nginx.nginx_running === true` → running；`=== false` → stopped；**缺失（含节点无 status_detail）→ unchecked**。删除 `status===1` 假绿兜底。调用点：状态列、详情弹窗、状态筛选、刷新按钮无关。`nginxRunning` 全仓引用清零（列表过滤 :425 改 `nginxState(n)===want`）。

### D2 BadgeStatus 接入 + 已禁用中性化

运行态徽章换共享 `BadgeStatus`：running=`online`/运行中、stopped=`offline`/已停止、unchecked=`neutral`/未检测（概览页同款先例）。「已禁用」配置徽章改 `BadgeStatus neutral`——**不删除、不与运行态合并**（spec「两维度不得互相替代」承诺不变），只是从危险红降为中性灰（配置开关语义，非故障告警）。配色取 neutral 不取 warning：禁用是主动管理动作，warning 仍带告警暗示。**详情弹窗同步补配置态维度（评审 F4）**：详情「节点状态」区在运行态徽章旁补管理开关展示（启用/禁用），与列表双徽章对齐——否则节点被禁用时详情里看不到管理开关。

### D3 检测时效：`formatRelativeTime` 单点 + 徽章下弱化文字

`utils/format.ts` 新增 `formatRelativeTime(ts)`：`<1min`「刚刚」/ `N 分钟前` / `N 小时前` / `N 天前` / 更早回落 `formatDateOnly`；**差值为负（客户端时钟回拨/后端时钟漂移）钳为 0 →「刚刚」**。解析走既有 `parseBackendDate`（naive UTC 按 UTC 解析，#26 语义）。渲染：运行态徽章正下方 muted 12px「N 分钟前检测」；无 last_execution 时不渲染（unchecked 徽章本身即「未检测」语义）。

### D4 手动刷新按钮（两入口对齐）

NodeList 筛选栏右侧 `ReloadOutlined` +「刷新」→ `loadNodes()`；**Tab（ClusterNodes）同加「刷新」钮，直调局部 `loadNodes(cluster)`，不经 `emit('refresh')`**——CentralList :404 的 `@refresh="loadClusters"` 是 #203 禁用的全量刷新（重建 cluster 对象硬编码 `activeTab:'nodes'`，会踢回首签并卸载面板）；顺带删除 Tab 中从未被模板绑定的 `onRefresh` 死代码（:527/:588），消除误接地雷。检测时效随刷新自然更新。

### D5 状态筛选三态化 + spec 漂移修正

选项：全部状态/运行中/已停止/**未检测**。过滤按 `nginxState()`。主 spec「状态筛选」MODIFIED 顺带修正原文「status=1/0」漂移（实现从来都是运行态客户端过滤）。

### D6 假排序移除

columns 全部 `sorter:` 删除（IP 的 `localeCompare` 字符串序是错的，后端 `GET /nodes` 已全量数值 IP 排序；≤100 节点规模下当前页排序无价值且误导）。不做表头排序 UI 替代。

### D7 确认弹窗收敛 showOverlayModal + okLoading 扩展

动作类确认（启动/停止/reload/取消安装）改 `showOverlayModal`（#25 三层制：普通确认 → useOverlayModal）。删除 `confirmState`、`executeConfirm`、:325-338 手写模板。**评审修正（F2）**：useOverlayModal 现无 loading 机制（onOk 先 await 后 close，弹窗保持打开但按钮无反馈、有双击风险）——本批为其新增 `okLoading`：onOk 为 Promise 期间禁用确定钮并显示「处理中…」，完成/异常后恢复或关闭。这是共享层小扩展（全站通用弹窗受益），proposal Impact 相应纳入 `useOverlayModal.ts`。删除流不动（批 1 已走共享 AppModal 变体）。

### D8 进度不确定态：收敛到 Drawer 单点

`NodeExecutionResultDrawer` 的 `:progress` 增加不确定形态：`progress.indeterminate === true` 时渲染动画条 + 已耗时，不渲染百分比数字。**indeterminate 是起始形态而非硬模式（评审 F5）：一旦收到首个带 `percent` 的服务端事件即自动切换为真实百分比模式**——「取消安装」等可能发 percent 的流自动适配，无需按入口穷举分类。调用侧：

- NodeList 动作流（启动/停止/reload/状态查询/关联新OpenResty/添加版本包/切换版本/取消安装）：置 `indeterminate: true` 直到终态或首个 percent 事件；删除 elapsed/200s 假模型（:710-718 一带）
- NodeList 安装流：保留服务端真实百分比（`_stream_ansible_events` 的 percent 事件）
- Tab（useClusterNodes）：删除每 2s +5 脉冲（:117-136），动作流同款 indeterminate；安装流真实百分比

不确定态做在 Drawer 层（单点），两入口自动一致；终态 success/exception 照旧。

### D9 Tab 词汇对齐

ClusterNodes 表单 a-select 与批量导入 select：「正常/禁用」→「启用/禁用」。措辞需求已有「源码守卫测试钉死字面」机制，Tab 侧纳入守卫范围。

### D10 详情归属标注

集群统计卡片区块标题补「（集群级）」——计数是节点所在集群的统计，非节点自身资源数。不做移除（用户验收过该弹窗的信息量，标注是最小正确修复）。

## Risks / Trade-offs

- 三态化后存量从未检测的节点会从假绿「运行中」变为灰「未检测」——**语义正确但视觉变灰批量出现**；≤100 节点且用户已知该语义，实页验收确认
- **「停止成功 → 已禁用」组合语义（评审 F1，已确认接受）**：spec「节点操作」规定停止成功后 `node.status=0`，批 2 将其渲染为中性灰「已禁用」——用户点「停止」后刷新会看到「已禁用 + 已停止」并排，措辞有误导（是停止不是禁用）。根因是后端 `status` 字段复用「管理开关/停止结果」两个语义的**既有 spec 矛盾**，本批前端接受并明示；后端修正（停止不再写 status=0）另立项
- 假排序移除后表头不可排序——后端排序已全量有序，损失可忽略
- 确认弹窗换 useOverlayModal 后按钮文案/危险色需与原视觉一致（启动/停止确认保持危险色语义不变）

## Migration Plan

无数据迁移、无后端改动。单批前端落地 + 组件/页面测试 + 实页验收。

## Open Questions

无（五项用户决策 2026-10-11 已落定：≤100 节点、状态查询居首、方案 A、任意用户、OpenResty 必填）。
