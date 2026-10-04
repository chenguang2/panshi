# 磐石 Gateway 全量代码审查报告（2026-10-04）

> 触发：用户下达五维全量审查（FastAPI 后端 / Vue 前端 / Ansible 自动化 / 数据库层 / 系统架构），明确选择「全量新生成」而非基于既有治理记录的增量复核。
> 方法：4 条并行 @oracle 只读审查泳道（路由层 / 服务层 / 前端 / Ansible+DB）+ 编排者第 5 维（架构集成）合成。每泳道注入本仓有意设计清单防误报。
> 可信度：编排者对泳道可机检断言抽验 **22 项，21 项实锤、1 项部分核**（users.py 降权保护，仅确认 admin 门控在位）。行号可信。
> 本报告与既有记录的关系：ux-review-2026-10-04（UX 专项）、static-analysis-2026-09-16（死代码）、test-suite-consolidation-2026-09-12 互不替代；本报告为五维全量代码质量与安全审计。

## 一、总览

| 级别 | 原始计数 | 去重后 | 说明 |
|---|---|---|---|
| 🔴 严重 | 6 | **5** | edge_import test_connection 被 ora-1/ora-2 双报，合并 |
| 🟠 中等 | 28 | **28** | 无跨泳道重复 |
| 🟡 建议 | 35 | **34** | nodes.py 内存排序被 ora-1/ora-4 双报，合并 |
| ⚪ 既有约定·残余风险 | 1 | 1 | 清单明文密码（约定 #10），仅评述外溢面 |
| ✅ 已核未发现 | — | 15+ 子维度 | 见下 |

**已核未发现**（泳道明确核查过并给出阴性结论的高价值维度）：SQL 注入（api/v1 全量参数化）、CORS、鉴权覆盖（无裸奔端点）、N+1（列表端点全走 IN+GROUP BY 批量）、relay playbook 幂等性、edge_autostart 状态解析、db_config Fernet 机制（API 永不回显密文）、备份策略、conftest 双引擎隔离、develop 脚本进程身份校验、前端 v-html 消毒链（9 用点逐一定性）、路由守卫三层校验、Pinia 状态管理、生产代码 `as any`/`@ts-ignore` 清零确认。

## 二、🔴 严重（5，去重后）

### S1 部署密钥链：占位密钥绕过检测静默生效
`deployment/panshi-backend.service:11` + `backend/app/core/security.py:11-14`
unit 自带 `Environment="JWT_SECRET_KEY=your-production-secret-key"`，而 `_PLACEHOLDER_SECRETS = {"your-super-secret-key-change-in-production", "your-production-secret-key-must-be-changed"}` **不含该串**；unit 又未设 `APP_ENV=production`，fail-fast 不触发。该密钥同时是 JWT 签名密钥与 db_config **Fernet 密钥**（约定 #20）——仓库读者可伪造 admin token、解密 db_config.json 中全部 PG 密码。
**修复**：① 占位变体入黑名单；② unit 补 `APP_ENV=production`；③ 密钥改走 `EnvironmentFile=/etc/panshi/secrets.env`（0600），模板不含任何真实/占位值。
**验证**：✅ 编排者实锤（unit 11 行原文 + 黑名单实容比对）。

### S2 edge_import 模块三连：事件循环阻塞 + 事务违例（全仓唯一残留的假 401 事故土壤）
`backend/app/api/v1/edge_import.py:32` + `backend/app/services/edge_import_service.py:877-878,1093-1094,85-128`
① `test_connection()`（8 次串行 httpx）、`preview_import`/`execute_import` 内 `fetch_edge_data()`（7 次同步 httpx，单次 30s 超时）均为同步方法在 async 端点**裸调**，全程冻结事件循环（含 /health），最坏数分钟；② `create()` 的 SELECT 触发审计骨架 autoflush 持 SQLite 写锁 → 长网络 IO 期间不结束事务 → 并发写 `database is locked` 被吞成**假 401/500**（与 2026-09-22 中继事故同型，违反 #29 范式）。
**修复**：三处统一 `await asyncio.to_thread(...)`；execute/preview 端点调 service 前 `await db.commit()` 落审计骨架（参照 relay_init.init_region）。
**验证**：✅ 编排者实锤（三处裸调原文 + SELECT→fetch 序列确认）。

