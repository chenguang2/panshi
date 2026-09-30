## Why

数据库管理页（`DatabaseManagement.vue`，1632 行）内联了数据迁移整段 UI（进行中横幅、进度恢复、模式选择、SSE 进度、表格进度），约占页面体量 40-50%，页面文件已超出「会话读取原子单位」的合理体量（约定 #11）。迁移是重 IO 高危低频操作（迁移期间全局写锁、写请求 503），挤在连接注册表主视图中既稀释职责又限制护栏信息（前置检查、锁状态、历史记录）的展示空间。「SQLite 备份与容灾」独立页 + 摘要卡快捷入口的模式已验证可行，迁移按同款模式独立，让数据库管理回归「连接注册表 + 切换」单一职责。

## What Changes

- 新增独立页面「数据迁移」（`views/DbMigrationPage.vue` 或同名语义命名；系统管理分类、数据库管理旁），承载现有迁移全部能力：源/目标连接选择（含迁移模式流卡）、SSE 迁移进度（`/migrate-stream`）、迁移进行中状态恢复、历史记录、迁移期间全局写锁提示
- `DatabaseManagement.vue` 迁移段替换为**摘要卡**（对齐 `DbBackupSummaryCard` 模式）：当前 active 连接、最近一次迁移结果、迁移进行中状态（`running-tasks` 视为进行中）、「开始迁移」双入口之一；无连接注册表时的引导文案
- 迁移相关内联代码抽为独立组件（`DbMigrationCard.vue` 承载完整迁移 UI，页面壳引用），`DatabaseManagement.vue` 体量显著回落
- 权限：页面与摘要卡渲染沿用 `database_management` 权限键（迁移端点本就挂该键，不新增资源）；前端权限 keys、路由、菜单（系统管理分类）、navMeta 搜索注册同步
- e2e / 权限守卫采样 / 组件测试同步路径与结构变化

## Capabilities

### New Capabilities

- `db-migration-page`：数据迁移独立页面——页面结构、数据库管理摘要卡快捷入口、权限与可见性、迁移期间 UX 拦截（不新增/不移除任何后端迁移能力）

### Modified Capabilities

- 无：`sqlite-backup-restore` / `sqlite-remote-backup` / 数据库连接注册表相关 spec 的行为均不变（本次为纯前端结构与导航重构；后端迁移端点零改动）
