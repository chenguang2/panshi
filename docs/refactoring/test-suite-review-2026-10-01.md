# 测试用例增量审查报告（2026-10-01）

> 前置：B1–B4 治理批次（`test-case-audit-2026-10-01.md`）已完成系统性清理，本报告为其**增量复审**——每条发现均已对照审计记录排除已裁决项。审查方式：两条只读审计 lane（后端 / 前端+e2e）源码直读到行号 + 全套件模式 grep；未运行测试，「当前全绿」依据为 B4 终验记录（pytest 2189 / vitest 1033 / playwright 86）。
>
> **总体结论**：过时 **2** ｜ 错误 **10** ｜ 重复 **3** ｜ 低价值 **7** ｜ 建议分布：删除 **7 例**、合并 **2 组**、修改 **17 处**、保留核实 **9 项**。四类问题的主体已在 B1–B4 清理，残留均为漏网与产物复核项，无系统性新问题。

---

## 一、后端（16 条判定项）

### A1 删除（6 例）

| # | 用例 | 判定 | 依据 |
|---|---|---|---|
| 1 | `test_stream_proxy.py::TestDnsUdpProxyModule`（`test_module_has_router_with_routes` + `test_dns_udp_router_path_prefix`，:504-516） | 低价值 | import 模块 + `hasattr(mod,"router")` + `len(routes)>0` 零判别；路由挂载与 `/dns-proxies` 前缀已被同文件真实 API 用例充分证明（:518、:492）。3.4 已裁决删除同类，本条为执行漏网。类 docstring `"TDD: starts failing"` 亦是陈旧红阶段标记（兼过时） |
| 2 | `test_route_api.py::TestRouteVarsEmptyArrayFix` 三例（:570/588/606） | 低价值 | 纯 ORM 赋值自测（赋值→commit→断言原值），`Route.vars` 为普通 TEXT 无 TypeDecorator，不受测代码变更影响；真实 null↔empty 契约已由 API 级 `test_update_route_vars_from_null_to_empty`(:99)、`test_vars_round_trip_array_value_null`(:365) 覆盖。B4 合并声明"零去重损失"成立——系并入物料带进的空转件 |
| 3 | `test_route_api.py::TestRoutePriority::test_update_priority_to_zero`（:678-710） | 重复 | 与 `test_update_priority_preserves_other_fields`（:712-746）同端点 PUT priority=0 + 同核心断言，后者是前者语义超集（额外断言 name/uri 保留），删前者 |

### A2 修改（9 项）

| # | 位置 | 现状 | 修改为 | 依据 |
|---|---|---|---|---|
| 4 | `test_ssl.py:43` `test_create_ssl_minimal` | `assert hasattr(cert, "algorithm")` 恒真 | `assert cert.algorithm is None` | `models/ssl.py:24` `algorithm String(16) nullable=True` 无 server_default，改后才对模型变更（如加默认值）有判别力 |
| 5 | `test_ssl.py:696/727/743` TestSslCertificateMtlsFields 三行 | hasattr 冗余行 | 仅删三行，用例保留 | 其后紧跟实质值断言（`is not None`/`== 2`/`== "/health"`），字段缺失时取值断言直接 AttributeError，hasattr 零增益 |
| 6 | `test_cert_generator.py:626-639` `test_returns_command_in_result` | 633/638 被后续断言蕴含；636/637 纯存在性 | 删 633/638；636/637 收紧为 `result.stdout.strip()` 非空（或删） | `_run_openssl(["version"])` 必有输出；audit 3.4 同类 4 例已删，本例因子例含实质断言存活 |
| 7 | `test_route.py:159` `test_route_enable_websocket_default_false` | hasattr 冗余行 | 删 :159 一行，用例保留 | :160 `assert route.enable_websocket is False` 在字段缺失时必 AttributeError |
| 8 | 宽断言收窄 12 处（下表） | `in (404,422)` / `(200,404)` / `(200,404,422)` / `(201,404)` | 全部单值化（详见表 ⑤） | isolated_app=admin 直通无 401 干扰；FastAPI body 校验与 handler 404 先后关系逐端点核实，**无一为双合法** |
| 9 | `test_script_upload.py::test_create_cmd_exec_with_script_file`（:364-385） | 注释"even if node doesn't exist"与代码相悖 + `if resp.status_code == 201:` 守卫使载荷断言可被静默跳过 | 删 if 守卫使断言无条件执行；`== 201` 收窄；注释改为"夹具已播种 Node(id=1)，端点缺节点确定性 404（node_tasks.py:462-470）" | **兼过时+错误**：端点对缺失节点 404，夹具已播种节点，404 是死分支；一旦夹具变化三行载荷断言被吞而测试仍绿 |
| 10 | `test_ssl.py:149-165` `test_generate_route_registered` + `test_generate_route_accepts_post` | 路由注册/方法形状对 | 合并为一条（提取 generate 路径断言 POST ∈ methods）；**补一条真实 API 冒烟后再删旧形状对** | 3.4 同类裁决执行漏网；且全套件无任何用例实际请求 `/clusters/{id}/ssl/generate`（行为层零覆盖），直接删会归零 |

