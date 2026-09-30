# 设计：备份多目标（多位置扇出与独立页面）

## Context

现状（db-backup-source-tag 合入后）：`ps_db_backup_config` 单行承载全部配置（目标连接 + 全局策略 + 来源标识 + 调度状态），`_perform_backup_locked` 构建一次包推送到唯一目标，`cleanup_retention` 按 retain_count 清理，历史表一维记录。恢复向导 step1 手输远端目标。UI 位于数据库管理页内（DbBackupCard.vue 831 行 + 向导 824 行，宿主页面 1474 行）。

界面基线：`/tmp/opencode/db-backup-multi-target-mockup.html`（三屏：配置卡片/编辑抽屉/向导 step1；实现按独立页面口径微调——顶部加页面级标题区，摘要卡形态为屏 1 的变体）。

## Goals

- 一机可配置多个备份位置，按位置独立启停与保留份数
- 部分失败语义明确（三态），历史可追溯每目标结果
- 恢复向导可直接选已配置位置（含聚合视图），手输兜底保留
- 备份职能独立成页 + 数据库管理页留摘要入口，权限键独立

## Non-Goals

- 按目标差异化内容段/频率（用户确认不需要：包与调度保持一致性）
- 并行推送（串行已满足目标量级；并行化留待有真实需求再立项）
- 跨目标一致性校验（不比较同一包在不同位置的 SHA256）
- 目标级告警通知/报表

## Decisions

### D1 配置两层模型

- `DbBackupConfig`（全局单行，保留既有列不删）：`enabled`、`interval_minutes`、`source_name`、`include_static/include_task_scripts/include_task_logs`、调度状态列（`last_run_at/last_success_at/last_status/last_error/last_attempt_at`）、`updated_at`。旧目标列（host/port/username/...）**保留不删**（作 D7 迁移源 + 避免 DROP COLUMN 方言差异），代码不再读写。
- 新表 `DbBackupTarget`：`id`、`name`（唯一，展示用标识——用于下拉与历史快照，**不进文件名与 shell 命令**，文件名安全由来源标识正则单独负责；校验：非空、≤64 字符、不含 `/ \ : * ? " < > |` 与控制字符、首尾无空白，**允许中文**如「局内DR」）、`host`、`port`、`username`、`auth_type`、`password_encrypted`（Fernet，沿用）、`key_path`、`remote_dir`、`retain_count`（≥1）、`enabled`、`created_at/updated_at`。
- 目标数量不设硬上限（软性引导 ≤5）；名称重复校验拒绝。

### D2 差异化粒度：仅保留份数

内容段/频率/来源标识全局。理由：包构建一次与目标数无关（构建开销与包内容不随目标数变化）；来源标识是机器身份，与目的地无关；差异化只落在 `retain_count`（局内短保留快恢复、中心长保留防勒索）。

### D3 扇出执行模型

`_perform_backup_locked` 改为：解析来源标识（沿用）→ **构建一次包**（本地临时）→ 对每个**启用**目标按序执行「mkdir -p → .part 上传 → 原子改名 → 该目标自己的 retain_count 保留清理」→ 单目标失败记录子结果后**继续下一目标**（不中断）。互斥（备份/恢复共用）覆盖整个扇出过程，防调度重叠。远端命令 `shlex.quote`、SSHPASS 环境变量、审计脱敏等既有安全语义逐目标沿用。调度节奏沿用现状代码语义：**按上次运行时间计时**（anchor=`last_run_at`，成败均计）；`last_success_at` 仅全绿更新，作「距上次完整成功」展示指标。位置 CRUD 不与备份互斥（最坏效果为本次运行多/少推一个位置，无数据风险，不处理）。

### D4 三态与历史

- 新表 `DbBackupHistoryTarget`：`id`、`history_id`（FK → 历史主表）、`target_id`（**不设 FK 强制**——目标删除后悬挂无妨，展示走名称快照）、`target_name`（快照，删除目标不级联）、`status`（success/failed——**启用目标才有子结果，且仅推送阶段产生**）、`error`、`duration_ms`。
- 主记录 `status` 三态：全部启用目标成功 = `success`；部分成功 = `partial`；全部失败 = `failed`；无启用目标或**构建阶段失败** = 整体 `failed`、无子结果行（见调度）。`error` 汇总为逐目标错误拼接。
- `last_success_at` **仅全绿（success）更新**；`last_status` 反映三态。
- 历史列表 UI：主记录状态徽章（partial 黄）+ `N/M 目标` mono 小注，展开行显示每目标子结果（✓绿/✗红，含失败原因与耗时）。

### D5 恢复向导来源选择

- step1 单选卡片：「从已配置位置选择」/「手动输入」（换机空配置场景语义保留）。
- 位置下拉列出**全部**已配置目标（含停用，停用标注——恢复是应急场景，停用位置可能仍要救急）+ 顶部「全部位置」项。
- 「全部位置」聚合语义：逐启用+停用可达目标列包，**按包名去重合并**（同一包名存在于多位置时行上标注位置列表，meta/size 取任一——同一包名即同一机器同一秒产物）；**某目标不可达时标注该位置失败，不阻断整体列表**。
- 手动输入形态与现状一致（host/port/user/auth/dir）。
- `POST /restore/list` 参数扩展：`target_id`（int，可选）或既有手输参数组；二选一校验。

### D6 页面与权限