### S3 数据库连接测试伪异步：wait_for 超时形同虚设
`backend/app/api/v1/database.py:292-308`
`_do_test` 协程体内全程同步 `engine.connect()`，无任何 await 点 → `asyncio.wait_for(timeout=3.0)` 永远无法生效，PG 不可达时事件循环阻塞可达分钟级（OS TCP 超时）。
**修复**：`return await asyncio.to_thread(_do_test_sync, conn)`（同仓正确范式：clickhouse_config.py:123-143）。
**验证**：✅ 编排者实锤（协程体原文）。

### S4 批量分发假成功：守卫存在但被批量路径旁路
`backend/app/services/node_task_service.py:1053-1057`
主机不在清单时 ansible 以 rc=0 退出（#21②），`_parse_distribute_results` 把所有节点标成功（`if overall_rc == 0: nr["success"] = True`）。单节点腿的 `_ansible_false_success_error` 守卫（:892）被批量腿（692-704 直接调 `run_playbook`）绕过——「文件未送达却报成功」的数据完整性缺陷，直接违背已固化约定。
**修复**：批量腿复用 `_ansible_false_success_error(result)`，非 None 时按全体失败落库。**架构教训**：守卫应下沉到 `run_playbook` 出口而非调用侧（同类旁路见 M6 raw_delete）。
**验证**：✅ 编排者实锤（1053-1057 原文）。

### S5 （并入 S2 计数说明）edge_import 事务违例单列于 ora-2，与 S2 ② 同源同修。

## 三、🟠 中等（28）

### 后端·路由与核心（ora-1，8 项）
| # | 位置 | 问题 | 修复方向 |
|---|---|---|---|
| M1 | cluster_edge_env.py:107-175（同 cluster_install.py:337、edge_autostart.py:145） | SSE 长流交出前未 `db.commit()`：审计骨架写锁横跨整个 ansible 部署期（每节点 120s），并发写假 401——违反 #29 已在 relay 修过的范式 | 返回 StreamingResponse 前加 `await db.commit()`，对齐 relay.py:162 |
| M2 | cluster_edge_env.py:246-268 | read-stream 同一节点 playbook 跑两遍（`_run_ansible_stream` 展示 + `generic_run` 取 stdout），双倍 SSH/时长 | 流内累积行拼 content 或让流产出结构化终态 |
| M3 | cluster_edge_env.py:297-332 | `/edge-env/deploy/logs` 把 `f"task_{task_id}"` 当 env_content 写进节点 edge.env；前端零调用方，遗留危险死端点 | 删除该端点 |
| M4 | system.py:25,242,296 | `_export_tasks` 进程内字典只增不减，每次导出最多 5 万行 CSV/xlsx 全文驻留内存 | 落盘 data/exports/{task_id} + 清扫策略 |
| M5 | core/db_config.py:49-53 | `_fernet()` 自行 `os.getenv` 兜底**公开占位串**而非复用 security 解析结果：开发/未设 APP_ENV 部署下数据库连接密码用公开常量加密，违背 #20 同源契约 | `from app.core.security import JWT_SECRET_KEY` 单源引用，删占位兜底 |
| M6 | core/features.py:55 | `_FEATURES_PATH = Path("features.yaml")` CWD 相对，非 backend 目录启动时特性开关静默失联 | 对齐 BACKEND_ROOT 锚定（T4 族） |
| M7 | api/v1/database.py:474 | 迁移备份目录 `Path("./data/backups")` CWD 相对，与同文件 `_archive_output_path()`（`__file__` 锚定）不一致 | 复用同款 `__file__` 推导 |
| M8 | cluster_static_resources.py:392,470 | 32MB zip 在事件循环内同步读写（open().read()/write()） | `await asyncio.to_thread(Path(...).read_bytes)` |

