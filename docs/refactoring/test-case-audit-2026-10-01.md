# 测试用例全量审计报告（2026-10-01）

> 审计方式：4 个只读审计 lane 并行（Tier 3，全部结论基于源码直读 + grep 核对到行号，未执行测试）。
> 范围：后端 pytest ~129 文件（集群配置域 59 + 平台/运维/自动化/观测域 ~70）+ 前端 138 文件（视图/工具层单测 ~60、组件/composable 单测 45、E2E 33）。
> 前序治理：`test-suite-consolidation-2026-09-12.md`（删零价值、合并重复、DB 全局隔离已执行）；本报告为该治理后的**全量增量复审**。
> 局限：静态审计未实际运行测试；4 个超大文件（>1000 行）采用结构枚举 + 关键片段精读（lane 已披露）。

---

## 1. 被测系统概览（审计期间考古确认）

### 1.1 功能域与接口面
| 域 | 内容 | 路由模块（backend/app/api/v1/） |
|---|---|---|
| 集群配置域 | 集群/路由/上游/插件/SSL/节点/DNS/流代理/全局规则/静态资源，配置发布推送 Edge | clusters, cluster_routes/upstreams/ssl/nodes/dns_proxies/stream_proxies/plugin_configs/plugin_metadata/global_rules/static_resources, cluster_install, cluster_edge_env, cluster_backup, cluster_export, dashboard, edge_import, edge_client, edge_autostart, global_rules, plugin_switches, routes/upstreams/nodes 等 |
| 自动化域 | Ansible 主机清单、OpenResty 安装、节点任务中心（脚本上传/执行/文件分发） | ansible_inventory, node_tasks |
| 观测域 | ClickHouse 指标、仪表盘统计、健康分析 | metrics, clickhouse_config |
| 运维域 | 数据库管理/迁移/备份恢复/归档/切换、用户与认证、审计、中继网关、系统特性 | auth, users, system, database, db_backup, relay, features |

共 39 个路由模块。同步 `POST /database/migrate` 已下线（2026-09-16，唯一入口 SSE `/migrate-stream`）；在册测试均已对齐，未发现引用已删端点的过时文件。

### 1.2 数据库表结构（28 张）
- 集群域：`ps_cluster` `ps_plugin_enabled` `ps_upstream` `ps_upstream_target` `ps_route` `ps_route_plugin` `ps_node` `ps_config_version` `ps_plugin_metadata` `ps_plugin_config` `ps_global_rule` `ps_stream_proxy` `ps_ssl_certificate` `ps_static_resource` `ps_node_autostart`
- 平台账务：`sys_user` `sys_user_cluster` `sys_user_permission` `sys_audit_log`
- 自动化：`install_task` `install_task_node`
- 运维/观测：`ps_db_backup_config` `ps_db_backup_target` `ps_db_backup_history` `ps_db_backup_history_target` `ps_db_migration_log` `ps_import_log` `relay_gateways`

### 1.3 角色与权限模型
- **角色**：`sys_user.role` ∈ {`admin`, `user`}（String(20)，默认 user）。无更多角色。
- **资源级权限**：`sys_user_permission`（user_id + resource_type + enabled），后端经 `app/core/deps.py` 的 `require_permission(resource)` / `require_any_permission(*resources)` 工厂门控（admin 直通）；admin 专属端点用 `get_current_admin_user`（403）。
- **两种挂载形态**：router 级 `dependencies=[Depends(get_current_user)]` 或端点参数 `Depends(require_permission(...))`；仅 system/features 与 /health 有意公开。
- **Token 吊销链**：pwd_ver claim（改密/重置密码后旧 token 立即失效）+ status 禁用即时失效。
- **前端**：左侧菜单 5 分类权限键（核心功能/边缘网络/综合/系统管理/运维管理），adminOnly 路由 meta + 菜单可见性过滤。
- **数据权限**：普通用户经 UserCluster 关联可见集群；**无行级数据隔离**（授权即全量）。

### 1.4 定时任务 / 中间件 / 第三方
- 定时/后台：db_backup 调度 tick、relay 快照 `_relay_refresh_loop`（30s TTL 兜底）、lifespan `recover_interrupted_tasks`。
- 消息队列：无。分布式事务：无。审批/工作流：**无此业务域**（用户检查单第 9 项不适用）。
- 第三方对接：Edge Admin API（HTTP 腿：直连/中继网关 8443 + `X-Edge-Target`；SSH 腿：ansible）、ClickHouse（clickhouse-driver）、观测系统 RuoYi+Datart（外置部署，非本仓库测试对象）。

---

## 2. 总体判定统计（文件级，≈ 为静态计数）