- 新路由 `/backup-management`，页面 `views/BackupManagement.vue`（根元素不设 padding，对齐数据库管理页样式派系——memory #99）；菜单入**系统管理**分类、数据库管理旁；`navMeta` 注册标题与拼音（搜索索引）。
- 数据库管理页原备份卡位置换**摘要卡**：四格状态统计（沿用现统计条）+ 最近一次结果（含 partial 黄与 N/M 小注）+「进入备份管理」与「灾难恢复」（直达新页向导）双入口；无任何配置时显示引导文案；**摘要卡渲染挂 `db_backup` 前端权限（无权限整卡不渲染，避免 403 噪音）**。
- 权限键独立 `db_backup`：后端 `require_permission("db_backup")` 全端点切换（替换 `database_management`）；前端权限 keys 注册（系统管理分类）+ 菜单可见性挂 `db_backup`；`tests/test_security_guard.py` UNAUTHENTICATED_SAMPLES 补新端点采样（新增目标 CRUD/test 端点）。rule #19 双端注册。

### D7 数据迁移（幂等）

`ensure_targets_migrated()`：全局行 `targets_migrated` 标志为假 **且** 旧目标字段（host）非空 → 创建一条「默认位置」目标（复制 host/port/username/auth_type/password_encrypted/key_path/remote_dir/retain_count，enabled=True，name=`default`），随后置位标志并提交。挂载点：应用 lifespan 启动时 + `GET /config` 首读兜底（双保险）。**并发幂等靠 name 唯一约束兜底**（并发插入冲突时回滚重查）。标志列防「用户删光位置后重启 → 默认位置复活」。`targets_migrated` 为既有表新增布尔列，**必须登记 COLUMN_MIGRATIONS**（memory #118）。DR 恢复落位携带 targets 行且标志随包为真，迁移天然不触发。

### D8 来源标识解析方向

多目标下「出口 IP」探测方向取**第一个启用目标**（无启用目标时跳过目标方向，直接 hostname → 兜底）。解析仍是一次性并持久化（source-tag D1 语义不变），粘滞后与目标顺序变化无关。

### D9 API 面

| 端点 | 变化 |
|---|---|
| `GET /db-backup/config` | 响应 = 全局字段 + `targets: [...]`（密码不回显） |
| `PUT /db-backup/config` | 仅全局字段（目标字段从此端点移除，兼容忽略） |
| `POST /db-backup/targets` / `PUT .../{id}` / `DELETE .../{id}` | 目标 CRUD（name 唯一校验、密码留空=不修改） |
| `POST /db-backup/targets/test` | 按载荷目标参数测连（可先于保存） |
| `POST /db-backup/run` | 不变形；服务端扇出；响应含每目标子结果 |
| `GET /db-backup/history` | 记录增 `status`(三态) 与 `targets` 子结果数组 |
| `POST /db-backup/restore/list` | 增 `target_id` 可选参数；`all=true` 语义由前端「全部位置」传特殊值或后端聚合端点处理（实现取：`target_id` 缺省且无手输参数 = 聚合全部） |

审计：目标 CRUD 写操作审计（ROUTE_MAP 增对应条目，删路由时手工清理——rule #37）。

### D10 UI 基线

以 `/tmp/opencode/db-backup-multi-target-mockup.html` 为视觉/交互基线（配置分层、470px 编辑抽屉、单选卡片向导、partial 黄 + N/M 小注、内联测连反馈）。独立页面口径微调：页面级标题区（h1「备份与容灾」）；摘要卡为屏 1 统计条 + 最近结果的精简变体。中文内联文案；模板多语句 handler 一律提取 script 函数（rule #25）。**来源标识在多目标 UI 保持可编辑**（清空重存重解析语义沿用 source-tag；mockup 的只读处理仅设计稿视角，实现覆盖）。保留份数字段 hint 注明「时间跨度 ≈ 份数 × 间隔」帮运维配参。

## Risks

- **推送时长 ×N**：串行 SSH 扇出拉长单次备份时长；互斥防重叠 + interval ≥1 分钟兜底。目标数软性 ≤5 引导。
- **凭据 ×N 安全面**：多份 Fernet 密文多份风险敞口；审计脱敏与不回显语义逐目标沿用。
- **权限切换摩擦**：已授 `database_management` 的非 admin 用户失去备份入口，需重新授权 `db_backup`——发布说明标注（用户已知悉）。
- **聚合列包性能**：「全部位置」对每目标做一次 SSH 列表（目标量级小，可接受）；单目标不可达降级标注不阻断。
- **删除目标搁浅远端包**：目标删除不清理其远端目录（与改来源标识同款搁浅语义），表单删除确认文案与设计文档标注。
- **保留窗口时间跨度认知**：跨度 = 份数 × 间隔（如 5 分钟 × 30 份 = 2.5 小时）；连续 partial 不改变健康位置的滚动节奏（与全绿一致，per-location 隔离生效）——运维配参需按时间目标反推份数，UI hint 与设计文档明示。
- **恢复继承位置的可达性**：恢复包的 targets 随库落位，新机未必可达；恢复完成提示附带位置核对提醒（specs 落位与激活需求）。
- **旧配置回滚**：回滚到旧版本代码后 targets 表被忽略、旧列仍在（迁移未删列）→ 旧代码可继续按单目标跑（host 列未被清除）。**前提：迁移不回写/清空旧列**——D7 遵守。

## Migration Plan

1. 后端合入（新表 + 幂等迁移 + API 扩展）——旧库启动自动迁移，零手工。
2. 前端合入（新页 + 菜单/权限 + 改造组件）——同仓同发，无灰度需求。
3. 发布说明：非 admin 用户需授权 `db_backup`；「全部位置」聚合语义说明。
4. 回滚：恢复旧列语义（见 Risks 末条），targets 数据留存无害。