### 后端·服务层（ora-2，8 项）
| # | 位置 | 问题 | 修复方向 |
|---|---|---|---|
| M9 | services/edge_client.py:676-687 | `raw_delete` 不带 `X-Edge-Target`（raw_put 带），中继模式静态资源删除打到网关默认 vhost 404 | 复用 raw_put 中继头逻辑——守卫下沉 EdgeClient 出口 |
| M10 | services/db_switch_service.py:38-45,65 | `_verify_reachable` 同步引擎 SELECT 1 裸跑 async 内，目标不可达阻塞事件循环数十秒 | `await asyncio.to_thread(...)` |
| M11 | services/node_task_service.py:154-168 | `retry_task` 不查 `_running[task_id]` 存活即覆盖新建任务，运行中重试=双执行 | 入口存活检查，运行中抛错 |
| M12 | services/ansible_service.py:1035-1046 | wait_for 超时只取消 await，ansible 线程继续跑（未 arm cancel_callback）；超时报错文案用 `_job_timeout` 而非 `effective_timeout` | 超时分支置位 cancel_event；文案改 effective_timeout |
| M13 | services/relay_sshd.py:32-64 | `_CRED_BACKUP` 按 IP 单值，共享网关跨区域并发 sshd-setup 时备份覆盖、restore 互写对方注入的 root 凭据 | 备份改计数栈（注入++/restore 弹出）或进程级互斥 |
| M14 | services/ansible_service.py:235-280 | `_run_subprocess(_stream)` 无取消 kill：node_task 超时取消后 ssh 子进程成孤儿 | 参照 db_backup `_run` 的 CancelledError→proc.kill() 范式 |
| M15 | services/db_backup_service.py:756 | `_app_version_info()`（git subprocess 10s）在 async 参数位置求值跑事件循环 | 并入 to_thread 块 |
| M16 | relay_init.py:114 / relay_push.py:208 / relay_sshd.py:181 | 三处 `_run_ansible_*` 不传 job_timeout，ansible 挂起→SSE 永挂；sshd 腿挂起期间 root 凭据承诺被打破 | 统一 `job_timeout=1800` 上界；sshd 补启动清扫（连 M19） |

### 前端（ora-3，4 项）
| # | 位置 | 问题 | 修复方向 |
|---|---|---|---|
| M17 | views/EdgeClient.vue:1011（全文件 2258 行） | 全仓最重类型债+规模孤岛：11 类集群子资源 CRUD 未迁 composable 工厂，69 处 any | 按 useClusterResource 工厂逐资源迁移（类型已在 @/types） |
| M18 | 多文件（分布见证据） | 生产代码显式 `: any` 共 **395 处**（非模板层），约定 #27 口径只覆盖 `as any` 断言，显式 any 是独立债务 | 不开专项；口径改准确 + 新代码 review 挡脚本层 any |
| M19 | composables/useClusterUtils.ts:572-574 | `executePublish` catch 手写 detail 解析，未用 `getApiErrorMessage`（不支持 detail 数组） | 改 `addLog(\`❌ 发布失败: ${getApiErrorMessage(error)}\`)`（同文件 696 已是正确写法） |
| M20 | ClusterFormModal.vue:302 等 ~25 处 | 错误归一化收敛不完整：~25 处手写 `error.response?.data?.detail \|\| ...`，detail 为数组（422）时 UI 显示异常 | 分批替换 getApiErrorMessage；优先 ClusterFormModal/UserList |

