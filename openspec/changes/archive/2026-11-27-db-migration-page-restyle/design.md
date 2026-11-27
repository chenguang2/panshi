# Design

## 现状与目标

页面功能已由 `db-migration-ux-optimization`（c977ed01）交付，行为面不动；本轮是 proposal-c 控制台语言改版，设计基线 = `docs/ui/Live-Artifact-5/proposal-c/db-migration.html`（f80448cc）。差距清单（已逐项对照现状代码核实，2026-11-27）：

| # | 设计页 | 现状 | 改法 |
|---|---|---|---|
| 1 | 迁移任务卡 = `l5-card` + 卡头（标题/副注/刷新） | `.card` + `card-header` 仅刷新按钮 | 卡头补标题副注；解剖类进 style.css |
| 2 | 历史为独立 `l5-card` 卡 | 历史嵌在迁移卡内（history-header h4） | 拆 `DbMigrationHistoryCard.vue` |
| 3 | 历史表 grid-table + `#` 45px + 列宽 300/84/96/92/96/156/156 + 外置 ListPager | a-table 内置分页 + `max-content` + 无 # 列 | grid-table 解剖 + 数值 scroll.x=1025 + ListPager |
| 4 | 状态 pill（成功/失败） | `a-tag` green/red | `pill-run` / `pill-stop` |
| 5 | 进度 = mono 阶段徽标 + 自绘 `.bar` + meta + 右下断开按钮 | 两处实现：emoji（📦/🔄）+ a-progress 硬编码色 | 合并为同构 `mig-progress` 解剖 |
| 6 | 锁态只在状态带 lock 段 | 另有 `a-alert` 锁横幅 | 删横幅；恢复态无 progress 时骨架行兜底 |
| 7 | 结果条 success token（oklch 边/底） | `#f6ffed/#b7eb8f/#52c41a` 硬编码 | token 化，结构不变 |
| 8 | 状态带有「可用连接 N」段；warn/lock 段 token 色 | 缺可用连接段；warn 用 antd 黄硬编码 | StatusBand 补段 + token 化 + `lp-tag tech` |
| 9 | 弹窗警告/横幅 = `.alert` 主题族 | 四处 `a-alert` | 换 `.alert` 族；锁横幅直接删除 |
| 10 | 连接不足时超时下拉/勾选禁用（is-disabled 样张） | 仅发起按钮禁用 | 表单整体禁用 |
| 11 | 详情抽屉 = 四格 grid + 备份路径通栏 + 三组明细表 | `a-descriptions` + 三张 a-table | 手写 grid；a-table 挂 grid-table 类 |
| 12 | 卡头清理历史按钮 + ph-lite 计数 | history-header 内 h4 + count + cap-hint | 卡头化；cap-hint 保留 |

## 决策

- **D1 零行为边界**：SSE 事件消费与断连不取消、5s 轮询恢复、确认流（保守恒显清空警告）、清理预览/执行、历史状态映射（success/failed）、就地切换 + 重启指引、G8 前置与源预选、权限（`database_management`）与 `db_migration` 端点权限全部原样。后端零改动。
- **D2 历史拆卡**：新组件 `DbMigrationHistoryCard.vue` 自持历史加载 / 分页 / 清理弹窗 / 行展开 / 复制；`defineExpose({ refresh })`，宿主页在迁移完成后调用（替代现 `DbMigrationCard` 内部 `loadMigrationHistory` 调用链）。依据 #11「会话读取的原子单位」：两张独立卡 = 两个渲染单元，拆分后单文件规模健康、设计结构一一对应。既有历史数据流（`getMigrationHistory()` 全量拉取、客户端分页）不变。
- **D3 进度面板单点**：`mig-progress` 解剖一处定义（style.css），SSE 态与 API 恢复态共用同一模板结构（同一子模板，数据源不同）。恢复态 `progress == null`（interrupted 等）渲染骨架行：阶段徽标 + 「迁移进行中，等待进度上报…」提示，不渲染假进度条——现状此场景只有 a-alert 横幅，删横幅后必须补这个兜底，否则恢复态无任何页面内信息。
- **D4 a-alert 清退范围**：本页四处 a-alert —— ① 锁横幅删除（D3 兜底 + 状态带 lock 段承载）；② 确认弹窗警告 → `.alert .alert-error`（StrokeIcon warning）；③ 清理弹窗警示 → 预览附注小字（文字保全：仅影响当前活动库历史、不影响业务数据/审计日志/备份文件 + 执行中记录不删）；④ 重启指引横幅 → `.alert.alert-warning`（同 AnsibleInventory/EdgeImport 先例）。全局 `MigrationLockBanner`（App.vue，503 事件驱动）不在本页范围，不动。
- **D5 历史表静态列宽**：设计页 thead 虽画 `resizable`，但实现侧除三大列表页（节点/上游/路由）外均不接列宽拖拽（连接表先例，database-management-page-restyle 已裁决）；本表从众，不接 `useColumnDragColumns`。
- **D6 列宽与滚动口径**：设计页 colgroup 合计 1025 但 `min-width:1070px`，自相矛盾；实现取 `:scroll="{ x: 1025 }"`（列宽和，r6 口径「最小总宽数值」），设计页 min-width 在收口段改为 1025 对齐（tasks 7.1）。
- **D7 cap-hint 保留**：后端 `GET /database/history` 固定 `LIMIT 100`，删除超量历史后列表与库内总数可能不一致；「仅显示最近 100 条」是必要披露，设计页未画 → 实现保留（置于条数徽标旁），设计页补注记（tasks 7.1）。
- **D8 `.mig-*` 类落点**：卡头/进度面板/结果条等解剖类进 `style.css` 单一来源（`dbm-*` 先例；卡头被迁移卡与历史卡两个组件共享）。组件 scoped 只留页面私有覆盖。
- **D9 语义类复用**：状态胶囊用全站 `pill pill-run/pill-stop`、技术标签 `lp-tag tech`、弱化文本 `c-dim`、mono `c-mono`、计数 `ph-lite`——均为 style.css 既有类，零新增重复定义。

## 测试与守卫

- `mockupParity.source.test.ts` 增「数据迁移」段：l5-card + mig-cardhead 标题/副注、历史独立卡 + ListPager、禁 `max-content`、禁历史表 a-tag、进度 mono 徽标（禁 emoji）、禁本页 a-alert、StatusBand 可用连接段。
- 断言反转：`StatusBand.test.ts`（可用连接段 / lp-tag tech）、`DbMigrationCard.test.ts`（卡头 / 进度徽标 / 结果条 / 抽屉 / 确认弹窗 alert 族；历史用例迁往新组件测试）、`DbMigrationPage.test.ts`（横幅形态 / refresh 接线）。
- 新增 `DbMigrationHistoryCard.test.ts`（解剖 + 外置分页 + 清理弹窗 + 行展开）。
- `pageHeaderActions.source.test.ts` PAGES 清单加 `['DbMigrationPage.vue', 'db-migration.html']`（双侧皆无页头动作/徽标的守卫基线）。

## 风险

- 历史拆卡后「迁移完成 → 历史刷新」联动经 expose 调用，漏接线会造成「迁完历史不出现」——用 DbMigrationPage.test 断言接线。
- a-table 挂 `grid-table` + `table-layout fixed` 需要全列显式宽度（含 `#`），漏宽列会被余量均分（#79 教训）。
- `.alert` 族是全局类（theme 借 style.css 语义），本页横幅在 `.db-migration-page` 容器内使用时确认无父级样式冲突（AnsibleInventory 先例带页面级修饰类）。