#### 表 ⑤：宽断言收窄明细（12 处）

| 位置 | 收窄为 | 依据（端点行为） |
|---|---|---|
| test_cluster_install.py:151 | `== 404` | cancel-install 无 body 参数（:356-360），422 不可能 |
| test_cluster_install.py:156 | `== 422` | body 必填（:337-343），校验先于 handler；用例名即 returns_422 |
| test_cluster_install.py:174 | `== 404` | GET 无 body 无必填 query（:471-475） |
| test_cluster_install.py:178 | `== 200` | 路由真实存在（:494），缺目录返回 `[]` 不抛错（:101-105） |
| test_cluster_install.py:272 | `== 404` | body 合法进 handler，verify_node→404（:503-511） |
| test_cluster_install.py:283 | `== 404` | 同上（:525-532） |
| test_cluster_install.py:295 | `== 404` | 无 body 参数（:450-454），verify_node→404 |
| test_cluster_install.py:300 | `== 404` | 同上，docstring 自述 returns 404 |
| test_security_guard.py:112 | `== 404` | 隔离库有 cluster-1 无路由，get_or_404 确定性 404（cluster_routes.py:185） |
| test_security_guard.py:212 | `== 200` | GET /routes query 全带默认值（routes.py:21-36），空库返回空列表 |
| test_security_guard.py:228 | `== 200` | `proxy_type=dns` 命中 pattern 校验（cluster_stream_proxies.py:149） |
| test_script_upload.py:380 | `== 201` | 端点声明 status_code=201（node_tasks.py:419）；**本处判定为错误**（404 分支不存在） |

### A3 保留核实（非发现）

- `pytest.mark.skipif(not PG_DSN ...)` ×4（test_sqlite_to_pg_migration ×3、test_db_archive_service ×1）：有意 PG-gated opt-in（治理基线 #30 记录的模式），保留。
- `test_ssl_resource_path_registered`：RESOURCE_PATHS 边界契约全仓唯一钉住，保留。
- `test_enable_websocket_in_column_migrations`：迁移注册表守卫（约定 #118 相关），保留。

### A4 系统观察（挂账，超本轮范围）

`in (200,201)` / `in (200,204)` 族约 17 处（relay / node_task / audit_enrichment / db_backup / database / pg_smoke）——相关端点均声明确定状态码（node_tasks.py:419、clusters.py:116、cluster_stream_proxies.py:214 等），多数可单值化，建议下批统一收窄。

---

## 二、前端单测 + E2E（9 条发现 F1–F9）

### B1 删除（1 例）

| # | 用例 | 判定 | 依据 |
|---|---|---|---|
| F1 | `e2e/upstream-version-management.spec.ts :: should show version comparison without errors`（L76-102） | 错误（空转假绿） | 对比模式选版本必须点行内 radio，本例点的正是行本身（L91-92）→ diff 区永不出现 → L97 `count()>0` 假 → 断言整体静默跳过，永绿零判别。真实对比已由 `compare mode shows real diff...`（L109-203，B4 新增）完整覆盖 |

### B2 修改（7 项）

