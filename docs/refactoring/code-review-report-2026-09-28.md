# 磐石 Gateway 全面代码审查报告（2026-09-28）

- **审查范围**：38 个后端路由文件 / 24 个 services / 38 个前端视图 / 20 个前端 API 模块，全量覆盖。
- **审查方法**：三路并行深审（后端安全与健壮性、前端安全与健壮性、历史评审 delta 基线），对照 `docs/refactoring/` 既有三份评审报告（v1–v3，2026-06）与 5 轮重构计划去重，不重报已修复或已登记接受项。全部 Critical / High 发现已逐行抽查源码确认属实（行号核对），另有两处前端发现与"安全校验函数零调用"经独立复核确认。

## 审查基线与去重说明

以下为已登记的接受风险或已闭环项，本次不作为新发现重报：

- 命令校验可被 shell 间接执行绕过（AGENTS #44，已接受，运维负责）。
- Ansible 清单 SSH 密码明文、禁掩码（AGENTS #10，用户决策）。
- JWT 24h 有效期（可选生产 8h）；本报告仅报"重置密码不吊销存量 token"增量。
- `.vue` 模板层 ~474 处 any warn（增量治理，不做专项，AGENTS #27）。
- 大文件按 AGENTS #11 判据维持（CentralList / NodeTaskCenter / EdgeClient）。
- SSE 规格-实现分歧（AGENTS #45，known，待收敛）。
- 历史评审主项已闭环（delta 实测确认）：集群列表 N+1 已由 `batch_load_cluster_stats` 修复；发布编排单实现（#18）；CRUD 工厂（#24）；`as any` / `@ts-ignore` / console 生产清零属实；VersionManagementModal v-html 已转义闭环。

## 严重问题（Critical）

### C1. 备份导入 edge_uuid 路径穿越 → 任意文件写入 + 任意目录删除

- **位置**：`backend/app/services/cluster_backup.py:248-251`；连锁 `backend/app/api/v1/cluster_static_resources.py:302-305`
- **问题描述**：`_write_static_file` 中 `target_dir = Path(_BASE_STORAGE_DIR) / (edge_uuid or "imported")`，`edge_uuid` 直接取自导入备份 JSON；`validate_backup_document` 只校验 format/version/checksum，不校验字段值。构造 `edge_uuid="../../x"` 的备份文件即可在任意可写路径落 `.zip`。该值入库后，「删除静态资源（数据库副本）」走 `os.path.join(BASE_STORAGE_DIR, del_dir_name)` + `shutil.rmtree(route_dir)`——导入时埋入 `../..`，删除时即 rmtree 任意目录。
- **风险 / 影响**：具备 cluster_backup 权限的账号可实现任意文件写 / 删。
- **修复建议**：导入与写盘两处强校验 `re.fullmatch(r"[A-Za-z0-9._-]+", edge_uuid)`（拒绝 `/`、`\`、`..`）；删除前对 join 结果做 `os.path.realpath` 前缀断言（必须在 `_BASE_STORAGE_DIR` 下）。补一条恶意备份导入的回归测试。

### C2. software_check 用户输入未校验即注入节点命令行

- **位置**：`backend/app/services/node_task_service.py:458-461, 731-733`；`backend/ansible/roles/edge/tasks/software_check.yml:4`
- **问题描述**：`cmd_str = ",".join(params.get("software_list"))` 未做任何校验：其一，经 extravars 进 playbook，角色侧 `{{ software_list }}` 未加 `| quote`，目标机 shell 解释 `;` / 反引号 / `$()`；其二，SSH 降级路径 `f"bash -s {cmd_str} <<'SOFT_CHECK_EOF'..."` 同样拼接。软件检查本应只读，却完全绕过了 cmd_exec 的黑 / 白名单模型。
- **风险 / 影响**：与已接受的 #44 不同（那是"校验可被绕过"），这里校验根本不存在——有节点任务权限的账号可在目标节点执行任意命令。
- **修复建议**：API / 服务层逐项校验 `^[A-Za-z0-9._+-]+$`；playbook 参数改 `{{ software_list | quote }}`；SSH 降级改用安全参数传递（如列表 base64 化）。

## 中等问题（High / Medium）

### H1. EdgeClient 同步 httpx 系统性阻塞事件循环

- **位置**：`backend/app/services/edge_client.py:204-216`（同步 `httpx.get/post/...`）→ `edge_sync.py:386-423` → 全部发布 / 删除路由（8 处同步 lambda）+ `cluster_static_resources.py:462` 的 zip `raw_put`
- **问题描述**：`publish_fn` 全是同步调用却跑在 `async def` 里；向 N 个节点发布遇不可达节点时，事件循环被冻结 N×5~30s。同型问题：SSL 证书生成在 async 端点内直接跑同步 `subprocess.run`（`cluster_ssl.py:533-557`）；数据库归档 export / import 同步全库读写（`database.py:609, 638`）。
- **风险 / 影响**：发布期间健康检查、登录、全部请求无响应（与已修复的"迁移阻塞主循环"同类，但覆盖面大得多）。
- **修复建议**：EdgeClient 提供异步版（`httpx.AsyncClient`）或调用点统一 `asyncio.to_thread`（仓库已有正确范例 `clusters.py:417`）；cert / archive 两条腿包 `to_thread` 或复用 `_spawn_migration_bg_task` 模式。属结构性工程，建议单独立项。

### H2. ClickHouse SQL 注入（label 键）

- **位置**：`backend/app/services/metrics_service.py:86-88`
- **问题描述**：`label_where = f"AND Attributes['{key}'] = %(label_val)s"`——值走参数绑定，但键 `key` 来自查询参数 `label`（`metrics.py:119`）按 `:` 切分后 f-string 拼接。
- **风险 / 影响**：`label=x'] OR 1=1 --:v` 即可注入 ClickHouse（读 system 表，极端配置下写文件）。
- **修复建议**：键白名单 `^[A-Za-z0-9_-]+$` 或转义单引号；同文件 `query_summary` 的 `filter_clauses` 是内部常量，无风险。