| 域 | 文件数 | 保留 | 修改后保留 | 合并到其他 | 删除 | 拆分 |
|---|---|---|---|---|---|---|
| 后端·集群配置域 | 59 | 32 | 16 | 8 | 1 | 3 |
| 后端·平台/运维/观测域 | ~60 | 50 | 11 | 4 | 0 | 0 |
| 前端·视图/工具层单测 | ~60 | ~40 | ~10 | 0 | ~6 | 0 |
| 前端·组件/composable + E2E | 78 | ~45 | ~20 | ~5 | ~7 | 0 |
| **合计** | **~257** | **~167（65%）** | **~57（22%）** | **~17（7%）** | **~14（5%）** | **3（1%）** |

**总评**：套件整体健康度高——发布/删除/迁移/备份/中继/审计等核心链路有大量高质量集成与守卫测试（标杆：test_cluster_edge_env、test_edge_import、test_static_resource_lua、test_db_backup_service、test_relay_routing、DbMigrationCard.test、NodeTaskCenter.test、database-management.spec、auth-session.test）。核心问题集中在五类：
1. **"自测副本"假信心**（测测试文件内手写的模拟逻辑，真实实现变更不报警）——最严重，约 80+ 用例；
2. **恒真/宽断言零判别力**（无断言 POST、`in (200,404)`、`pytest.raises(Exception)`、空转 for 循环）；
3. **E2E 危险写 + 数据污染**（真实删库、真实节点操作、写入共享库/清单不清理）；
4. **权限覆盖断层**（匿名 401 有 58 条矩阵，已认证非 admin 403 零散 ~6 处，前端路由守卫/会话过期零覆盖）；
5. **catch 吞错型静默 skip**（30 处 `.catch(()=>false)` + 43 处 skip，真实回归被伪装成环境跳过）。

---

## 3. 问题用例清单（四 lane 合并，按问题类型与严重度）

### 3.1 错误 / 危险用例（P0，立即处理）

| 位置 | 问题 | 处理建议 | 理由 |
|---|---|---|---|
| `e2e/cluster-delete.spec.ts`（全文件） | 硬编码 `DELETE /clusters/4` **真实删库**、零断言（404 也绿）、纯 console.log | **删除** | 调试脚本不是测试；对共享 demo 库有破坏性 |
| `test_cluster_install.py::test_install_edge_endpoint_exists` | 函数体发出 POST 后**无任何断言**，恒真 | 补 `assert resp.status_code in (404,422)` 或删除 | 只要抛不了异常就通过 |
| `test_node_reload.py`（全文件 2 例） | "端点已删"与"端点在但 404"都返回 404，永不可能失败 | 删除，或断言 `app.routes` 路由表 | 兜底路由 `/api/{rest:path}` 对未知路径也回 JSON 404（规则 #34 陷阱） |
| `test_plugin_whitelist.py::client` fixture | `importlib.reload(app.main)` 会话中途重建第二个 app 实例，dependency_overrides 分裂、行为依赖执行顺序 | 改用 `test_dns_upstream_plugin_def.py` 的 features monkeypatch 模式 | 双实例隐患污染后续用例 |
| `e2e/edge-client.spec.ts::should show route table columns / plugin list table`（已知 2 例静默 skip） | `.ant-table-header` 多 Tab 匹配多表格 → isVisible 抛严格模式错 → `.catch(()=>false)` 吞掉 → 永久 skip | locator 限定 `.ant-tabs-tabpane-active .ant-table-header` | 约定 #102 已知遗留，本次精确定位 |
| `e2e/node-batch-delete / route-batch-delete / upstream-batch-delete`（batch delete flow ×3） | **真实删除**共享库前 2 条数据；`.ant-modal .last()` 多弹窗定位错；confirm 未出现即吞错 skip | route 拦截改造 + 抽共享 helper + `skipIfNoData` 区分环境守卫与真实失败 | 三胞胎同构；30 处 catch 吞错的代表 |
| `e2e/node-batch-action.spec.ts` | 对**真实节点**执行批量启动（ansible 链路），依赖真实节点数量，resolveFns 型 skip 链 6 处 | route 拦截改造 | 真实环境写操作 |
| `e2e/route-plugin-groups TC-RPG-03`、`global-rules`、`node-batch-import`、`ansible-inventory` | 向真实库/清单写入（`e2e-test-pg` 路由、`e2e-test` 全局规则、10.99.99.1-4 节点、10.0.0.x 主机+密码）**从不清理** | 补 teardown（经 API 删除）；参照 database-management.spec 的 serial+生命周期标杆 | 数据污染累积；inventory 属敏感域（约定 #10） |
| `views/__tests__/CentralListPublish.test.ts::publishStatusRender`（5 例） | 真实现已改为渲染 PublishStatusTag 组件（useClusterUtils.ts:827 返回 VNode），测试仍断言旧 `{color,text,title}` 形状 | 删除；补一条 PublishStatusTag 挂载断言 | 断言已不存在的 API，假信心 |

