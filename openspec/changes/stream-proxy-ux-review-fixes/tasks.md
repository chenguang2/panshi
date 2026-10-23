# Tasks: stream-proxy-ux-review-fixes

## 批 1 · checks 保真（P0-1，TDD 先行）

- [x] 1.1 RED→GREEN：`StreamProxyFormWizard.test.ts` 先补用例（创建未勾选 → POST/PUT 载荷无 checks/retries/retry_timeout 三键；编辑 checks=null 未勾选 → 载荷无三键；编辑已有自定义 checks 取消勾选 → 弹确认，确认后载荷显式清除、取消则保留勾选），再改 submitData 按 advancedEnabled 构造 + 清除确认（useOverlayModal）
- [x] 1.2 真数据回归：走查复刻 P0-1 现场（创建不改描述保存 → 发布 → 快照无 checks）；存量化石 id=343 编辑一次描述验证 checks 不再被改写

## 批 2 · 四态状态（P1-1 + P2-5/P2-6 部分，TDD 先行）

- [x] 2.1 后端 RED→GREEN：`tests/test_stream_proxy_publish_status.py`（编辑已发布 → pending_publish=true 两列表端点+详情；partial；回滚清空）——模型加 `last_publish_status` 列 **并登记 COLUMN_MIGRATIONS**（约定 #118），列表/详情接 derive_pending_publish 与字段透传；`pytest -k "stream"` 回归
- [x] 2.2 PG 方言冒烟（约定 #103）：新列触达写库路径，`TEST_DB_BACKEND=pg uv run pytest tests/test_pg_dialect_smoke.py -q`
- [x] 2.3 前端 RED→GREEN：卡片换 PublishStatusTag 四态传参（移除自制二元徽章）、状态 Tab 筛选+计数、发布确认传 `current-version` + 标题带资源名；跨域同步 RouteList 同款传参（消费方断言清单先行，约定 #217）
- [x] 2.4 真页走查：编辑已发布代理 → 「待发布」；发布部分失败 → 「⚠ 发布未完全生效」→ 重发布入口

## 批 3 · 删除与回滚风险（P1-2/P1-3 + P2-9，TDD 先行）

- [x] 3.1 RED→GREEN：删除确认节点在线/离线标识、默认全选在线、子集后果行、全选栏（`useClusterUtils.ts` showDeleteConfirm + StreamProxyList 传节点带 status）；共享改动先列消费方清单（约定 #217：静态资源/DNS 等同源调用点）
- [x] 3.2 RED→GREEN：部分失败终态失败节点清单 + 「重试删除」terminalAction（复用发布侧机制）
- [x] 3.3 恢复语义诚实化：VersionManagementModal stream 域恢复确认文案补恢复范围（端口/健康检查/重试/DNS 不随回滚）；`tests/test_stream_proxy_rollback.py` 钉住部分恢复字段集（防未来误扩）
- [x] 3.4 真页走查：子集删除后果提示、离线节点标识、恢复确认文案

## 批 4 · 向导/抽屉/文案收口（P1-4 + P2-1/2/3/4/7/8/10 + P3 子集，TDD 先行）

- [x] 4.1 后端 RED→GREEN：409 detail 带占用者名（`tests/test_stream_port_conflict_detail.py`）
- [x] 4.2 向导 RED→GREEN：离线节点禁选+标注、检测失败文案+自动勾手动输入、高级配置展开 scrollIntoView+高亮、编辑直达第 2 步+摘要条、移除代理类型 toggle
- [x] 4.3 抽屉 RED→GREEN：分区重排（摘要/转发/高级/元数据）、健康检查与重试展示（NULL→「未配置」）、DNS 域名映射渲染、formatDateTime 带年、权重 `:100` 统一
- [x] 4.4 列表 RED→GREEN：空态两态化+清除筛选+SVG 图标、占用卡「被「{name}」占用」前缀、进度弹窗执行中禁取消、addLog 空文本跳过、搜索防抖换共享 useDebouncedSearch
- [x] 4.5 消费方核对与全量回归：`npx vitest run --no-file-parallelism` 全绿（1 例 DbBackupCard 轮转漂移，隔离复跑 44/44 绿，#208 判漂移）+ `npx vue-tsc -b` 零错误 + `npm run build` ✓；uxReviewM 源码守卫按本轮决策反转（权重 :100 统一，旧全角括号约定废止）

## 验证与收口

- [x] 5.1 真页全流程走查（test 集群）：复刻评审路径（创建→编辑→发布→版本→删除→错误路径）逐项对照问题清单验收，走查数据清理（API 复核 0 残留）
- [x] 5.2 `uv run pytest -k "stream"` 全绿；`openspec validate --all` 0 error 收口