### H3. 硬编码默认 SM4 / ADMIN 密钥，且 SM4 用 ECB 模式

- **位置**：`backend/app/services/edge_client.py:40, 111, 140-146`（历史评审 H4，至今未闭环）
- **问题描述**：默认 `SM4_KEY="a16bc20453da220f"`、`EDGE_ADMIN_KEY` 默认值已提交仓库；未设环境变量的部署，其"加密通道"与管理面认证对任何拿到源码者透明。SM4-ECB 无 IV 无完整性保护。
- **风险 / 影响**：可向 Edge 节点伪造配置推送。
- **修复建议**：`APP_ENV=production` 缺失 `EDGE_SM4_KEY` / `EDGE_ADMIN_KEY` 或仍为默认值时拒绝启动（照搬 `security.py:56-60` 模式）；协议允许时迁 CBC / CTR+MAC。

### H4. PG 启动 schema 自检失败时 drop_all 全库

- **位置**：`backend/app/core/database.py:148-151`
- **问题描述**：`except Exception: Base.metadata.drop_all(sync_engine)`——inspect 因瞬时连接 / 权限问题失败时，启动路径直接删光活动库全部表（AGENTS #14 的活动库可能正是真实库）。
- **风险 / 影响**："检查失败"被处理成"销毁数据"，生产 PG 上是灾难性失败模式。
- **修复建议**：检查失败 fail-fast 抛错终止启动，绝不能 drop；保留 138-147 行的定向重建分支。

### M1. cmd_exec 脚本模式完全未接安全校验

- **位置**：`backend/app/services/node_task_service.py:788`（`_validate_script_security` 定义，生产代码零调用）；脚本执行约 :466-509
- **问题描述**：cmd 模式强制黑 / 白名单（:516-535），而 `script_content` / `script_file` 模式直接 `base64 -d | bash`，UI 的安全选项对脚本路径形同虚设。
- **风险 / 影响**：欺骗性安全保障；不是 #44 的已接受项（那是"校验可绕过"，这是"未校验"）。
- **修复建议**：脚本分支执行前按 `params.security` / `whitelist` 调用 `_validate_script_security` 并阻断。

### M2. 无登录限速；密码重置不吊销存量 JWT