### 3.2 过时用例（P1）

| 位置 | 问题 | 处理建议 |
|---|---|---|
| `test_system_features.py::test_dns_proxy_http_not_yet_in_feature_routers` | "not yet in" 自毁式负断言，启用该路由时必红 | 启用 dns_proxy_http 时同步改写为正向断言 |
| `views/__tests__/CentralListPublish.test.ts::formatPublishDate*`（8 例） | 断言全仓不存在的死代码函数 + `new Date()` 本地解析（违约定 #26） | 删除（format.test.ts 已覆盖真实现） |
| `components/__tests__/SslFormDrawer.test.ts` mTLS 块（6 例） | 本地副本：组件实际 `Number(form.client_depth)` 且判 `!== ''`（SslFormDrawer.vue:667），与副本语义漂移 | 保留 edge.local 块；mTLS 改真实组件提交载荷断言 |
| `components/__tests__/SslGenerateDialog.test.ts::buildGeneratePayload`（部分） | `buildGeneratePayload` 为本地副本（组件 533 行内联构建） | 改真实组件载荷断言 |
| `components/__tests__/HealthCheckForm.test.ts` 被动检查块 + `mountPassive` | 被动块与主动块断言逐字重复；mountPassive 死代码 | 参数化合并，删死代码 |
| `components/__tests__/InstallOpenrestyDialog.test.ts` | 100ms setTimeout flush + 直写 `(vm as any).selectedFile` 绕过 UI | 改走 UI 文件选择路径 |

### 3.3 重复用例（P2，合并/参数化）

| 重复组 | 文件 | 处理建议 |
|---|---|---|
| E2E advanced-match tab 四重重复 | cluster-list-route-modal-tabs（信息量最高，**保留**）/ route-advanced-match 用例1 / route-switch-toggle / route-advanced-match-toggle | 后三者删除或并入保留组；plugin-editor 同文件两例逐行相同删一个 |
| 单测内部重复 | RouteAdvancedMatch.test.ts isIpOperator 块 ×2（765/1072 行）+ isListOperator 分散 3 处 | 文件内合并（~1885 行最大单测文件） |
| features recognized/default_enabled 5 组 10 例同构 | test_features.py | 参数化为 `(feature_name, default)` 表 |
| 同 mock 同请求多断言拆两例 | test_status_analysis / test_time_comparison（returns_200 + returns_data） | 合并 |
| 中间件写锁同构两处 | test_maintenance.py::TestMigrationState.test_middleware_still_blocks_writes | 删除 |
| batch-delete 三胞胎 openXxxTab + 吞错模式 | e2e 三文件 | 抽共享 helper |
| "分组筛选三件套"逐字复制 | 前端 7+ 文件 | 建共享测试工厂 |
| 跨文件双份 auth store 测试 | `stores/auth.test.ts` + `stores/__tests__/auth.test.ts`（本次已核实并存） | 合并为一份 |
| 违规顺序链 | `stores/__tests__/metricsDashboard.test.ts:72-77`（已核实）`mockResolvedValueOnce` 链 | 改 URL 感知 mock（约定 #43） |
| 可并入域文件的薄文件 | test_allowed_tags→ansible_service、test_db_migration_model→db_migration_service、test_relay_registry→relay_routing、test_form_reset→users/clusters 域、route_priority→route_api、stream_proxy_list_api→stream_proxy、plugin_metadata/plugin_config/global_rule/static_resource 四胞胎 list_api | 合并 |
| websocket 三例 | test_dns_upstream_publish.py → test_route_publish.py field_variants 参数化 | 合并 |

### 3.4 意义不大 / 零判别力（P1~P2，删除或重写）

