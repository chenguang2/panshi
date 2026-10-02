# Design: db-switch-restart-completion

## Context（排障实证，2026-10-02）

- 切换机制（D5）：`db_switch_service.perform_switch` = 校验可达 → 写配置 + `.bak` → 写 `./data/.restart.flag`；**引擎不热切换**，重启后 `init_db → check_and_rollback_startup` 清标志（可达）或回滚 `.bak`（不可达）。语义不变，本变更只做可观测性。
- 运行时引擎为模块导入期单例（`app/core/database.py:83`），重启前永远指向旧库——`/database/status` 读配置文件，因此出现「status 说 qcg、数据来自旧库」的配置态/运行态分裂。
- `develop/linux/stop.sh:20-22`：`LSOF_PID=$(lsof -ti:"$PORT")` 多 PID 时 `"/proc/$LSOF_PID/cmdline"` 成为非法路径，守卫静默失败。
- 孤儿实例证：05:19 启动的 vite（`--port 12345` 被占，自动漂到 12346），父死挂 init，stop.sh 双端口清扫覆盖不到。
- 前端 `/database/status` 消费方两处：`AppSidebar.vue`（侧栏徽标 + tooltip，spec 场景「顶栏显示当前数据库状态」的实际落点）、`DatabaseManagement.vue`（管理页当前连接展示）。
- 主 spec `start-stop-scripts` 早已要求 /proc 身份校验 + start 前 pre-start cleanup；develop/linux 实现违反之（product/linux 与 develop/windows 不在本次范围，现状不动）。

## Decisions

### D1：status 增量字段，不改切换语义
`get_status` 增加 `"pending_restart": db_switch_service.restart_flag_exists()`。不新增「运行时实际连接」字段——引擎单例由模块绑定，无可靠 introspection；`pending_restart` 已足以让用户知道「显示的连接尚未生效」。

### D2：前端两处消费方都补待重启态
- `DbStatus` 类型加 `pending_restart?: boolean`（可选，向后兼容旧响应）。
- `AppSidebar.vue`：`dbStatusLabel` 追加「（待重启）」后缀；tooltip 增加一行「切换待重启生效，数据仍来自旧库」；徽标状态点改用警示色（不改变绿/红连接状态语义，叠加橙色待重启点或文案标记，取实现最小侵入者）。
- `DatabaseManagement.vue`：当前连接卡/展示区在 `pending_restart` 时显示警示标记（如「待重启生效」徽标 + 既有重启提示文案联动）；不重复造第二条重启指引，与既有 hint（L176-179）互为引用。
- 展示文案使用中文内联（约定 #9）；无 `as any`（约定 #5）。

### D3：stop.sh 逐 PID 校验 + 路径限定孤儿清扫
- 端口清扫改为循环：`for pid in $LSOF_PID`，逐个 `tr '\0' ' ' < "/proc/$pid/cmdline"` 校验。校验模式按端口语义收紧：后端端口须含 `app.main:app`；前端端口须含 `vite` 或 `npm`（spec 只定义了后端模式，前端模式随本变更补进 spec）。
- 新增孤儿清扫（捕获漂移端口）：`pgrep -f` 两组模式——`uvicorn app.main:app`（限定 cmdline 同时含本仓库 backend 路径）与 `frontend/node_modules/.bin/vite`；命中后同样逐 PID 走 /proc 校验（双保险：pgrep 模式本身即身份校验，/proc 复核防误杀），PID 文件与端口清扫照旧先行。
- 不清扫任何无法确认属于本项目的进程；`pgrep -f` 模式必须包含仓库路径锚点，防止误杀同名无关进程（守卫测试覆盖）。

### D4：start.sh pre-start cleanup（对齐 spec 既有要求）
- 启动前后端/前端端口各做一次检测：端口空闲 → 直接启动；被**已验证**的本项目进程占用 → 先按 stop.sh 同款校验规则清理（SIGTERM 优先，兜底 SIGKILL）再启动；被**不匹配**进程占用 → 打印明确错误（进程 cmdline + 「请先运行 develop/linux/stop.sh 或手动处理」）并以非零码退出，绝不 kill。
- `BACKEND_PORT`/`FRONTEND_PORT` 支持环境变量覆盖：`BACKEND_PORT="${BACKEND_PORT:-12344}"`（stop.sh 同款），缺省行为不变，测试可用临时端口。

### D5：脚本集成测试（真实进程，哑监听替身）
`backend/tests/test_dev_scripts.py`，pytest 集成风格（subprocess + 真实端口）：
- 哑监听用 `python -c` 起临时 `http.server`；**合法后端身份**用 `exec -a` 伪造 argv0（`bash -c 'exec -a "uvicorn app.main:app --reload" python -m http.server PORT'`）使 `/proc/cmdline` 含模式串——合法身份被杀、非法身份不杀均可端到端验证。
- 用例：① 单 PID 合法身份被杀；② 多 PID（`multiprocessing` 子进程继承 socket fd）全部被杀（回归本次根因）；③ 不匹配进程不杀且端口仍活着；④ 漂移端口孤儿（vite 替身监听非 12345 端口）被 cmdline 清扫捕获；⑤ start.sh 面对不匹配占用以非零码退出且不杀目标；⑥ 环境变量端口覆盖生效。
- 测试自清理（杀哑进程、关端口）；端口从空闲 ephemeral 段选取避免撞真实服务（绝不使用 12344/12345）。

### D6：不做
- 不改 D5 切换机制（不引入引擎热切换/SSE 通知）。
- 不动 `product/linux`、`product/mac`、`develop/windows`、`develop/macos` 脚本（主 spec 对其要求不变；实现核对仅当发现同类多 PID bug 才顺手修，超出即记录不动项）。
- 不做「运行时实际连接」introspection 字段（D1）。
- status 不加缓存/推送（保持轮询现状）。

## Risks / Trade-offs

- **pgrep -f 误杀风险**：模式限定仓库路径 + 双重校验（pgrep 模式 + /proc 复核）+ 守卫测试覆盖「无关同名进程不杀」。
- **脚本测试的平台耦合**：仅 Linux（/proc 依赖），与 spec 的 Linux 场景一一对应；CI 为 Linux，可接受。
- **`exec -a` 伪造 argv0**：仅测试替身技巧，不进生产路径；若未来校验逻辑改为读 `/proc/$PID/exe` 则替身需同步调整（记录在测试注释）。
- **status 字段向后兼容**：`pending_restart` 为新增键，旧前端忽略不炸；前端类型定为可选。

## Migration Plan

无数据迁移。后端字段增量发布；脚本即时生效；前端随构建发布。切换待生效期间（flag 存在）UI 直接显示待重启态，无需过渡逻辑。

## Open Questions

无——两处修复均为主 spec 既有要求的实现合规 + 增量可观测性，无未决取舍。
