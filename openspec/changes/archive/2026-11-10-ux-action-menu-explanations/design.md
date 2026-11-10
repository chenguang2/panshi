# Design: ux-action-menu-explanations

## Context

RelayGateways.vue 已有 `menu-item-stack`（页内 scoped 样式）：`a-menu-item` 内 `<div class="menu-item-stack"><span>主文案</span><small>解释</small></div>`，解释可含动态状态与前置条件。全站 13 处 a-dropdown，仅中继两处有解释。用户确认分级采纳（2026-11-10 讨论）。

## Decisions

- **D1 分级规则（入 spec，作为今后新增菜单项的判据）**：满足任一 → 加解释——① 命名不自明（四个安装动作、漂移检测类）；② 后果重且点击前不可见（取消杀进程链、删除配置、发布推 Edge）；③ 有前置条件或禁用态（删除被挂接网关、非终态不可重试）。三者皆否（高频 + 自明）→ SHALL NOT 加。
- **D2 共享样式单点**：全局样式定义 `.menu-item-stack`（`frontend/src/styles/` 全局层，含 span 主行 + small 次行的字体/颜色/行高），RelayGateways 删除页内 scoped 定义改用全局类，**文案与 DOM 结构零变化**（其测试应继续全绿）。不组件化——包一层组件会改变 a-menu click 事件 label 载荷（`onCardMenuClick` 等 key 分发不受影响，但 @click 直挂的 item 与 slot 结构有隐性耦合），样式类是最小改动。
- **D3 文案原则**：写「何时需要 / 前置条件 / 后果边界」，≤18 字，禁同义反复（「编辑=修改信息」不合格）；动态 busy 态放主行（「取消中…」），解释行保持静态。
- **D4 动态标题项豁免**：NodeList「动作配置」生成的菜单项（`unselectedSharedActions`，标题由管理员自定义）不加解释——标题语义由配置者负责。
- **D5 删除类文案以真实弹窗为准**：UpstreamList / RouteList 删除经 `executeDeleteWithProgress`（范围可选），实施时对照真实弹窗选项写「删平台库 / Edge 已发布配置（弹窗内选择）」口径，避免文案与行为漂移。

## D6 逐菜单分级清单（实施基线，用户已确认分级方向）

### 加解释（P0/P1）

| 菜单 | 项 | 解释文案（草案，实施时对照真实行为校准） |
|---|---|---|
| NodeList 行菜单 | 安装 OpenResty | 在本机安装/重装 OpenResty（幂等可重复） |
| | 安装 Edge | 部署 Edge 到节点 edge_path（有危险确认） |
| | 关联新OpenResty | 把本机 Edge 切换关联到新装的 OpenResty |
| | 升级Edge小版本 | 打包管理：上传/选择小版本包升级，站点配置保留 |
| ClusterNodes「安装 ▾」 | 同上四项 | 同 NodeList 文案（同源流程） |
| NodeTaskCenter ⋯ | 取消 | 杀掉执行中的进程链；已开始节点记「已取消」，未开始记「跳过」 |
| | 重试 | 只重跑失败节点；上次日志按次数归档保留 |
| | 删除 | 删任务记录与脚本留档，不影响节点上已执行结果 |
| NodeTaskDetail ⋯ | 删除任务 | 同上 |
| UserList ⋯ | 删除 | 删除账号并吊销其登录态；审计记录保留 |
| UpstreamList ⋯ | 版本管理 | 历史版本查看与回滚 |
| | 删除 | 删平台配置并可同步删 Edge 已发布配置（弹窗内选择范围） |
| RouteList ⋯ | 版本管理 / 删除 | 同上口径（路由删除范围=平台库 + Edge 已发布配置） |
| RelayTopologyCard 分发边动作框 | 与表格菜单同源动作 | 与 RelayGateways 对应项同文案 |

### 不加（SHALL NOT，防倒退）

- NodeList：详情；动作配置生成的动态标题项
- UpstreamList / RouteList：编辑、复制（路由）
- ClusterList / CentralList 卡片「更多 ▾」：备份下载、导出 Excel
- DefaultLayout 用户菜单：修改密码、退出登录
- NodeTaskCenter / NodeTaskDetail：取消、重试、删除三类已全含，无剩余项

### RelayGateways

既有解释与 DOM 零变化，仅样式定义迁全局（回归其既有测试）。

## Risks / Trade-offs

- 菜单高度增加：仅限被加项（每项 +18px 左右），自明项不加对冲了总体膨胀。
- 文案漂移风险：解释与确认弹窗/帮助 hint 三处并存——D5 口径以行为为准，评审时逐项过。
- `small` 在 a-menu 深色/禁用态下的对比度：实施时目测验收（截图逐页过）。