| 组 | 位置 | 建议 |
|---|---|---|
| **自测副本五件套**（~31 例） | CentralListValidation(9)、CentralListDelete(3)、CentralList.advanced-toggle(9)、UserList(1)、RouteFormModal.test.ts(2，不 import 组件手写 buildRouteSubmitData)、VersionManagementModal.test.ts(16，主角 formatConfig 组件中不存在) | 删除；CentralListValidation 若需保留改为 import 真实 `validateIP`；RouteFormModal 删除后补真实组件载荷测试（F2-NEW-07） |
| **模拟函数副本块**（~55 例） | test_config_diff.py ~45%（测测试文件内手写"模拟端点逻辑"）、test_route.py::TestRouteWebsocketConfigDiff、test_ssl.py::TestSslMtlsUpdateClear/TestSslDiffMtls/TestSslPublishConfig | 把 diff/publish 组装逻辑从端点内联提取为 service 函数后 import 真实现；或改写为 test_config_diff_route.py 式端点直调 |
| 宽状态码区间 | test_edge_client_api.py 19 例 `in [200,400,404,500,502,503]` | 收紧为 `== 503`（_no_edge_http 下确定性映射）或删除重复组 |
| 恒真/重言式零散例 | config_diff empty/none/hash 4 例、NodeList reload button、DnsUdpProxyList wizard 空转、RouteList DNS data/plugin param 名实不符、NodeTaskCenter if 条件断言、metrics router registered、excel_export importable、localization **函数体仅 pass**、db_switch restart_flag 常量、download 2×should be defined、migration_fk_regression 永久 skip 占位、TC-RPG-01/02、edge-import step1 `.or()` 永真、UpstreamList `toContain('2')` | 删除或按各 lane 建议补真断言 |
| assert-callable 漏网存量 | cert_generator 5 个（治理删 7 个后漏网）、ssl router_has_routes、stream_proxy module_importable、test_cluster_install 8 个 `in (404,422)` exists 型 | 删除（治理基线 #30 明令） |

### 3.5 覆盖不足（结构性，P1~P2）

| 组 | 位置 | 建议 |
|---|---|---|
| 列表过滤**空转假绿** | test_route_list_api、test_upstream_list_api、test_node_list_api、plugin_metadata/plugin_config/global_rule/static_resource 四胞胎（`for item in items: assert` 无种子零迭代） | 各补 2-3 条种子再断言 |
| 手工 ASGITransport 打会话级全局库 + 15 行登录样板 | test_route_api / route_advanced / upstream API 块 / stream_proxy API 块 | 迁 `async_authed_client`（conftest 已有） |
| 依赖 gitignored 本机文件 | test_static_resource_zip_contents 3/4 例永久 skip | 隔离库经上传 API 自建 zip |
| `pytest.raises(Exception)` 过宽 | test_node_batch_create ×2、test_upstream、test_stream_proxy | 精确到 ValidationError |
| 随机端口跨用例碰撞 | test_stream_proxy `_unique_port` random.randint | 确定性 max+1 |
| 断言 mock 回显 | test_node_batch_action statistic（删死变量 real_build） | 验证端点真实组装路径 |
| SSE 断连分支缺 | useInstallStream（缺断连/非 200）；edge-env 流缺客户端中途断开回归 | 补分支用例 |
| 强耦合构造 | test_edge_logger `object.__new__` 绕过 `__init__` | monkeypatch 类属性后真实构造 |
| 脆弱测试写法 | NodeList/ClusterListPage `setTimeout(100~200)` 真实睡眠 ×8+、ClusterListPage `mockApiGet.mockResolvedValue` 非 URL 感知 | 全部换 flushPromises / URL 感知 mock |
| E2E 环境守卫与真实失败不区分 | 30 处 `.catch` + 43 处 skip | 建 `skipIfNoData` 共享 helper |

---

## 4. 逐文件结论表

> 完整四张逐文件表（~257 行，每文件：用例数/结论/一句话理由）见各 lane 审计原始输出；此处保留判定为"修改/合并/删除/拆分"的全部文件与代表性"保留"文件，避免与 §3 重复。

**删除（14 文件）**：e2e/cluster-delete.spec、e2e/basic-test.spec、e2e/simple-test.spec、e2e/route-switch-toggle.spec、e2e/route-advanced-match-toggle.spec、backend/test_node_reload.py、frontend CentralListValidation / CentralListDelete / CentralList.advanced-toggle.spec / UserList / RouteFormModal.test / VersionManagementModal.test（后两者删除/重写）、CentralListPublish（删除后重写）。

**合并（17 文件）**：后端 test_route_advanced_match→route_api、test_route_priority→route_api、test_dns_upstream_publish→route_publish、test_stream_proxy_list_api→stream_proxy、plugin_metadata/plugin_config/global_rule/static_resource 四胞胎 list_api、test_allowed_tags→ansible_service、test_db_migration_model→db_migration_service、test_relay_registry→relay_routing、test_form_reset→users/clusters；前端 plugin-editor（文件内）、route-advanced-match（并入 TC-CL 组）、cluster-page（并入 cluster.spec）、upstream.spec（并入 cluster.spec）、upstream-publish 两例合一。

**拆分（3 文件）**：test_config_diff（92 例，~45% 副本剥离）、test_ssl（69 例，副本块剥离）、test_edge_client_api（27 例，宽区间组重写）。

---

## 5. 新增用例卡片（37 张，处理建议均为"新增"）

### 5.1 P0 卡片（4 张，全文）

