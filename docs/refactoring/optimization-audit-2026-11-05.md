# 磐石 Gateway 全面体检 — 优化机会清单（2026-11-05）

> 口径：每条区分「✅ 已核」（实读仓库代码 / git 取证，含文件行号）与「❓ 需确认」。
> 本文是体检证据 + 决策留档；执行状态见文末「执行分批与状态」。
> 安全敏感值（真实口令/IP）一律不在本文复述，指向源文件。

## 〇、已确认的环境信息（决策输入，2026-11-05 用户答复）

1. GitHub 仓库**公开**；IP 均为内网地址、外部不可达；均为**测试环境**，非真实环境。
2. SSH 口令**多机共用**（管理便利）。
3. 生产部署形态：**SQLite**。
4. 尚未部署 GitLab，**下一步迁移 GitLab**。
5. 规模上限：**18 集群 × 单集群 3 节点**。
6. 发布/迁移失败**不需要**外部告警（内网环境）。

## 一、基线强项（不重建，只补缺口）

- 权限守卫测试全覆盖；审计日志链路完整（骨架 + enrich + 查询端点）。
- 后端 1622 / 前端 1556+ 单测 + E2E；测试库全局隔离 + PG 双方言冒烟守卫。
- 发布/版本/回滚单实现（`edge_sync.publish_resource` 等）；SSE 长任务与中断恢复体系成熟。
- 前端路由全量懒加载 + vendor 分包（`vite.config.ts:38-56`）；列表端点无 N+1（`users.py:58-79` IN 批量）。
- JWT 链路完整：密钥解析链 / 占位黑名单 / 生产 fail-fast（`app/core/security.py`）；改密即吊销存量 token（pwd_ver）；登录限流 5 次/10 分钟（`auth.py` M2a）；密码强度策略（`schemas/user.py:13-23`）。
- SQL 注入面未发现：raw SQL 标识符插值全部来自模型元数据/内部常量（`migrate.py` 等），外部值均参数绑定。
- SSL 私钥列表置空 + 独立下载端点（`cluster_ssl.py:50-52,170`）。
- 全局异常处理器存在且不泄漏内部细节（`main.py:129-139`）。

## 二、逐维发现

### 1. 性能

| # | 发现 | 证据 | 级（重排后） | 处置 |
|---|---|---|---|---|
| 1.1 | 发布/删除对节点串行下发，单节点超时线性拖长整批 | `edge_sync.py:434/489` for + to_thread | ~~P2~~ → **不立项** | 单集群上限 3 节点，最坏 3×超时可接受 |
| 1.2 | 12 处 cluster_id FK 列 + sys_audit_log(created_at/user_id/resource) 无索引 | `cluster.py`×8、`ssl.py`、`static_resource.py`、`autostart.py`、`edge_import.py`、`user.py:23`、`system.py:10-17` | ~~P2~~ → **不立项** | SQLite + 小数据量全表扫描无感；未来上 PG/数据增长再启用（索引迁移通道现成：`migrate.py:415` CREATE INDEX IF NOT EXISTS） |
| 1.3 | 列表端点无 N+1 | `users.py:58-79` | 良好 | 无动作 |
| 1.4 | 首屏：路由全懒加载 + vendor 双 chunk | `vite.config.ts:38-56` | 良好 | 无动作 |
| 1.5 | PG 连接池无 pool_pre_ping/pool_recycle | `database.py:63` | ~~P2~~ → **P3 转未来** | 生产 SQLite；上 PG 时一并补 |

### 2. 架构与代码质量

| # | 发现 | 证据 | 级 | 处置 |
|---|---|---|---|---|
| 2.1 | 全局异常处理存在、不泄漏 | `main.py:129-139` | 良好 | 无动作 |
| 2.2 | SSE 事件格式规格与实现分歧未收敛 | AGENTS.md #45 | P2 | 改 SSE 前先裁决方向（backlog） |
| 2.3 | 模板层 ~474 处 any warn 存量 | AGENTS.md #27 | P2 | 维持增量治理裁决，不开专项 |
| 2.4 | 创建类端点幂等（唯一约束覆盖面） | 未逐个核查 | ❓ 需确认 | 暂挂 |
| 2.5 | AGENTS.md #29「async 引擎未挂 pragma」已过时 | `database.py:64-69` 已修（M26） | P3 | 批次 A 同步修正 |

### 3. 安全

| # | 发现 | 证据 | 级（重排后） | 处置 |
|---|---|---|---|---|
| 3.1 | **真实 SSH 凭据入库且推公开仓库**：`inventory/gateways` 被 git 跟踪（含 jboss 明文口令，与 `inventory/host` 各节点共用）；`inventory/host` 已 ignore 但**历史中存在**（f842e657 等）；remote 为公开 GitHub | `git ls-files backend/ansible/inventory/`；`git log --all -- inventory/host` | ~~P0~~ → **P1 卫生级**（依据：内网 IP 外部不可达 + 测试环境 → 撤销「立即轮换」；但公开仓库凭据会被扫描机器人采集） | 批次 A：gateways 出库 + ignore；历史清洗（filter-repo）**暂缓**，等确认无他人 clone 依赖。**铁律：多机共用口令的习惯不得带进未来真实环境** |
| 3.2 | 默认口令 panshi123 无首登强制改密（该口令随 AGENTS.md 亦公开可知） | `seed.py:15` | ~~P1~~ → **P2** | 批次 D 立项（openspec）：首登检测默认口令强制改密 |
| 3.3 | 认证链路其余项良好 | security.py / auth.py | 良好 | 无动作 |
| 3.4 | SSL 私钥下载走 HTTP 明文与否 | `cluster_ssl.py:170` | ~~P2~~ → **P3** | 内网 HTTP 属既定形态；上 TLS 时再议 |
| 3.5 | token 存 localStorage + 无 CSP | `stores/auth.ts`、无 CSP 头 | ~~P2~~ → **P3** | 内网工具，backlog |
| 3.6 | SQL 注入面未发现 | 全仓 raw SQL 审计 | 良好 | 无动作 |
| 3.7 | 无依赖漏洞扫描 | pyproject/package.json 无 pip-audit/npm audit | P2 | 随 CI 加一行定时任务 |
| 3.8 | 已接受残余风险 | AGENTS.md #44/#10 | — | 勿重复立项 |

