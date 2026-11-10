# Proposal: ux-action-menu-explanations

## Why

中继区域管理的「更多」菜单已带逐项解释（`menu-item-stack` 两行式：主文案 + 常驻 small 说明），实测价值三类：前置条件透明（删除项写「已被 N 个集群挂接，先解挂再删除」）、后果边界（「初始化网关：首次装机必做，幂等可重复」）、动态状态（「初始化中…」）。其余 12 处弹出菜单均无解释——最不自明的 NodeList 四个安装动作（安装 OpenResty / 安装 Edge / 关联新OpenResty / 升级Edge小版本）、任务菜单的取消/重试、各类删除项，用户点击前对后果与前置条件零预期。用户决策（2026-11-10 讨论）：**推广中继模式，但分级采纳，不做全站一刀切**——高频自明项（编辑/复制/详情/导出）加解释是负收益（菜单行高翻倍、扫视效率下降、文案三处重复漂移）。

## What Changes

- **分级规则入 spec**（新增能力域 `action-menu-explanations`）：满足「命名不自明 / 后果重且不可见 / 有前置条件或禁用态」任一 → SHALL 常驻解释；高频自明项 SHALL NOT 加（防倒退）。
- **共享实现单点**：`.menu-item-stack` 样式从 RelayGateways 页内 scoped 提为全局样式（`frontend/src/styles/`），RelayGateways 迁移后文案与行为零变化。
- **P0 菜单（逐项加解释，文案见 design.md 清单）**：
  - NodeList 行菜单：四个安装动作 + 危险类配置动作（详情不加；动作配置生成的动态标题项不加）
  - clusters/ClusterNodes「安装 ▾」下拉：与 NodeList 同款四项、同款文案
  - NodeTaskCenter / NodeTaskDetail：取消 / 重试 / 删除任务
  - UserList：删除账号
  - UpstreamList / RouteList ⋯ 菜单：删除 + 版本管理（编辑/复制不加）
  - RelayTopologyCard 分发边动作框：与 RelayGateways 表格菜单同源动作对齐同款解释
- **不加（保持原样）**：ClusterList / CentralList 卡片「更多 ▾」（备份下载/导出 Excel 自明）、DefaultLayout 顶栏用户菜单、各菜单的编辑/复制/详情项。
- **验收**：逐页真实页面截图确认（#51：验收落在用户实际操作的页面，组件断言不能替代）。

## Capabilities

### New Capabilities

- `action-menu-explanations`：动作菜单分级解释规则 + 共享 `menu-item-stack` 实现单点。

## Impact

- 受影响代码：`frontend/src/styles/`（新增全局菜单栈样式）、`views/NodeList.vue`、`views/clusters/ClusterNodes.vue`、`views/NodeTaskCenter.vue`、`views/NodeTaskDetail.vue`、`views/UserList.vue`、`views/UpstreamList.vue`、`views/RouteList.vue`、`views/RelayGateways.vue`（迁移共享样式）、`components/RelayTopologyCard.vue`；相关测试文件同步
- 不涉及：后端、路由、依赖清单
- 风险：低——纯前端展示层；文案准确性以实施时逐项对照真实流程（确认弹窗/后端行为）为准