**B2-NEW-01**
- 用例编号：B2-NEW-01 ｜ 模块/功能：`app/core/security.py` JWT 密钥解析链（规则 #20）
- 用例标题：显式 env → `.env.<APP_ENV>` 非占位 → production 无配置启动失败 → 开发持久化 `.jwt_secret` 四级链路各自命中
- 前置条件：tmp_path 隔离工作目录（当前全仓零覆盖，已 grep 确认）
- 测试步骤：① 设 `JWT_SECRET_KEY` 断言取 env；② 仅设 `.env.production` 非占位值断言取文件；③ `APP_ENV=production` 无配置断言启动抛错；④ 开发态生成并持久化 `data/.jwt_secret`，二次启动复用
- 测试数据：占位值样本（`change-me` 类）+ 正常密钥
- 预期结果：四级链路各自命中；生产缺失 fail-fast；开发密钥文件复用
- 优先级：P0 ｜ 用例类型：安全
- 判断理由：该 key 兼任 Fernet 库密钥（换 key 即已存密码不可解），零测试

**B2-NEW-05**
- 用例编号：B2-NEW-05 ｜ 模块/功能：`POST /relay/gateways/{id}/sshd-setup` root 凭据安全
- 用例标题：sshd-setup 全程后，DB 各表、审计 detail、SSE 输出均不含明文 root 密码
- 前置条件：gateways_inv 夹具；stub ansible 流
- 测试步骤：① 携带 `root_password` 发起；② 流结束后全表扫描（sys_audit_log/relay_gateways/清单文件）+ SSE 帧逐帧断言无明文；③ 清单文件字节还原（补"从未落库"断言）
- 测试数据：`root_password="RootSecret#2026"`
- 预期结果：明文密码零出现；仅注入期临时存在
- 优先级：P0 ｜ 用例类型：安全
- 判断理由：现有用例只验证注入/还原对称，未验证"不落库/不进回显"

**B1-NEW-01**
- 用例编号：B1-NEW-01 ｜ 模块/功能：clusters + cluster_routes（权限）
- 用例标题：非授权用户访问集群子资源端点被拒（纵向+横向越权）
- 前置条件：隔离库含 admin(id=1)、role=user 用户 U、两个集群 C1/C2 各含 1 条路由
- 测试步骤：① 以 U 的 token `GET /api/v1/clusters/1/routes`；② `POST .../publish`；③ `DELETE .../{C2路由id}`；④ 无 token 访问同端点
- 测试数据：U 经 `auth_headers_for()` 签发
- 预期结果：①403；②③ 403 或 404（不泄露 C2 存在性）；④401；sys 无写入
- 优先级：P0（权限断层最大缺口）｜ 用例类型：权限
- 判断理由：域内 60 文件仅 1 条 401 用例；test_security_guard 只守匿名

**F2-NEW-01**
- 用例编号：F2-NEW-01 ｜ 模块/功能：集群域-路由发布 E2E
- 用例标题：路由发布完整链路（API 造数→UI 发布→逐节点成功日志含经中继/直连标注→API 清理）
- 前置条件：后端 12344 存活，admin 登录；集群≥1（无需真实节点）
- 测试步骤：① API 建测试路由；② `page.route` 拦截 `**/publish` 返回固定 `{results:[{node,status:'success',route:'relay'},{...route:'direct'}]}`；③ UI 行内发布→全选→确认；④ 断言共享进度弹窗两行日志分别含 `（经中继）`/`（直连）`；⑤ API 删除清理
- 测试数据：`e2e-pub-route-<ts>`
- 预期结果：逐节点行与路径标注精确渲染；无残留
- 优先级：P0 ｜ 用例类型：E2E兼容
- 判断理由：现 route-publish.spec 真实发布且只 console.log，核心链路"跑过≠验证过"（约定 #51 验收教训）

### 5.2 P1 卡片索引（15 张，全文格式同上，见 lane 原始报告归档）