### 4. 可靠性

| # | 发现 | 证据 | 级 | 处置 |
|---|---|---|---|---|
| 4.1 | 发布/回滚单实现、中断恢复、迁移锁、启动回滚、relay TTL 兜底 | 多处 | 强基线 | 无动作 |
| 4.2 | **集群资源无配置漂移检测**（relay 域已有 push_drift 快照差集范式，`relay.py:143+`；路由/上游/插件无「平台 vs Edge 运行态」对比，旁路 curl 改 Edge 平台无感知） | relay 范式可复用 | ~~P1~~ → **P2 立项候选** | 批次 D：openspec 先行（ConfigVersion 快照 + Edge GET diff 只读端点 + UI 差异视图） |
| 4.3 | 无「仅重试失败节点」（全量幂等 PUT 可接受） | `edge_sync.py` | ~~P2~~ → backlog | — |

### 5. 可用性与提示语

| # | 发现 | 级 | 处置 |
|---|---|---|---|
| 5.1 | 三层弹窗、空态、中文转译、401 toast 去重、迁移锁横幅 | 良好（`api/index.ts:14-63`） | 无动作 |
| 5.2 | 新手视角 UI 走查缺失（术语一致性/校验时机/提示可行动性） | P2 backlog | 任务清单式走查后再定 |

### 6. 可观测性

| # | 发现 | 证据 | 级 | 处置 |
|---|---|---|---|---|
| 6.1 | **应用日志全局 WARNING 级、无滚动、无请求关联** | `main.py:11-17` | **P1** | 批次 C：INFO + RotatingFileHandler + request_id 中间件/Filter |
| 6.2 | 审计无保留策略（detail 含配置全文，只增不清） | `system.py` | P2 backlog | 复用 db_archive 体系做保留期 |
| 6.3 | 无应用侧指标（请求延迟/错误率/慢查询） | 全仓无 prometheus/metrics | P2 backlog | — |
| 6.4 | 无告警通道 | — | ~~P2~~ → **取消** | 用户确认不需要（内网） |

### 7. 工程化

| # | 发现 | 证据 | 级 | 处置 |
|---|---|---|---|---|
| 7.1 | **无 CI**：1472 提交、1622+1556 用例无自动执行入口（无 .github/workflows / Jenkinsfile / .gitlab-ci.yml；husky 仅 lint-staged） | 根目录取证 | **P1**（落点明确：GitLab） | 批次 B：预置 `.gitlab-ci.yml`（pytest sqlite + vitest 串行 `--no-file-parallelism` + vue-tsc -b），迁移即生效；E2E 暂不进 CI（需浏览器环境） |
| 7.2 | 测试隔离与双方言体系化 | conftest / PG 六铁律 | 强资产 | 无动作 |
| 7.3 | 无覆盖率度量 | — | P2 | 接 CI 后顺手 |

## 三、重排后优先级总表（含降级依据）

| # | 事项 | 原→新 | 依据 |
|---|---|---|---|
| 1 | 仓库卫生：gateways 出库 + ignore（洗史暂缓） | P0→P1 | 公开仓库但内网不可达 + 测试环境 |
| 2 | GitLab CI 预置 | P1 | 下一步迁移 GitLab |
| 3 | 日志 INFO + 滚动 + request_id | P1 | 排障基础设施，与部署无关 |
| 4 | 默认口令守卫（首登强制改密） | P1→P2 | 测试环境；openspec 立项 |
| 5 | 资源配置漂移检测 | P1→P2 | 产品能力；openspec 立项 |
| 6 | AGENTS.md #29 同步 | P3 | 元规则，随批次 A |

**出局留档**：1.1 串行发布、1.2 索引（18×3 规模 + SQLite 不构成瓶颈）；1.5 池保活（转上 PG 时）；3.4/3.5（内网 HTTP 形态）；6.4 告警（用户取消）；3.7 随 CI；6.2/6.3/4.3/5.2/2.2 → backlog。

## 四、执行分批与状态

- 批次 A（卫生）：gateways `git rm --cached` + .gitignore + AGENTS.md #29 同步 — **进行中**
- 批次 B（CI）：.gitlab-ci.yml 预置 — 待做
- 批次 C（日志）：main.py 日志改造 + AGENTS.md 日志位置条目同步 — 待做
- 批次 D（立项，openspec 先行、批准方案再动码）：默认口令守卫 + 漂移检测 — 待用户排期
- 洗历史（filter-repo）：**显式暂缓**，触发条件 = 确认无他人依赖现有 clone

## 五、遗留需确认

1. 创建类端点唯一约束覆盖面（2.4）——逐资源核查后再定。
2. ClickHouse 指标查询的时间范围/limit 强制（1.6）——抽查后再定。
3. 未来真实环境部署前的安全前置清单（口令独立、TLS、token 策略、PG 池保活）——届时按本文 3.4/3.5/1.5 启用。
