# design: clickhouse-config-ux-review-fixes

## Context

见 proposal.md · Why。补充设计所需的现状约束：

- 试连实现已在后端（`_try_connect`，`asyncio.to_thread` 包裹，构造即建连 + `SELECT 1`），错误目前直接 `str(exc)` 透出。
- `clickhouse.yaml` 写盘函数 `_write_struct` 按 `connections[]` 全量重写；`_public` 决定 API 暴露字段，加非敏感元数据字段零风险。
- 测试端点主规格约束「MUST NOT 修改配置文件、MUST NOT 触发缓存失效」——决策点 1A 的 `last_test_*` 落盘**必须**与该约束调和（见 D2）。
- 指标侧缓存失效（`ch.invalidate()`）仅与连接参数相关；测试元数据写入不改变参数，不得触发失效。
- 前端弹窗为手写 modal（弹窗三层制约定 #25 视图层形态），校验现为 toast-only；无 a-form。

## Goals / Non-Goals

**Goals：** 状态诚实（连通性实测驱动 UI）、失败可追溯、错误可行动、表单防呆；见 proposal · Goals。

**Non-Goals：** 见 proposal · Non-goals。设计层另加两条边界：不引入后台探测任务与WebSocket 推送（页面级拉取足够）；不做 clickhouse.yaml 的历史版本/回滚（文件由页单点维护，审计已可追溯）。

## Decisions

> 决策点 1–5 待用户裁决；下文按推荐项（1A/2A/3A/4A/5A）展开，B 分支的落差在各节标注。

### D0 角色口吻（待确认）

`clickhouse_config` 为可授予资源权限，超级管理员直通。全部文案按「平台管理员」口吻，不做角色分支（与 plugin-switches D0 同款判据）；若实际普遍授予普通运维角色，仅影响措辞不影响结构。

### D1 状态卡 = 数据源健康卡（P1-1/2，决策点 1）

优化后页面结构（布局示例，列宽/间距照既有规范微调）：

```
┌ PageHeader：ClickHouse 配置                    [操作日志] [+ 新建连接]
│   description：管理指标查询使用的 ClickHouse 数据源：支持多条命名连接，
│   激活其中一条。此处切换仅影响监控/指标页面，与平台数据库（「数据库管理」页）无关。
├─ 卡 1 · 当前数据源（健康卡）
│   ● 可达（刚刚检测）   生产指标库   192.168.100.42:9000/esapm_metrics
│   上次测试：✓ 5 分钟前        [重新检测]  [去指标总览]
│   （不可达态：● 不可达（红色）+ 失败原因摘要一行 + [查看详情]（展开原始错误与建议））
│   （未配置态：a-empty「未配置活动连接」+ [新建连接] 引导，保持现状语义）
├─ 卡 2 · 连接列表
│   # | 名称 | 地址 | 数据库 | 用户 | 密码 | 上次测试 | 当前 | 操作
│   1 | 生产  | 192.168.100.42:9000 | esapm_metrics | default | 已设置 | ✓ 2 分钟前 | 当前 | 测试 设为当前 编辑 删除
│   空态：#emptyText 单层 ——「暂无连接，点击新建；未配置时指标页按默认参数（127.0.0.1）尝试」+ [+ 新建连接]
└─ 弹窗 · 新建连接
    名称*（行内校验：必填、重名即时提示）   主机*（行内校验：必填、IP/主机名格式）
    端口 9000（ⓘ native TCP 端口，HTTP 8123 不适用；行内校验 1–65535）
    连接超时(秒) 5（1–60）
    数据库 esapm_metrics   用户 default   密码（可选 / 编辑态「已保存，留空不修改」）
    [ ] 保存后设为当前连接（编辑模式：仅非当前连接显示此项）
    [测试连接]                        [取消] [保存]
```

- **四态状态机**：`未配置`（无激活连接）→ `检测中` → `可达` / `不可达`（含失败摘要）。绿点颜色**只**绑定该状态机，废除「有激活连接即绿」。
- **进页自动检测**：`onMounted` 对激活连接调既有试连端点（结果随端点语义留痕，见 D2），与列表加载并行、不互相阻塞；结果仅存页面态。
- **重新检测**：手动触发同一检测；检测中按钮 loading 态。
- **不可达态信息层级**：摘要一行（转译后主文案）+ 可展开的原始错误（`error_detail`）；`去指标总览` 路由链接横贯两态（可达时也存在，构成「配置 → 验证」闭环）。
- B 分支（不落盘）：健康卡与自动检测完全一致；差异仅在列表无「上次测试」列、激活警示为静态提示。