| # | 位置 | 问题 | 修改为 | 依据 |
|---|---|---|---|---|
| F2 | `upstream-version-management.spec.ts` openVersionModal 守卫 + Route describe 两例（L21-25/L214-218/L239-243） | 数据守卫恒真：`tbody tr.first().isVisible()` 命中 AntD 空表 placeholder 行，从不触发 | 守卫改 `locator('.ant-table-placeholder')` count 探测，空库优雅 skip | AntD 空表默认渲染 `tr.ant-table-placeholder`（UpstreamList.vue:34 / RouteList.vue:69 均 a-table）；现状全靠 demo 库有数据才跑得过 |
| F3 | `e2e/validation.spec.ts:59-73`（L65-70 同款守卫） | 同 F2 | 同 F2 方案 | 同上 |
| F4 | `e2e/static-resource-upload.spec.ts :: API 返回格式包含 storage_path`（L24-39） | 无守卫硬断言 `items.length > 0`，依赖 cluster 1 存量数据 | GET 前探测 `items` 空则 `test.skip('无静态资源数据')`（或经 API 造数 + teardown） | 同文件第一例（L18）有守卫、第二例没有，CI 偶发硬红形态 |
| F5 | 同文件两例手写登录样板（L26-32 硬编码 `http://localhost:9100`） | 重复实现 helpers 已有能力 | 改用 `apiHeaders`/`apiJson`/`API_BASE`（destructiveFlow.ts:14/24-46，失败显式抛错） | 裸 `.json()` 不校验 2xx，共享 helper 更安全 |
| F6 | `src/stores/features.test.ts` 6 处 mockResolvedValueOnce（L16/46/58/79/90/101） | 治理残留（一测一调无顺序语义） | 改 URL 感知 mockImplementation（未注册 reject） | `stores/features.ts:11-18` 每次 load 仅一次 `GET /system/features`；mock 形状已对照 system.py:134-141/features.py 核实无漂移——仅 Once 风格残留。（另 auth-session.test.ts:22 的 1 处命中为解释性注释，非违规） |
| F7 | `e2e/cluster.spec.ts`（7 处）+ `route.spec.ts`（2 处）`click('text=集群管理')` | 非失效（顶层菜单、当前默认展开，**不属约定 #102 形态**），但与文件内"导航统一 page.goto"宣告不一致，依赖分组展开态与文案唯一性两个隐式条件 | beforeEach 改 `await page.goto('/clusters')` | AppSidebar.vue:216 集群管理为顶层 nav-item；cluster.spec.ts:57-59 注释已宣告 goto 规范，迁移后言行一致 |
| F8 | e2e `waitForTimeout` 29 处（汇总条） | 等待反模式残留 | 分四档：**24 处冗余删**（后接 auto-waiting 断言/操作：login.spec:24、database-management:43、node-batch-import ×9、upstream-advanced-config ×4、upstream-version-management ×3、edge-client:173）；**3 处半承载改断言后删**（route.spec:34、validation.spec:17/51——后接非自动等待 `count()`，改 `expect(...).toBeVisible()`）；**3 处 poll 化**（edge-client.spec:35/42/45 queryFirstNode 内选项异步加载，照同函数 `expect.poll` 模式）；**2 处保留**（helpers/navigation.ts:30/33，router-link 竞态重试窗口有注释有 URL 兜底） | Playwright locator 断言/操作原生自动等待 |

### B3 合并（1 组）

| # | 位置 | 判定 | 修改为 | 依据 |
|---|---|---|---|---|
| F9 | `upstream-version-management.spec.ts` Upstream 与 Route describe 同构 4 组（open-modal smoke L46-50 vs L211-234；JSON 面板 L52-74 vs L236-275） | 重复（低危） | 抽 `openVersionModal(page, statLabel, tableSelector)` 工厂 + `[上游, 路由]` 参数表；两例 open-modal smoke 参数化为一（标题 `opens version modal from $resource page`） | 两侧被测弹窗同为 VersionManagementModal，差异仅入口页与数据源；groupFilterSuite（B4）已确立同构入厂口径 |

### B4 保留核实（非发现）

- edge-client.spec.ts 已知 2 个「多表格严格模式冲突静默 skip」用例：**已在 B1 修复**（L102/L117 改 `.ant-tabs-tabpane-active .ant-table-thead` 限定 Tab 容器，带根因注释，无 catch 吞错）。
- e2e `test.skip('无…数据')` 数据守卫 12 处：edge-client ×4（expect.poll 真实探测）与 static-resource-upload 第一例、upstream-version-management 内层版本数守卫均**有效可保留**；仅 F2/F3 所列外层守卫恒真失效。
- 单测 `.skip(/.todo(` 0 残留；fake timers + flushPromises 混用 9 处逐一核对全部为正确模式（`toFake:['setTimeout','clearTimeout']` 保 setImmediate 真实）；mock 形状与真实后端不符零发现；`toBeTruthy` 94 处命中均为行为断言前置守卫非恒真。

---

## 三、统计与口径

| 视角 | 后端 | 前端+e2e | 合计 |
|---|---|---|---|
| 过时 | 2（A1#1 docstring、A2#9 注释，均为兼性） | 0 | 2 |
| 错误 | 宽断言 12（含 1 处实错）+ A2#9 守卫 | F1/F2/F3/F4/F6/F8 | 10（按发现条计） |
| 重复 | A1#3 一对 | F5、F9 | 3 |
| 低价值 | A1#1、A1#2、A2#4-7、A2#10（7 项） | 0 | 7 |

**建议**：删除 7 例（A1 全部 + F1）｜ 合并 2 组（A2#10 先补冒烟、F9）｜ 修改 17 处（A2 表 + F2-F8）｜ 保留 9 项（A3 + B4）。

**审查局限**（如实披露）：静态审计未运行测试；test_ssl.py（1033 行）/test_route_api.py（980 行）用「用例名全量枚举 + 可疑块精读」代替逐对 diff；前端 106 单测文件中 13 个 e2e spec 未逐行精读（经 4 组模式 grep 无线索）；F2/F3 的 AntD placeholder 行为依据 AntD Vue 4 默认渲染 + a-table 用法推断，未在空库实测。