- **位置**：`backend/app/api/v1/auth.py:16`、`backend/app/api/v1/users.py:159-171`、`backend/app/core/security.py:81`
- **问题描述**：`/auth/login` 可无限暴力破解；JWT 24h 无刷新 / 吊销机制，`reset_password` 后存量 token 仍有效（禁用用户有 status 兜底，重置密码没有）。
- **风险 / 影响**：弱口令可被暴力枚举；密码重置后旧会话继续有效。
- **修复建议**：登录失败计数限速（内存级即可，内网规模够用）；JWT payload 加 `pwd_ver` 声明或 User 表加 `token_version` 列。

### M3. 静态资源 zip 上传无大小限制

- **位置**：`backend/app/api/v1/cluster_static_resources.py:351-353`
- **问题描述**：`await file.read()` 全量入内存后才判空，无任何上限（脚本上传有 512KB / 10MB 限制，此处没有）；随后整包写盘、发布时再整包读入并以 30s 超时 PUT 出去。
- **风险 / 影响**：恶意或误操作的超大文件可造成内存 / 磁盘耗尽。
- **修复建议**：读前校验 `file.size`，上限对齐网关 32m `client_max_body_size`，读入改分块。

### M4. SSL 证书"下载"是死链且必然 401

- **位置**：`frontend/src/components/SslGenerateDialog.vue:620-622`
- **问题描述**：`window.open('/api/v1/ssl/${id}/download')`——后端无此路由（兜底返回 JSON 404，见 AGENTS #34），且 `window.open` 的 GET 不带 Authorization 头（token 在 localStorage）。
- **风险 / 影响**：生成证书后点下载，新标签页白报错，功能完全失效。
- **修复建议**：改用 `SslCertDownloadDialog.vue` 已有方案（`api/ssl.ts` 拉取 + `buildCertZip` / `downloadBlob`），删除死链。

### M5. 登出无容错：服务端失败则本地会话不清理

- **位置**：`frontend/src/stores/auth.ts:38-46` + `frontend/src/views/DefaultLayout.vue:69-74`
- **问题描述**：先 `await api.post('/auth/logout')` 再清本地，且 `handleLogout` 无 try/catch。请求失败 / 超时时 rejection 上抛：token / user / permissions 不清理、不跳登录页，产生 unhandled rejection，用户停留在"已登录"假象。
- **风险 / 影响**：登出可靠性缺陷 + 未处理 Promise 拒绝。
- **修复建议**：`try { await api.post } catch {} finally { 本地清理 + 跳转 }`——本地清理必须无条件执行。

### M6. 401 拦截器清理不完整

- **位置**：`frontend/src/api/index.ts:32-37`
- **问题描述**：401 时只清 localStorage 的 `token` / `user`，不清 `permissions`、不重置 Pinia auth store（对照 `stores/auth.ts:43-45` logout 三项全清）。
- **风险 / 影响**：会话内 `hasPermission` 基于脏数据判断，`permissions` 残留到下次整页加载。
- **修复建议**：抽 `clearSession()` 单实现供拦截器与 `logout()` 共用（顺带解决 M5）。

### M7. 发布 / 删除前端无长超时覆盖、无 in-flight 锁

- **位置**：`frontend/src/composables/useClusterUtils.ts:523, 645`
- **问题描述**：吃全局 30s 超时；后端逐节点 EdgeClient 超时 5s（`edge_client.py:205-216`）串行执行，节点较多或有不可达节点时前端先报 timeout 而服务端仍在执行（违反 AGENTS #29 自家约定，`api/relay.ts:47-50` 已示范正确做法）。进度弹窗不阻塞底层页面，可并发触发第二轮节点同步。
- **风险 / 影响**：与 H1 是同一链路的前后端两侧；用户误判发布失败 + 并发发布。
- **修复建议**：`api.post` / `delete` 加 `{ timeout: 300_000 }` 按请求覆盖；两个函数入口加模块级 running 标志。

## 建议优化（Low / Suggestion）