### D2 测试结果元数据与「不落盘」约束的调和（决策点 1A，P2-4）

- `POST /connections/{id}/test` 与 `POST /connections/test`（带 id）完成后，将 `last_test_ok`（bool）/ `last_test_at`（naive UTC isoformat，对齐全站时间约定 #26）/ `last_test_error`（转译后主文案，截断 200 字）写入该连接条目并重写 yaml。
- **主规格「测试不落盘」场景同步 MODIFIED**：约束本意是「测试不得改变连接参数与缓存状态」，新语义为——测试 MUST NOT 修改连接参数字段、MUST NOT 触发 `ch.invalidate()`；测试结果元数据的记录是允许且期望的行为。
- `_public` 暴露 `last_test_ok/last_test_at`（`last_test_error` 仅在详情需要时透出，避免列表接口携带长文本——先按不透出实现，激活弹窗用主文案足够）。
- 未手动测试过的连接三字段为空 → 列表「上次测试」列显示「未测试」（弱化灰字），激活警示据此给「建议先测试」。
- 写放大评估：测试为低频手动操作、yaml 体量 <10KB，忽略。

### D3 试连错误转译（决策点 3A，P1-3/P2-5）

- 后端 `_translate_test_error(exc) -> tuple[str, str]`（主文案, 原始错误），单实现供三个试连出口共用（守卫收敛在共享出口，对齐架构 #187 原则）。响应形：`{ok, error, error_detail}`；`ok=true` 时二者为 null。
- 已知模式表（`str(exc)` 包含匹配，命中即转译，未命中透传原文）：

| 驱动特征 | 主文案（error） |
|---|---|
| `Connection refused`（Code 210） | 连接被拒绝：{host}:{port} 无服务监听。请确认 ClickHouse 已启动、端口为 native TCP 端口（默认 9000，非 HTTP 8123）、防火墙已放行 |
| `Authentication failed` / 认证失败（Code 516 类） | 认证失败：用户名或密码不正确（或该用户无权限访问 {database}） |
| `Database {db} does not exist` | 数据库 {database} 不存在：请确认库名，或连接后查看可用库 |
| `Name or service not known` / `getaddrinfo failed` 等解析失败 | 无法解析主机 {host}：请检查主机名拼写与 DNS 配置 |
| `timed out` / timeout 类 | 连接超时（{connect_timeout}s）：网络不通、路由不可达或服务无响应 |
| 未命中 | 原始 `str(exc)` 透传（error = error_detail） |

- 前端 toast 显示 `error`；健康卡不可达态与激活警示均引用 `error`，`error_detail` 仅在「查看详情」展开处出现。

### D4 激活确认弹窗升级（P1-3）

- 弹窗正文保留现状（目标名称 + 地址 + 影响范围说明），追加一行目标连接测试状态：
  - `上次测试：✓ 5 分钟前` → 正常切换，无附加警示；
  - `上次测试：✗ 1 小时前（认证失败：…）` → 黄色警示行「该连接上次测试失败（{摘要}），切换后指标查询可能不可用」；
  - `未测试` → 黄色警示行「该连接尚未测试，建议先测试再切换」。
- 维持**软提示**不设硬闸门：临时不可达的目标（对端重启中）合法存在，阻断切换是过度设计；警示已满足风险感知。
- 决策点 1B 时无历史可展示，两分支统一退化为静态「建议先测试」提示。

### D5 表单防呆（P2-6/8/9，决策点 4A）

- 行内校验（hand-rolled modal + 轻量 error state，字段下红字 + 输入框红边）：
  - 名称：必填；失焦/提交时重名校验（trim 后精确比对，编辑排除自身——数据源为 `GET /connections` 已加载数据，无需新增端点；提交时后端仍兜底 400）。
  - 主机：必填 + 格式（IPv4 / IPv6 / 合法主机名正则）。
  - 端口 / 超时：整数、范围 1–65535 / 1–60；非法值不再静默回退默认（废除 `Number() || 9000` 的静默改写，空值提交被行内校验拦截）。
  - 提交时聚焦首个错误字段。
- 端口 label 加 ⓘ tooltip：「ClickHouse native TCP 端口，默认 9000；HTTP 端口 8123 不适用于本平台」。
- 后端重名 400：`create/update` 落盘前校验，文案「连接名称「{name}」已存在」；存量重名不强制处理（仅新写入受控）。