### Ansible+DB（ora-4，8 项）
| # | 位置 | 问题 | 修复方向 |
|---|---|---|---|
| M21 | ansible_service.py:216 + artifacts | SSHPASS 设全局 os.environ 从不清除 + ansible-runner 把父环境持久化进 artifacts：实测 1 个 run 的 command 文件含明文 SSH 密码、342 个含 JWT_SECRET_KEY；1182 run/83MB 无清理 | 子进程级 env 注入（create_subprocess_exec env=）；artifacts 保留策略；启动清扫历史 |
| M22 | relay_sshd.py:104-106,196-198 | root 凭据还原只靠进程内存 `_CRED_BACKUP` + finally，SIGKILL/断电则 root 密码永久残留 gateways 文件 | 注入行打标 `# panshi-injected`，启动时扫描清扫（连 M16③） |
| M23 | ansible/inventory/gateways（实测 644） | 网关清单含明文密码+临时 root 凭据但全局可读（host 已 600，gateways 漏加固） | chmod 600 + 写回后显式 os.chmod(0o600) |
| M24 | api/v1/cluster_nodes.py:99-122 | 节点直连 ansible 操作（nginx 启停/edge_statistic）缺假成功守卫，节点不在清单 rc=0 即成功甚至置 status=1 | 假成功守卫下沉 run_playbook 出口（连 S4） |
| M25 | roles/edge/tasks/master_copy_to_slaves.yml:12-16 | 分发腿 `failed_when: false` 吞 copy 失败 → 磁盘满/权限时假成功 | 删 failed_when: false |
| M26 | api/v1/clusters.py:334-380 | 删集群手动清理漏 4 张子表（static_resource/user_cluster/import_log/node_autostart）；async SQLite 无 FK pragma，孤儿行仅 SQLite 产生、PG 靠 CASCADE → 双库行为分叉 | 优选：async 引擎挂 sqlite connect 事件 `foreign_keys=ON`，两库收敛 CASCADE 语义 |
| M27 | core/migrate.py:82-83 | `PRAGMA foreign_keys=OFF` 在隐式事务内执行是 SQLite 文档明确的 no-op → 表重建期 FK 实际仍开，DROP 旧表连坐删子表行**〔2026-10-04 勘误：不成立，实证见文末〕** | pragma 提前 + AUTOCOMMIT 连接执行 |
| M28 | models/cluster.py:128-138 | ps_config_version 无 (cluster_id,resource_type,resource_id) 索引；每次发布插一行永不清理，全部列表页 GROUP BY 聚合——全库增长最快表逐步退化为顺序扫描 | 模型加 Index + `_ensure_index` 补建；评估版本保留策略 |

## 四、🟡 建议（34）

### 后端·路由与核心（ora-1，13 项）
1. deps.py:34 等 30+ 处 `request: Request = None` 误导性默认值（FastAPI 总是注入）——去掉 `= None`
2. dashboard.py:85 `limit: int = 10` 无 ge/le，负值 SQLite 下等同无限制——`Query(10, ge=1, le=200)`
3. users.py:117-138 可把唯一管理员降权 viewer，无 last-admin/自身保护（编排者部分核：admin 门控在位，降权保护未逐行核）
4. routes.py:190 `get_routes_by_edge_uuids` 未按 UserCluster 过滤（对比同文件 list 收敛逻辑），持权限者可按 uuid 探测任意集群路由
5. nodes.py:114 全表载入 Python 排序分页（跨库数值 IP 排序的已权衡取舍）——加规模上限预警注释（与 ora-4 双报合并）
6. node_tasks.py:490 任务行已提交后才校验脚本存在，400 后残留幽灵任务——校验前移
7. clickhouse_config.py:173 等 三端点连续两次 `await db.commit()` 空转——删重复行
8. db_backup.py:138 等 `payload: dict` + 手工校验丢失 OpenAPI/标准 422——直接声明 Body 模型
9. cluster_export.py:371 openpyxl 全量构建跑事件循环 + :24 死导入 log_audit——to_thread + 删
10. edge_client.py:109-621 30+ handler 同一 try/except 模板复制且 `db` 注入未用——抽统一异常映射帮护函数
11. relay.py:48-54 `_INFLIGHT` 依赖生成器被迭代才释放；响应前断连则区域占位永久泄漏（后续恒 409）——占位带时间戳 + acquire 清扫超龄
12. metrics.py:47 latency_type 等自由字符串直传拼查询——`Literal[...]` 收口
13. schemas v1 `class Config` 与 v2 `model_config` 混用——统一 ConfigDict

### 后端·服务层（ora-2，8 项）
14. ansible_service.py:596-646 `_inventory_inject/restore_ssh` 生产零调用死代码且带备份覆盖竞态——删除
15. node_task_service.py:963 恢复中断任务只标 NodeTask failed，item 永停 "running"——同批 UPDATE item
16. node_task_service.py:294 `_node_locks` 永不回收——注释有界前提或 weakref
17. node_task_service.py:1009 build_cmd destpath/prefix 未加引号拼 shell（管理员可控，纵深防御）——shlex.quote
18. edge_logger.py SM4 key 与 edge_client 重复定义 + LOG_DIR 相对 CWD + 无轮转 + async 路径同步写——单点常量 + `__file__` 锚定 + RotatingFileHandler
19. db_migration_service.py:205-216 migrate_direct 异常路径引擎不 dispose——finally 补 try/except dispose
20. metrics_service.py:225-287 window_sec f-string 进 SQL 与绑参风格混用——统一绑参
21. edge_import_service.py:115 EDGE_ADMIN_KEY 默认值两处硬编码——单点定义