| # | 位置 | 问题描述 | 修复建议 |
| --- | --- | --- | --- |
| L1 | `frontend/src/views/NodeList.vue:1154-1158`、`frontend/src/views/clusters/ClusterNodes.vue:984-987` | 安装执行期间组件卸载，本地进度 interval（`_elapsedTimer` / `_installTimer`）不清理，闭包保活会话级泄漏 | `onUnmounted` 补 `stopElapsedTimer()` / `clearInstallTimer()`（正确范式：`RelayGateways.vue:698-702`） |
| L2 | `frontend/src/views/DatabaseManagement.vue:1096-1121` | 迁移 SSE 的 `migrationController` 只在手动终止时 abort，离开页面不清理 | `onUnmounted` 补 `migrationController.value?.abort()` |
| L3 | `frontend/src/router/index.ts:133, 222-225` | `adminOnly` 守卫是死代码（全仓无路由注册该 meta）；`/users` 非管理员可直达（后端 403 兜底但页面白屏报错） | 给 Users 与 ansible-inventory 路由补 `meta: { adminOnly: true }` |
| L4 | `frontend/src/main.ts:32-40` | features 加载 `while(true)` 固定 3s 无限重试、无退避、无用户提示 | 加最大重试或指数退避，UI 给"加载中 / 失败重试"提示 |
| L5 | `frontend/vite.config.ts:38-56` + `backend/app/main.py:174` | 生产静态资源全链路无压缩（实测 dist/assets ~17.6MB：ts.worker 6.9MB、monaco 3.6MB、vendor-antd 1.48MB） | 后端挂 `GZipMiddleware` 或 vite 预产 gzip / br（文本类 ~3x） |
| L6 | `backend/app/api/v1/cluster_static_resources.py:291-295` | audit 赋值在 None 检查前，删除不存在资源 500 而非 404；同族 `detail=str(e)` 泄露内部路径与 DB 错误（管理员权限域，低危） | audit 块移到 None 检查后；内部错误统一收敛为通用文案 + 日志留详情 |
| L7 | `backend/app/api/v1/users.py:29-30` | 分页参数无边界（`page=0` 负 offset、`page_size=999999` 全表；`MAX_PAGE_SIZE=500` 已定义未用） | 补 `Query(ge=1, le=500)`（参照 `node_tasks.py:539-540`） |
| L8 | `backend/app/services/ansible_service.py:204-208` | `sshpass -p <密码>` 把 SSH 密码暴露在进程列表（`ps` / `/proc/*/cmdline`） | 改 `sshpass -e` + 环境变量传递（清单明文是已接受的 #10，此处只消进程暴露面） |
| L9 | `frontend/src/views/NodeList.vue:536-542` | `loadClusters` 空 catch，失败时集群筛选下拉静默为空 | 至少 `message.warning('集群列表加载失败')` 一次 |

## 亮点

- **XSS 面全仓干净**：`utils/html.ts` 单一 escapeHtml 实现（5 实体含单引号），15 处 v-html 全部先转义再注入（`ansi.ts`、`diff.ts`、VersionManagementModal、EdgeEnv 等）；审计资源链接走白名单映射；Monaco / json-editor-vue 无 HTML 渲染路径；历史评审 v1-L12 指出的 v-html 风险已闭环。
- **同步库封装正确示范**：ClickHouse 同步驱动在 metrics 域全部经 `asyncio.to_thread` 调用，`clickhouse_client.py` 用 thread-local 连接 + 配置版本号解决 Client 非线程安全与热更新，事故背景注释完整。
- **鉴权覆盖完整**：38 个路由文件逐 router 核对，router 级 `dependencies` 与端点级 `require_*` 互补无遗漏（AGENTS #19 落实）；生产密钥纪律（`security.py` 拒占位值、缺省拒启）。
- **全局异常处理干净**：日志留全栈、客户端只回通用文案（`main.py:85-95`）；`get_current_user` 映射 401 前记内部 ERROR 日志（AGENTS #48 教训制度化）。
- **Ansible 语义处理正确**：false-success 守卫（rc=0 但 no hosts matched 判失败，`node_task_service.py:337-341, 843-860`）；脚本上传 UUID 存储 + 双层路径净化；中心端无 `extractall`（zip-slip 面干净）。
- **批量统计避免 N+1**：`edge_sync.batch_load_cluster_stats` 用 8 条 GROUP BY 取代逐集群查询（历史评审 v1-H2 已闭环）。
- **前端工程纪律**：生产代码 `as any` / `@ts-ignore` / console 清零属实；SSE 工程化（`createSSEClient` 泛型收敛 + `useInstallStream` 自带 AbortController 与卸载自动清理）；axios `getApiErrorMessage` 统一错误提取；vite advancedChunks 拆 vendor 缓存。
- **CORS 收敛**：默认仅 `http://localhost:12345`，可环境变量收窄，无 `*`。