### D6 「保存后设为当前连接」（决策点 2A，P2-7）

- 弹窗 footer 上方 checkbox；显示条件：新建模式恒显示；编辑模式仅当该连接非当前时显示。
- 保存成功且勾选 → 依次调 activate：激活失败时如实分步提示（「连接已保存，但切换激活失败：{原因}；可在列表中手动设为当前」），不回滚保存。
- 首条连接自动激活语义不变（checkbox 在无激活连接时勾选并禁用，标注「保存后自动成为当前连接」）。

### D7 跨页横幅（决策点 5A，P1-2 跨页半边）

- 后端：`GET /metrics/summary` 响应增加 `source_ok: bool`（`execute_query` 返回 None 即 false，与用户实际可见数据同源，无误报面）。
- 前端：新增轻组件 `MetricsSourceBanner`（黄条：「指标数据源不可用：无法连接 ClickHouse（{host}:{port}）。[查看 ClickHouse 配置]」），`Metrics.vue` 与 `MetricsDashboard.vue` 顶部挂载；store 增 `sourceOk` 态随 summary 刷新。
- delta 落新能力 `metrics-source-status`（数据源状态在指标页的可见性），不改动 `clickhouse-metrics-query` / `metrics-dashboard` 既有需求。

### D8 文案对照表（P2/P3 扫尾）

| 现状 | 改为 | 位置 |
|---|---|---|
| 绿点（有激活连接即亮） | 可达 / 不可达 / 检测中 / 未配置 四态（颜色绑定实测） | 状态卡 |
| `连接失败：Code: 210. …` | 「连接失败：连接被拒绝：…（中文主文案）」，详情含原始错误 | toast / 健康卡 |
| 空态双层（「暂无数据」+ 底部 hint） | 单层 `#emptyText`：引导语 + 「+ 新建连接」按钮（M8 守卫文案不变） | 连接列表 |
| 端口（无提示） | 端口 ⓘ native TCP 端口，默认 9000；HTTP 8123 不适用 | 弹窗 |
| 「暂无 ClickHouse 连接，点击右上角…」 | 并入单层空态，指路改为按钮直达 | 列表空态 |
| yaml 头注「系统管理 → ClickHouse 配置」 | 「监控 → ClickHouse 配置」 | `_write_struct` / 模板注释 |
| 激活行「删除」红色禁用 | 禁用态去 danger 配色（灰化），title 提示保留 | 列表操作列 |

### D9 表格解剖与守卫（P3-11/12）

- `#` 列：`{title:'#', key:'index', width:45}`，`pagination=false` 全量渲染用 `index+1`（#59）。
- 空态用 `#emptyText` 槽（#57 槽名；测试桩用 `aTableStub`，#54）。
- 既有守卫：`uxReviewM.source.test.ts` M8（「+ 新建连接」两页统一）必须继续通过；`ClickHouseConfig.test.ts` 既有断言按 #217 出反转清单后逐项处理。

## Risks / Trade-offs

- [进页自动检测对不可达目标要等 connect_timeout] → 默认 5s、上限 60s；检测不阻塞列表渲染（独立于 loading 态），健康卡显示「检测中」。
- [测试落盘与「测试不落盘」直觉冲突] → 规格 MODIFIED 明确新语义（参数不变 + 缓存不失效）；review 时重点核对 `invalidate()` 未被误调。
- [自动检测把「非用户发起的连接尝试」打到真实 CH] → 只读 `SELECT 1`，无业务副作用；与用户进指标页的查询负载同量级。
- [横幅依赖 summary 端点时机] → summary 挂了才出横幅，摘要成功但图表失败（部分指标缺失）不误报；与「数据不可用」语义对齐（连接级失败）。
- [重名 400 对脚本/自动化的破坏] → 本仓无该端点的自动化消费方（E2E 不触 CK 真实连接）；422→400 语义更准确。

## Migration Plan

- `clickhouse.yaml` 新键（`last_test_*`）向后兼容：旧文件缺键读取为 None，无迁移动作；无 DB schema 变更 → PG 方言冒烟按 #103 触发式评估记录「不触发」（纯 yaml + 既有写路径，无模型/SQL 变更）。
- 回滚 = revert 提交；yaml 中多出的 `last_test_*` 键对旧代码无害（`_read_struct` 按字段白名单读）。

## Open Questions

- 无——决策点 1–5 全部前置于 proposal，待裁决后按分支微调（B 分支落差已在 D1/D2/D4 标注）。