| 编号 | 模块 | 标题（缩略） | 类型 |
|---|---|---|---|
| B1-NEW-02 | edge_sync.publish_resource | 同一路由连续重复发布幂等（版本单调、PUT 全量） | 功能 |
| B1-NEW-03 | edge_sync.publish_resource | 多节点发布部分失败的 DB 状态与响应契约 | 数据 |
| B1-NEW-09 | 审计 ×集群域 mutating 端点 | 发布/删除/导入的 sys_audit_log 落库完整性（resource_id 整型） | 数据 |
| B2-NEW-02 | 迁移全局写锁 ×真实 app | 迁移执行期并发 POST 503 / GET 放行 | 功能/并发 |
| B2-NEW-03 | /database/migrate-stream | 双开幂等拒绝且无孤儿 running 日志 | 接口/幂等 |
| B2-NEW-04 | audit_hook.validate_route_map | 真实 app 全量守卫：无"既无映射也无法推断"路由 | 安全/审计 |
| B2-NEW-06 | POST /database/import | archive_path 越界（穿越/绝对路径/目录）→ 400 无读取 | 安全/数据 |
| B2-NEW-07 | 备份/恢复 ×迁移锁交叉 | 迁移中触发备份/恢复被互斥拒绝 | 数据/并发 |
| B2-NEW-08 | migrate_direct | 中途失败后同参数重跑收敛（22 表完整 ID 保持） | 数据/幂等 |
| F1-NEW-01 | 路由守卫 ×权限 | 非 admin 访问 adminOnly 路由被重定向 + 导航过滤 | 权限 |
| F1-NEW-02 | 列表页错误态 | GET 500 时页面不白屏、有提示 | 兼容性 |
| F1-NEW-03 | 列表分页 | 翻页携带 page=2 且保留既有筛选参数 | 数据 |
| F2-NEW-02 | 认证 | 会话过期（401）自动跳回登录页 | 权限/E2E |
| F2-NEW-03 | 观测域-发布日志 | DnsUdpProxyList/StreamProxyList 内联发布循环经中继标注 | 功能 |
| F2-NEW-04 | 静态资源 | ZIP 上传 UI 边界（非 zip 拒绝 + 413 提示） | 功能 |
| F2-NEW-05 | 安装流 | useInstallStream 断连与非 200 错误分支 | 功能 |

### 5.3 P2/P3 卡片索引（18 张）

| 编号 | 模块 | 标题（缩略） | 优先级 | 类型 |
|---|---|---|---|---|
| B1-NEW-04 | cluster_routes | 同一路由并发双发布不竞态损坏 | P2 | 功能 |
| B1-NEW-05 | cluster_routes | route uri 合法性边界与透传契约（radixtree 语义固化） | P2 | 边界 |
| B1-NEW-06 | cluster_routes | route vars 注入向量不触达危险执行路径 | P2 | 安全 |
| B1-NEW-07 | cluster_ssl | SNI 边界与发布 sni/snis 映射（端点级，替换副本测试） | P2 | 边界 |
| B1-NEW-08 | stream_proxies | listen_port 全边界经 API 校验（0/1/65535/65536/跨集群） | P2 | 边界 |
| B1-NEW-10 | routes/upstreams | 资源名称长度与特殊字符边界、跨集群同名 | P2 | 边界 |
| B2-NEW-09 | 审计 CSV 导出 | 公式注入中和（`=`/`+`/`-`/`@` 前导） | P2 | 安全 |
| B2-NEW-10 | require_permission | 已认证非 admin 403 抽样矩阵（含 export/download 粒度契约） | P2 | 权限 |
| B2-NEW-11 | db_restore × relay_registry | 恢复完成后中继快照立即刷新（规则 #50 restore 路径） | P2 | 功能/数据 |
| F1-NEW-04 | 时间显示 | naive UTC→Asia/Shanghai 视图级哨兵（列页扩展） | P2 | 兼容性 |
| F1-NEW-05 | 搜索筛选 | 搜索/清空/页码重置链路 | P2 | 功能 |
| F1-NEW-06 | PluginMetadataList | 编辑/删除/发布按钮→composable 接线 | P2 | 功能 |
| F1-NEW-07 | EdgeEnv | 未选集群/节点时不发起 SSE 的入口守卫 | P2 | 功能 |
| F1-NEW-08 | 节点表单 | 非法 IP 校验绑定真实 validateIP（替代已删副本） | P2 | 数据 |
| F2-NEW-06 | 版本管理 | 版本对比模式真实 diff 断言（造数+清理） | P2 | E2E |
| F2-NEW-07 | RouteFormModal | 高级匹配提交载荷组件级测试（补删除空洞） | P2 | 功能 |
| F2-NEW-08 | 路由列表 | 100 条大数据量渲染/分页/选择清空 | P3 | 性能 |

---

## 6. 覆盖缺口矩阵（对照检查单）