### 前端（ora-3，7 项）
22. PluginSwitches.vue:278-280 v-html 拼接段 refs（type/count）未过 escapeHtml（深度防御对齐）
23. NodeExecutionResultDrawer.vue:298 onOverlayClick 死代码（模板遮罩未绑 @click.self）——补绑定或删
24. CentralList.vue:676-705 ↔ ClusterList.vue:230-263 relay 徽章计算 ~40 行逐字复制——抽 useRelayRouteBadge()
25. stores/auth.ts:17,32 JWT 存 localStorage（XSS 组合风险，消毒链已全量覆盖，暴露面可控）——已知权衡，可评估 httpOnly cookie/短过期
26. GlobalSearch.vue:52 搜索索引未按权限过滤（守卫会弹回，UX 不一致非越权）——按 meta.permission 过滤
27. router/navMeta.ts:9-40 sectionMap 漏登 SslList——面包屑/搜索分组空串；1 行修复 + 一致性单测
28. useClusterUtils.ts:135 `onClose: close` 死事件（AppModal 只 emit update:open/ok/cancel）——删

### Ansible+DB（ora-4，7 项）
29. models 四处 FK 列无索引（route_plugin.route_id、upstream_target.upstream_id、node.cluster_id、ssl.cluster_id）——index=True + _ensure_index
30. deployment unit：后端 root 运行绑 0.0.0.0:8000 无 systemd 加固——专用用户 + NoNewPrivileges/ProtectSystem + 127.0.0.1
31. ansible.cfg:3 主机密钥校验全域关闭——至少密码腿保留已知主机缓存
32. db_switch_service.py:22 `.restart.flag` CWD 相对（T4 族）——BACKEND_ROOT 锚定
33. upgrade_edge.yml:28-45 pack-list 输出解析脆弱 + shell 任务无 changed_when——稳定分隔标记 + changed_when: false
34. gen-linux.sh:216-228 拷 db_config.json 不带 data/.jwt_secret → 目标机首启重新生成密钥、已拷贝加密密码全部不可解（静默返回 ""）——随包拷贝（0600）或打包失败提示
35. migrate.py 自研迁移边界评述：单向不可回滚（备份兜底成立）、_add_column 失败仅 warning 静默漂移——建议加「模型 vs 实际 schema 差异自检」端点

## 五、既有约定·残余风险（不修，登记）

- 清单明文密码（#10）：host 600 + 平台清单走密钥；增量仅指外溢面（M21 artifacts、M23 gateways 644）
- 命令逐行校验不拦 shell 间接执行（#44）：文档已标注
- SSHPASS 并发竞态：代码注释已声明「认证失败可见报错，不会静默串权限」

## 六、跨泳道主线（架构集成维度，编排者合成）

**T1 事件循环违规族（6 处，含 3 严重）**：伪异步 wait_for（S3）、同步网络 IO 裸调（S2）、同步引擎探活（M10）、大文件同步 IO（M8）、git 探测参数位求值（M15）、openpyxl CPU 密集（建议 9）。全部为本仓历史事故类别（#29/#31），修法统一 `asyncio.to_thread`。**共同根因：无「事件循环纯度」守护测试**。
**T2 守卫存在但被旁路族（3 处，含 1 严重）**：批量分发绕过假成功守卫（S4）、raw_delete 绕过中继头（M9）、节点 nginx 操作绕过（M24）。**架构教训：共享守卫必须挂在共享出口（run_playbook / EdgeClient.raw_*），调用侧检查只作冗余**。
**T3 「进程活着 + 运维改模板」隐含假设族（5 处，含 1 严重）**：占位密钥绕过（S1）、SSHPASS/artifacts 永留（M21）、崩溃后 root 凭据残留（M22）、gateways 644（M23）、打包缺密钥（建议 34）。安全边界普遍依赖两个隐含假设，进程一死或模板一贴默认值即显形。
**T4 CWD 相对路径族（4 处残留）**：features.py（M6）、database.py 备份目录（M7）、db_switch restart flag（建议 32）、edge_logger LOG_DIR（建议 18）——与 2026-10-04 刚修的 db_config 同类，宜一次专项清零。
**T5 前端「工具已建、采用过半」族**：getApiErrorMessage 收敛断层（M19/M20）、EdgeClient 未迁工厂（M17）、navMeta 漂移（建议 27）。
**T6 DB 增长与索引**：ps_config_version 无索引无 retention（M28）、FK 列索引缺 4 处（建议 29）、async 引擎无 FK pragma 致双库行为分叉（M26）。

