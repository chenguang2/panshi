# Tasks: db-switch-restart-completion

> TDD 推进：先写失败测试（RED）验证失败，再最小实现（GREEN）。组内可并行，组间按序。

## 1. 组 1 — 后端 pending_restart（修复 1 后端）

- [x] 1.1 （TDD）新增/扩展 `backend/tests/` 中 `/database/status` 用例：创建 `db_switch_service.RESTART_FLAG_PATH` 文件 → 断言 `pending_restart is True`；删除 → 断言 `False`（用 `tests/api_helpers.py` 鉴权 client 惯例）
- [x] 1.2 `app/api/v1/database.py::get_status` 响应增加 `"pending_restart": db_switch_service.restart_flag_exists()`；跑 1.1 转绿
- [x] 1.3 跑 `uv run pytest tests/ -k "database or status" -q` 确认既有用例零回归

## 2. 组 2 — 前端待重启态展示（修复 1 前端）

- [x] 2.1 （TDD）`AppSidebar` 相关 vitest：mock status 返回 `pending_restart: true` → 断言徽标文案含「（待重启）」、tooltip 含「数据仍来自旧库」；false → 不含
- [x] 2.2 （TDD）`DatabaseManagement` 相关 vitest：`pending_restart: true` → 当前连接展示区出现「待重启生效」警示标记；false → 不出现
- [x] 2.3 `frontend/src/api/database.ts` 的 `DbStatus` 类型补 `pending_restart?: boolean`
- [x] 2.4 `AppSidebar.vue`：`dbStatusLabel` 追加「（待重启）」、tooltip 增加待重启说明行、徽标叠加警示标记
- [x] 2.5 `DatabaseManagement.vue`：当前连接展示区 `pending_restart` 时显示「待重启生效」警示标记，与既有重启提示文案（L176-179）联动
- [x] 2.6 `npx vue-tsc -b` 0 错误；相关 vitest 全绿

## 3. 组 3 — stop.sh 修复（修复 2a）

- [x] 3.1 （TDD）`backend/tests/test_dev_scripts.py`：哑监听（`exec -a` 伪造合法 argv0）+ 临时端口（绝不占 12344/12345）——用例：单 PID 合法身份被杀；不匹配进程不杀且端口仍活；环境变量端口覆盖生效
- [x] 3.2 （TDD）多 PID 用例：`multiprocessing` 子进程继承 socket fd，两 PID 同持端口 → 全部被杀（回归本次根因）
- [x] 3.3 （TDD）漂移端口孤儿用例：vite 替身监听非默认端口 → 被 cmdline 清扫捕获；无关同名进程（不同 cwd/路径）不被杀
- [x] 3.4 `develop/linux/stop.sh`：端口清扫改逐 PID 循环校验（后端 `app.main:app`，前端 `vite|npm`）；新增仓库路径限定的 `pgrep -f` 孤儿清扫 + `/proc` 复核；3.1–3.3 转绿
- [x] 3.5 核对 `product/linux/stop.sh` 等兄弟脚本是否同患多 PID bug：有则顺手修，无则不动（超出范围即记录）

## 4. 组 4 — start.sh pre-start cleanup（修复 2b）

- [x] 4.1 （TDD）start.sh 用例：端口被不匹配进程占用 → 非零码退出、错误信息含指引、目标进程存活；端口被合法身份占用 → 先清理后启动成功（用哑监听替身 + 临时端口，不真起 uvicorn 的场景优先）
- [x] 4.2 `develop/linux/start.sh`：启动前端口检测——空闲直接启动；已验证的本项目进程占用先清后启；不匹配占用拒绝启动并指引 `stop.sh`；`BACKEND_PORT`/`FRONTEND_PORT` 环境变量覆盖（`${VAR:-default}`）
- [x] 4.3 真实环境手工验证一轮：`start.sh` 重复执行不再 EADDRINUSE 暴死（或明确拒绝并指引），服务正常起
- [x] 4.4 （4.3 实测暴露的第二轮修复）后端身份模式补 uvicorn --reload spawn worker 形态（cmdline 仅含 `spawn_main` 引导串、不含 `app.main:app`，而端口 fd 由 worker 持有）：start.sh/stop.sh 模式放宽为 `app.main:app|spawn_main` 并叠加仓库路径锚点防误杀；`test_dev_scripts.py` 复刻真实 worker 形态的回归用例；spec delta 同步该 as-built 模式

## 5. 组 5 — 收尾验证

- [x] 5.1 `openspec validate db-switch-restart-completion --strict` 通过
- [x] 5.2 全量跑本变更相关测试：`uv run pytest tests/test_dev_scripts.py tests/ -k "database or status or switch" -q` + 前端 `npx vitest run`（AppSidebar/DatabaseManagement 相关套件）+ `npx vue-tsc -b`
- [x] 5.3 tasks.md 逐项勾选；改动留工作区不 commit（验收后由编排者处理）
