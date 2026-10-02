# Proposal: db-switch-restart-completion

## Why

2026-10-02 实测排障：管理员执行数据库切换（`sqlite_test` → 新建连接 `qcg`）后，页面数据毫无变化，且界面「当前连接」已显示为新库，形成配置态与运行态不一致的误导。根因链：

1. **切换按 D5 设计本就需重启生效**（写配置 + `.restart.flag`，引擎不热切换），前端也有提示文案；但 `GET /database/status` 只读配置文件，`.restart.flag` 存在（切换待生效）时**不返回任何待重启信号**——页面与侧栏徽标都把「待生效配置」当「已生效连接」展示。
2. **用户按提示重启失败且无反馈**：`develop/linux/start.sh` 重复执行不检测旧实例，新 uvicorn 直接 `Address already in use` 暴死；旧进程继续供数，用户无从得知重启没成功。
3. **`develop/linux/stop.sh` 身份校验守卫失效**：`lsof -ti` 返回多 PID（如 uvicorn reloader + worker 共享 socket）时，脚本把 "PID1\nPID2" 拼进单个 `/proc/$PIDS/cmdline` 路径，守卫必然失败 → `kill -9` 永不执行——违反 `start-stop-scripts` 主 spec 既有要求（/proc 身份校验）。
4. **端口清扫盲区**：stop.sh 只扫 12344/12345；旧 vite 因端口被占漂移到 12346 后成为孤儿（父进程死后挂在 init 下），stop.sh 永远清不到。

影响：数据库切换的「切换 → 重启 → 生效」闭环对用户不可观测、不可靠完成；同一误导会在每次切换后复现。

## What Changes

**修复 1 —— 切换待重启态可观测（backend + frontend）**

- `GET /database/status` 响应新增 `pending_restart: bool`（= `db_switch_service.restart_flag_exists()`）
- `DatabaseManagement.vue` 当前连接展示与 `AppSidebar.vue` 数据库徽标：`pending_restart` 为真时显示「待重启生效」标记（徽标文案 + 提示），不再把待生效连接当作已生效连接展示
- 前端 `DbStatus` 类型同步补字段

**修复 2 —— 开发启停脚本可靠性（develop/linux）**

- `stop.sh`：修复多 PID 守卫（逐 PID 校验 `/proc/$PID/cmdline`）；新增命令行匹配的孤儿清扫（限定本项目路径的 `uvicorn app.main:app` 与 frontend vite 进程，捕获漂移端口进程），身份校验规则不变（不匹配不杀）
- `start.sh`：启动前按 spec 既有要求做 pre-start cleanup——端口被本项目已验证进程占用时先清理再启动；被**不匹配**进程占用时拒绝启动并给出明确指引（先 `stop.sh`），不再 EADDRINUSE 暴死
- 两脚本的端口变量改为可被环境变量覆盖（可测性；缺省值不变 12344/12345）
- 新增 `backend/tests/test_dev_scripts.py` 集成测试：真实哑监听进程验证单 PID / 多 PID（fd 继承）/ 不匹配不杀 / 漂移端口孤儿清扫 / start.sh 拒绝不匹配占用

## Capabilities

### Modified

- `database-management`：「当前数据库状态展示」需求补 pending_restart 接口字段与页面/侧栏展示场景
- `start-stop-scripts`：「Stop script process verification」补多 PID 与漂移端口场景；「Start script pre-start cleanup」覆盖 develop/linux 并明确不匹配占用时拒绝启动

## Impact

- 后端：`backend/app/api/v1/database.py`（status 端点 +1 字段）
- 前端：`frontend/src/api/database.ts`（类型）、`frontend/src/components/AppSidebar.vue`（徽标）、`frontend/src/views/DatabaseManagement.vue`（当前连接展示）
- 脚本：`develop/linux/stop.sh`、`develop/linux/start.sh`
- 测试：`backend/tests/test_dev_scripts.py`（新增）、既有 database status 测试补断言、AppSidebar / DatabaseManagement 相关 vitest
- 风险：低——status 为纯增量字段；脚本行为向主 spec 既有要求对齐；不改切换机制本身（D5 语义不变）
