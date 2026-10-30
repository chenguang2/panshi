# Proposal — 审计日志模块体验优化（audit-log-ux-review-fixes）

## Why

对审计日志页（`/audit-log`）按易用性 / 易于理解 / 美观与层级 / 安全与风险感知四维做了体验评审（依据：真实代码 `AuditLog.vue` 572 行、`system.py` 审计端点、`auditResourceRoutes.ts`、dev 环境真实截图三张）。核心问题：**列头排序是假的**（前端仅重排当前页 20 行，后端固定 `id desc`，跨页排序结果误导）、**资源跳转 40+ 类资源仅集群可跳且整页刷新**（`window.location.href`）、**归档存档下载一次性不可找回**（服务端留存 `data/archives/` 却无再次下载入口）、缺 IP/关键字筛选与时间快捷项、多处文案与重复信息增加理解成本。审计是安全溯源模块，以上直接拖慢「谁在什么时候对什么做了什么」的追查动线。

## What Changes

按风险分三批（低风险文案/视觉先行，依赖后端的靠后）：

**批 1 — 文案与视觉（纯前端，低风险）**
1. 统计文案二义性：「共 X 条记录 · 库内累计 Y 条」→「筛选结果 X 条 · 全库共 Y 条（最早 …）」，两个数字语义一眼可分。
2. 操作类型轻量视觉编码：删除/批量删除/清理 = danger 弱色标签；创建/导入/生成 = success 弱色；更新/发布/回滚 = 中性描边——仅删除系用警示色，避免全页焦虑。
3. 资源列合并：「资源」+「资源ID」两列 → 一列「自启动 #8」形态（窄屏不再被两列挤压），表头同步调整。
4. 时间筛选快捷项：range-picker 增加预设「今天 / 近 7 天 / 近 30 天」。
5. 操作列与详情列重复信息治理：详情为后端默认模板（`{resource} {action} (id=N)` 语义与操作/资源/ID 三列完全重复）时已显示「—」——扩展该判定覆盖批量形态，并在操作 label 兜底未知动作时显示「未识别（raw）」而非裸英文。
6. 错误/提示文案补因：「导出尚未就绪，请稍后重试」→ 说明状态与重试方式；「归档预览失败」「复制失败」补充原因或让用户重试的具体动作。
7. **修复 spec 漂移**：主 spec 规定「默认时间范围 = 最近 7 天」，代码实为无默认值（`dateRange = ref(null)`）——本变更实现默认近 7 天并对齐 spec。

**批 2 — 交互修复（前端为主，中风险）**
8. 假排序治理：移除全部列头 `sorter`（前端本页排序对「全局 id desc」语义是错的）；是否升级为后端排序见待决项 1。
9. 资源跳转修复：`window.location.href` → `router.push`（SPA 内导航，不再整页刷新）；映射表扩展高频资源（范围见待决项 2）。
10. 筛选器升级：三 个原生 `<select>` → `a-select`（showSearch，选项多时可输人搜索）；新增 IP 下拉（后端 meta 增补 `ips` distinct，见待决项 4 的后端部分）。
11. 导出感知：导出按钮点击后先确认范围（「将导出当前筛选结果 N 条」）；>50000 条时后端现有 `limit(50000)` 静默截断 → 前端提示「仅导出最近 50000 条」；CSV 前端逐页拉全量改为复用后端导出（去掉 25 次串行请求路径，行为不变、路径收敛）。

**批 3 — 归档与检索补全（依赖后端）**
12. 归档历史：新增 `GET /system/operations/archives`（列出服务端 `data/archives/` 存档文件：文件名/大小/归档时间）+ 下载端点复用既有鉴权；页面加「归档历史」入口（抽屉或弹窗列表 + 下载按钮）——解决「存档只在那一次弹窗下载，事后无法找回」。
13. 关键字检索（见待决项 3）：列表端点支持 `keyword`（detail/resource_id ilike）+ 筛选条搜索框。

## Capabilities

- **Modified Capabilities**:
  - `audit-log-ui` — 列表列构成与排序语义、资源跳转导航方式、导出范围感知、默认时间范围、筛选器形态均属该 capability 的需求级变化。
- **New Capabilities**: 无（归档历史与关键字检索作为 `audit-log-ui` 内新增需求，不另立 capability——同属审计查看界面边界）。

## Impact

- 前端：`frontend/src/views/AuditLog.vue`（列、排序、文案、筛选器、导出流程、归档入口）、`frontend/src/config/auditResourceRoutes.ts`（映射扩展 + 返回路由对象）、`frontend/src/api/auditLog.ts`（meta 增字段、archives/keyword API 封装）。
- 后端：`backend/app/api/v1/system.py`（meta 增 `ips`、`keyword` 参数、archives 列表/下载端点、导出截断返回实际范围）；`services/audit.py` 不动。
- 测试：`frontend` AuditLog 相关组件测试、`backend/tests/test_audit_*.py`（或 system 相关）补 archives/keyword/meta.ips 用例；守卫 `tests/test_security_guard.py` 补新增端点采样（约定 #19）。
- 风险：批 2 移除列头 sorter 会移除既有交互（有单测断言 sorter 的需同步反转）；映射扩展跳转目标页需逐一验证路由存在。

## 待决项（2026-10-29 用户裁决：全部采纳推荐方案 A）

1. **假排序治理**：✅ A 移除列头 sorter，排序语义唯一为「时间倒序」。
2. **资源跳转范围**：✅ A 扩展高频资源映射（upstream/route/node/user/ssl_cert/node_task；落地时按路由实际存在性微调，见 design §5）。
3. **关键字检索**：✅ A 本轮做，`keyword` 对 detail ilike + 纯数字时 resource_id 精确。
4. **IP 筛选**：✅ A meta 增 `ips` + IP 下拉。