| # | 检查项 | 评级 | 关键缺口 | 对应新用例 |
|---|---|---|---|---|
| 1 | 正常业务流程 | ● 良好 | 核心链路（发布/删除/迁移/备份/中继/节点任务）集成覆盖厚 | — |
| 2 | 异常业务流程 | ◐ 部分 | 后端 SSE 失败链/回滚有；**前端错误态全空白**（所有列表只 mock 成功） | F1-NEW-02、F2-NEW-05 |
| 3 | 参数校验与边界值 | ◐ 部分 | schema 层尚可；route uri/名称/listen_port API 层/SNI 发布映射无 | B1-NEW-05/07/08/10 |
| 4 | 权限控制 | ○ **最薄弱** | 匿名 401 有 58 条矩阵；**非 admin 403 仅 ~6 处点测**；前端路由守卫/会话过期零覆盖；数据权限（UserCluster）无用例 | B1-NEW-01、B2-NEW-10、F1-NEW-01、F2-NEW-02 |
| 5 | 接口测试（幂等/超时/重试） | ◐ 部分 | 幂等缺口：重复发布、迁移双开；超时有 _no_edge_http/长超时契约 | B1-NEW-02、B2-NEW-02/03 |
| 6 | 数据一致性 | ◐ 部分 | 备份/恢复/迁移强；发布失败回滚契约、迁移中途失败重试缺 | B1-NEW-03、B2-NEW-08 |
| 7 | 列表查询 | ○ 薄弱 | 后端过滤空转假绿 7 文件；前端分页/排序/页大小全层零覆盖 | F1-NEW-03/05 + §3.5 整改 |
| 8 | 导入导出 | ● 良好 | 集群备份/恢复（clone-only 全契约）、Excel、迁移备份链全；缺 ZIP 上传 UI、CSV 公式注入 | F2-NEW-04、B2-NEW-09 |
| 9 | 审批/工作流 | — **不适用** | 系统无审批工作流域（网关管理平台，无提交/驳回/转交对象） | — |
| 10 | 安全测试 | ◐ 部分 | 后端守卫丰富（路径穿越/上传加固/命令白名单/注入）；缺 JWT 生命周期、root 凭据不落库、CSV 注入、前端 401 跳转；XSS 有 ansi/html 转义散点。注：清单密码**有意不脱敏**（约定 #10 业务规则，勿当缺陷）；CSRF 不适用（token-in-header 架构） | B2-NEW-01/05/06/09、F2-NEW-02 |
| 11 | 性能与稳定性 | ○ 最薄弱 | 仅 2 条高价值（事件循环不被 CH 阻塞、前端并发上限）；并发发布/大数据量列表/批量操作全空白；手册 5 万路由场景无量化用例 | B1-NEW-04、B2-NEW-02、F2-NEW-08 |
| 12 | 日志与审计 | ◐ 部分 | audit_hook/operations API/tombstone 覆盖好；集群域 mutating 端点零落库断言、ROUTE_MAP 只在玩具 app 校验、SSE 断连重入缺 | B1-NEW-09、B2-NEW-04 |

---

## 7. 需要补充的信息（审计发起方确认）

1. **dns_proxy_http 路由的启用计划**——`test_system_features.py` 存在自毁式负断言（§3.2），启用时必须同步改写；若已有排期请提供。
2. **product 路线图中计划下线/重构的页面与端点**——静态审计只能核对"当前代码事实"（本次未发现引用已删端点的过时测试），无法预知未来下线项。
3. **"5 万路由"是否为真实性能验收口径**——决定 P3 性能用例（F2-NEW-08 等）的数据量级与断言阈值。
4. **E2E 测试环境约定**——是否允许向共享 demo 库造数+清理（database-management.spec 模式），还是统一改 route 拦截（不触真库）；这决定 §3.1 数据污染组的改造方向。
5. **ClickHouse 真实测试实例可得性**——观测域当前全 mock，如可提供 opt-in 真库（类似 PG_DSN 模式）可补 CH 方言冒烟。
6. **角色演进计划**——若未来引入 admin/user 之外的第三角色，B2-NEW-10 权限矩阵应改为参数化角色维度。

已确认无需补充：定时任务（3 处已识别）、消息队列（无）、分布式事务（无）、审批工作流（无此域）、第三方对接清单（Edge/CH/Datart 已勘定）。

---

## 8. 整改路线建议

| 批次 | 内容 | 预期收益 | 风险 |
|---|---|---|---|
| **B1（P0 删除+危险项）** | §3.1 全部：删恒真/无断言/危险用例；修 2 个静默 skip；E2E 危险写与数据污染改造 | -60+ 零价值例，消除真实删库风险 | 低（纯删除+守卫替换） |
| **B2（P0 新守卫）** | B2-NEW-01/05、B1-NEW-01、F2-NEW-01/02、B2-NEW-04 | 堵住安全/权限/核心链路验证空洞 | 低-中 |
| **B3（P1 副本重写）** | config_diff 提取 service 真实现、ssl/RouteFormModal/SslGenerateDialog 组件化重写、空转种子、自测副本五件套删除+替代 | 消除 ~80 例假信心 | 中（需逐组前后对照防覆盖净损失，参照 2026-09-12 P2 纪律） |
| **B4（P2/P3）** | 边界/并发/性能卡片、合并/参数化清理、mockResolvedValueOnce 与 setTimeout 治理 | 维护面收敛 | 低 |
| 验收口径 | 每批：`uv run pytest -q` + `npx vitest run` + `npx playwright test` 全绿；用例数与行为覆盖清单前后对照归档本文件附录 | — | — |

---

## 9. B1 批次执行结果（2026-10-01 当日完成，未 commit）

