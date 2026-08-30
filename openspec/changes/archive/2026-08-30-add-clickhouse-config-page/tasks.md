# Tasks: add-clickhouse-config-page

## 1. clickhouse_client 基础改造（design D1/D3）

- [x] 1.1 RED：新建 `backend/tests/test_clickhouse_client_config.py`——① 归一化四态：新格式（connections+active）/旧路径回退（app/config）/旧单连接明文格式（顶层 host/password，视为"默认"连接且解密兜底）/全缺失走 _DEFAULTS；② `invalidate()` 后 `_config_version` 自增、`get_client()` 在版本变化时废弃 `_local.client`（monkeypatch Client 构造断言重建、参数=新 active）；③ active 指向不存在 id → 回落首条。运行确认失败原因正确
- [x] 1.2 GREEN：实现 `_normalize_raw`、active 解析、`_config_version`+`invalidate()`、`get_client()` 版本比对与旧连接 disconnect；保持"连接失败返回 None 不崩"（metrics 既有语义）
- [x] 1.3 迁移文件：`git mv backend/app/config/clickhouse.yaml backend/clickhouse.yaml` 并改写为 connections+active 新格式（当前空密码 → 不写 password_enc；id `ck_default`，name "默认"）
- [x] 1.4 回归：`uv run pytest tests/test_clickhouse_client_config.py` 全绿 + `uv run pytest -k "clickhouse or metrics"` 无涟漪

## 2. 配置管理 API（design D4）

- [x] 2.1 RED：新建 `backend/tests/test_clickhouse_config_api.py`（db_env fixture + AuthedTestClient，tmp_path 覆盖 yaml 路径避免污染真实文件）——覆盖 spec 场景：GET 无 password 字段含 password_set/is_active；创建→422（name/host 空、port 非正）；列表空首条自动激活；PUT 留空密码保留原 token；DELETE active→400；DELETE 普通→200+invalidate；activate 未知 id→404、成功→active 更新+invalidate；test 两端点 ok/fail 返回形态且不写文件（断言文件 mtime/内容不变）；无权限普通用户 403；admin 全程 200；PUT 成功写 sys_audit_log 一条且 detail 无密码
- [x] 2.2 GREEN：新建 `api/v1/clickhouse_config.py`（路由级 get_current_user + require_permission('clickhouse_config')；Pydantic schemas；yaml 读写工具含明文→password_enc 转换）；`api/v1/__init__.py` 挂路由；试连用 `asyncio.to_thread` + 独立临时 Client（finally disconnect，不碰 _local）
- [x] 2.3 全量 `uv run pytest -q` 通过（基线 1425+9 不回归）

## 3. 前端页面与双端注册（design D5）

- [x] 3.1 `src/api/clickhouse.ts`：listConnections/createConnection/updateConnection/deleteConnection/testConnection(两种)/activate + 类型定义（无 password 回显字段）
- [x] 3.2 四处落位：`router/index.ts` ROUTE_MAP clickhouse_config；`AppSidebar.vue` 系统管理 items "ClickHouse 配置"（手写 svg）；`UserList.vue` permissionGroups 系统管理 + permissionKeyToLabel 各加一项
- [x] 3.3 `views/ClickHouseConfig.vue`：列表（名称/Host:Port/库/用户/密码状态/激活徽标/操作列）+ modal-overlay 新建编辑弹窗（测试连接|保存|取消，密码 placeholder "已保存，留空不修改"）+ useOverlayModal 删除/激活确认 + 页头说明文案（"此处激活仅切换指标数据源，与平台主库无关"）
- [x] 3.4 `npx vue-tsc -b`、eslint 0 error、prettier；`__tests__` 补渲染冒烟用例（API mock，列表 1 行 + 弹窗开关）；`npx vitest run` 全绿

## 4. 集成验证与收尾

- [x] 4.1 真实链路（服务已运行，12344 自动 reload）：GET connections 形态正确；创建 localhost:9000 假连接 → test 返回 ok:false 有 error；删除；激活切换守卫 400；curl 全程无 5xx；`ps_node` 无关不动
- [x] 4.2 指标页回归：metrics 总览/查询页在无真实 ClickHouse 环境行为与改前一致（空数据不崩）；后端日志无新增 ERROR
- [x] 4.3 浏览器手工冒烟（Playwright 或人工）：非 admin 用户配/不配 clickhouse_config 权限 → 菜单与页面可见性、403 拦截符合预期；保存后指标页刷新不报 500
- [x] 4.4 `npx playwright test e2e/`（或至少 user.spec.ts + 触及侧栏的 spec）通过
- [x] 4.5 `openspec validate add-clickhouse-config-page` 通过；`git status` 核对（不含 db_config.json/prompt-1.txt）；提交 `feat: ClickHouse 连接配置页——多命名连接 CRUD+激活、Fernet 密码加密、保存即生效`；按 openspec-archive-change 归档（delta specs 合入 main specs，含 clickhouse-metrics-query 路径更新）