## 修复优先级与执行状态

优先级：C1 → C2 → H4（三处都是"一处校验 / 一处 fail-fast"级别的低成本高收益修复）→ H3 → H2 → H1（结构性工程，单独立项）→ M1–M7 → L1–L9。

修复执行（TDD，先测试后实现，2026-09-28 当日完成）：

| 项 | 状态 | 落点 |
| --- | --- | --- |
| C1 + L6 | ✅ 已修复 | `validate_edge_uuid` 双点校验 + 删除 realpath 前缀断言 + audit 移序；测试 `test_backup_import_path_safety.py`（24 用例） |
| C2 + M1 | ✅ 已修复 | `_validate_software_list` 白名单 + playbook `\| quote` + SSH 降级 shlex.quote；脚本模式接入 `_validate_script_security`（缺省 blacklist，逃生门 `security:"none"`）；测试 `test_software_check_validation.py`（29 用例）；NodeTaskCenter 脚本模式补 security/whitelist UI |
| H2 | ✅ 已修复 | label 键 `_LABEL_KEY_PATTERN` 白名单，不匹配跳过过滤（值仍参数绑定）；测试 `test_security_review_fixes.py` |
| H3 | ✅ 已修复 | `ensure_edge_secrets_configured()`：production 且密钥缺失/仍为默认值即拒启，挂 lifespan init_db 前 |
| H4 | ✅ 已修复 | `_ensure_pg_schema`：自检失败 fail-fast RuntimeError，绝不 drop_all；仅缺列残留定向重建 |
| M2 | ✅ 已修复 | 登录失败限速（(user,ip) 内存计数，10min/5 次 → 429）+ `pwd_ver` claim（改密即吊销新签发 token；无 claim 存量 token 放行至自然过期——测试辅助离线签发约束下的有据取舍） |
| M3 | ✅ 已修复 | `STATIC_ZIP_MAX_BYTES=32m`（对齐网关 client_max_body_size）双防线（file.size 前置 + read(MAX+1) 哨兵） |
| M4 | ✅ 已修复 | SslGenerateDialog 死链改 `buildCertZip` + `downloadBlob` 本地打包（对齐 SslViewDrawer 已验证实现） |
| M5 + M6 | ✅ 已修复 | `clearSession()` 单实现（auth store 导出），logout try/finally 无条件清理，401 拦截器动态 import 复用 |
| M7 | ✅ 已修复 | 发布/删除 300s 按请求超时 + `progressTaskInFlight` 模块级互斥锁（仅改共享实现 useClusterUtils，#51③） |
| L1 / L2 / L9 | ✅ 已修复 | NodeList/ClusterNodes 定时器 onUnmounted 清理；迁移 SSE 离页 abort；loadClusters 空 catch 补 warning |
| L3 | ✅ 已修复 | /users 与 ansible-inventory 路由补 `meta.adminOnly`（守卫死代码转活） |
| L4 | ✅ 已修复 | features 加载 1+5 次有限重试，失败 `message.error` 一次后放行 |
| L5 | ✅ 已修复（后端半边） | `GZipMiddleware(minimum_size=1024)`；starlette 1.2.0 内建排除 `text/event-stream`，14 处 SSE 端点不受影响（回归 `test_gzip_middleware.py`） |
| L7 | ✅ 已修复 | users 分页 `ge=1` / `le=MAX_PAGE_SIZE(500)` |
| L8 | ✅ 已修复 | `sshpass -e` + `SSHPASS` 环境变量传递（argv 无明文；跨 spawn 点竞态为可见失败非串权限） |
| L6（audit detail） | ✅ 已修复 | 随 C1 车道 |
| H1 | ⏸ 未修复 | EdgeClient 同步 httpx 异步化——结构性工程，单独立项 |
| vite 预压缩（L5 前端半边） | ⏸ 未做 | 避免新增构建依赖，后端 GZip 已覆盖主要收益 |

终验（2026-09-28，全部车道汇合后）：后端全量 pytest **1907 passed / 12 skipped / 0 failed**；PG 方言冒烟 7/7；前端 vitest 989/990（1 例为全量负载型预存 flake，单跑 3/3 绿）、`vue-tsc -b` 0 错、eslint 0 errors（触及文件 83 warn 均为 #27 预存模板 any）。