## 七、优先修复清单

**P0（严重，建议立即立项）**
1. S1 部署密钥链（黑名单 + APP_ENV + EnvironmentFile，改动极小，消除 token 伪造+Fernet 双暴露）
2. S2 edge_import 三连（to_thread ×3 + 前置 commit，消除整进程冻结 + 全仓最后一块假 401 土壤）
3. S3 database test 伪异步（to_thread 一处）
4. S4 批量分发假成功（守卫一行 + 下沉 run_playbook 出口）

**P1（高价值中等，建议第二批）**
5. M21+M23 SSHPASS 子进程级注入 + artifacts 保留策略 + gateways 600（凭据落地面三合一）
6. M1 SSE 前置 commit（edge_env/autostart/install 三处，对齐 relay 范式）
7. M5 Fernet 密钥源统一 security.JWT_SECRET_KEY（连 S1 构成密钥链单源）
8. M9 raw_delete 补 X-Edge-Target（中继区域静态资源删除必败）
9. M27 migrate.py PRAGMA AUTOCOMMIT（表重建连坐删风险）
10. M26 async 引擎 FK pragma（双库语义收敛 + 删集群孤儿行）

**P2（择机）**：M28 版本表索引+retention、M11-M16 服务层并发/超时族、M19/M20 前端错误归一化收尾、M17 EdgeClient 迁移、T4 路径锚定专项。

## 八、架构改进建议

1. **守卫下沉共享出口**：假成功守卫进 `run_playbook`、中继头进 `EdgeClient.raw_*` 底层——杜绝「新路径绕过旧守卫」类回归（本轮 3 例实证）。
2. **密钥单源**：JWT_SECRET_KEY 解析结果单点导出，db_config/_fernet、deployment、打包脚本全部引用同源；占位黑名单与 fail-fast 覆盖所有部署模板。
3. **路径锚定专项**：BACKEND_ROOT/__file__ 锚定一次清零 T4 族 4 残留，可加「CWD 相对 Path() 出现即 lint 告警」源码守卫。
4. **事件循环纯度守护**：无法静态保证，但可把「async 端点内裸调已知同步方法（fetch_edge_data/test_connection/_verify_reachable 清单）」写成源码模式守卫测试，新增违例即红。
5. **工件保留策略统一**：artifacts（1182 run/83MB）、_export_tasks 内存驻留、版本表增长——统一「保留 N 份/天 + 启动清扫」模式（db_backup cleanup_retention 已是范本）。
6. **崩溃自愈**：临时凭据注入全部打标（`# panshi-injected`），启动扫描清扫——把「跑完即还原」升级为「崩溃也可还原」。

## 附录：泳道原报告

四条泳道完整原报告（含逐条代码证据片段）存于本次会话记录；本报告为其去重合成版，所有行号经编排者抽验（22 项 21 实锤）。

## 勘误（2026-10-04，P1 修复期实证）

- **M27（migrate.py PRAGMA 事务内 no-op）不成立**：TDD 行为测试（`tests/test_code_review_p1.py::TestM27MigratePragma`）与驱动层探针实证——SQLAlchemy 2.0 pysqlite 方言对隐式事务不发 driver 层 BEGIN（defer-to-DML），:83 的 `PRAGMA foreign_keys=OFF` 执行时仍处 autocommit 态、实际生效；表重建后引用表（ON DELETE CASCADE 子行）幸存。行为测试留作不变量守卫（未来 SA 升级改变 defer 行为时变红）。不修代码，原条目撤回。
- **M26 取「优选」半**：async 引擎挂 `_configure_sqlite_connection`（WAL/FK/busy_timeout）已落地；报告同条提到的「删集群手动清理补 4 张子表」未随批做（FK=ON+CASCADE 后孤儿行不再产生，手动清理清单留作 P2 加固项）。