### 9.1 产出
- **后端**（fix-1）：删 `test_node_reload.py` 整文件 + 9 文件内 15 个零价值用例（assert-callable 漏网/路由注册/importable/恒真/永久 skip 占位）；修 23 处断言（cluster_install 补 404 断言、edge_client_api 19 处宽区间→实证 `==503`、2 处 raises→ValidationError/IntegrityError、plugin_switches 删粘贴块）；`_unique_port` 随机→确定性自增。净删 17 例。
- **前端单测**（fix-2）：删 7 个自测副本/过时文件（CentralListValidation/Delete/advanced-toggle/UserList/RouteFormModal/VersionManagementModal/CentralListPublish，56 例）；修 8 文件弱断言（NodeList 筛选器实际命中创建弹窗下拉——改真实 `.node-filter-bar select`；RouteList 补 DNS 徽章与 `params.plugin` 断言；metricsDashboard `mockResolvedValueOnce` 链→按 metricName/label 分发）。净 -58 例（105 文件/997 用例）。
- **E2E Wave 1**（fix-3）：删 5 个危险/重复 spec（cluster-delete/basic-test/simple-test/route-switch-toggle/route-advanced-match-toggle，32→27 文件）；edge-client 2 个静默 skip 真修且 **passed**；4 spec 补 try/finally teardown（`DeleteClusterRequest` body 契约对齐，curl 复核零残留，含清掉历史遗留节点）。
- **E2E Wave 2**（fix-3 续）：新建 `e2e/helpers/destructiveFlow.ts`（apiJson/skipIfNoCluster/openClusterTab/filterTableBySearch/expectAntModal/expectOverlayModal/interceptBatchDelete/interceptNodeAction/interceptPublish/teardown 五段式）；batch-delete 三胞胎 + node-batch-action + route/upstream-publish 改造为「API 造数 → `page.route` 拦截破坏请求（fulfill 形状逐一对照后端 handler）→ 载荷/渲染断言 → 零副作用复核 → teardown」。11 用例 **11 passed / 0 failed / 0 skip**，含「（经中继）/（直连）」逐节点标注断言（**F2-NEW-01 已落地**）；另证实旧 spec 的 catch 式「点确定」从未真正点到过（AntD 双字按钮渲染为「确 定」）。

### 9.2 审计前提修正（执行中发现）
1. `test_upstream.py` 不存在 `pytest.raises(Exception)`（审计 §3.5 该条过时，未改动）。
2. `ansible-inventory.spec` 原用例**从不落盘**（只改页面本地 rows 草稿，不触发保存）——不做有风险的恢复式写入，改为首尾 `GET /ansible/inventory` 快照 `raw_text` 逐字节比对的落盘守卫。
3. edge-client 静默 skip 根因勘误：非"多表格严格模式错"，而是 `.ant-table-header` 在该页 DOM 不存在（a-table 未配 scroll.y 渲染 `thead.ant-table-thead`），0 匹配 → isVisible false 被 catch 吞掉。修复用 `.ant-tabs-tabpane-active .ant-table-thead`。

### 9.3 终验（三道门全绿）
| 套件 | 结果 |
|---|---|
| `cd backend && uv run pytest -q` | **2082 passed / 11 skipped（PG opt-in）/ 0 failed**，5:06 |
| `cd frontend && npx vitest run --maxWorkers=4` | **105 文件 / 997 用例全绿**，35s |
| `npx vue-tsc -b` | exit 0 |
| `cd frontend && npx playwright test` | **84 passed / 0 failed**，4.5m |

### 9.4 工作区与备注
- B1 产出：48 个文件改动（后端 13M+1D、E2E 13M+5D、前端单测 9M+7D）+ 2 个新增（本审计报告、`e2e/helpers/destructiveFlow.ts`）。
- **非 B1 改动（提交时勿误并入）**：`backend/db_config.json`、`docs/other/prompt-*.txt`（会话前既有脏文件）；`frontend/src/components/DbBackupCard.vue`（同日早前的分页右对齐修复，独立交付物）。
- vitest 已知环境坑：本机高负载下不限 worker 会出现非确定性超时假失败（基线即有 38 个），验证必须 `--maxWorkers=4`；建议后续在 CI 中固定 worker 数（可并入 B4）。
- 后端全量 warnings 中的 aiosqlite "Event loop is closed" 为既有 teardown 噪音（warnings 级，非失败）。

### 9.5 后续批次状态
- B2（P0 新守卫）：未开工。范围修正：F2-NEW-01 已随 Wave 2 落地，余 B2-NEW-01/05、B1-NEW-01、F2-NEW-02、B2-NEW-04。
- B3（副本重写）、B4（合并/参数化、setTimeout→flushPromises）：未开工。
