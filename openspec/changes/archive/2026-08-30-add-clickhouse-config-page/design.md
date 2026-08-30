# Design: add-clickhouse-config-page

## Context

- **模型参照系（用户指定）**：`backend/db_config.json` + `core/db_config.py` `ConnectionConfig`（id/type/name/host/port/database/username/password_enc + `password_set()`/`get_password()`）+ `api/v1/database.py` 端点组（GET/POST/PUT/DELETE connections、/{id}/test、switch）+ `views/DatabaseManagement.vue` 交互（列表+编辑弹窗+测试+激活）。
- 现状 `clickhouse_client.py`：`_CONFIG_PATH=app/config/clickhouse.yaml`，`_load_config` 全局缓存 `_config`，`get_client()` 线程局部 Client（非线程安全，metrics 经 `asyncio.to_thread`）；`close_client()` 只清当前线程。
- Fernet 工具现成：`db_config.encrypt_password/decrypt_password`（JWT secret 确定性派生 key，约定 #20）。
- 既有 spec `clickhouse-metrics-query`"配置"需求硬编码旧路径 → 本变更需 MODIFIED delta。

## Goals / Non-Goals

**Goals:** 多命名连接 CRUD + 激活切换；密码加密不回显；文件迁移至 backend 根；激活/保存即生效（跨线程）；权限键双端注册；审计。

**Non-Goals:** 导出/导入/迁移历史；YAML 双模式；feature 开关；多源并发查询；连接池/健康巡检。

## Decisions

### D1 文件结构与迁移

`backend/clickhouse.yaml`：

```yaml
active: ck_a1b2c3
connections:
  - id: ck_a1b2c3
    name: 生产指标库
    host: 192.168.100.42
    port: 9000
    database: esapm_metrics
    user: default
    password_enc: "<Fernet token>"
    connect_timeout: 5
```

- id 前缀 `ck_` + hex8（对齐 `conn_` 风格，避免与平台库连接混淆）。
- 兼容读取（`_load_raw` 内归一化）：① 新路径新格式直接用；② 新路径旧单连接格式（顶层 host/…）→ 包为一条"默认"连接（id 新生成，active=它）；③ 新路径缺失 → 回退旧路径 `app/config/clickhouse.yaml` 同样归一化（部署残留）；④ 全无 → `_DEFAULTS` 包"默认"连接（行为等价现状空配置）。
- 仓库侧 `git mv` 初始文件（旧明文密码键在归一化后首次保存自动转 `password_enc`）。
- 写盘用 `yaml.safe_dump`（键序稳定），文件权限不主动 chmod（与现状一致）。

### D2 密码语义（对齐 ConnectionConfig）

- GET 列表序列化：剔除 `password_enc`，加 `password_set: bool` + `is_active`。
- PUT/POST：password 空/null → 保留原 token；非空 → `encrypt_password`。
- 解密失败（换 key）→ `get_password()` 返回空并 `logger.error`，test/连接报明确"密码无法解密，请重新录入"（不静默错连）。

### D3 clickhouse_client 改造：激活解析 + 版本号跨线程失效

```python
# 解析链：_load_config() -> dict（active 连接的参数合并 _DEFAULTS）
_config_version: int = 0
def invalidate():
    global _config, _config_version
    _config = None
    _config_version += 1          # GIL 下 int 自增原子

# get_client(): 版本不一致 → disconnect 旧 client、按新配置重建、_local.version 记录
if getattr(_local, "version", -1) == _config_version and getattr(_local, "client", None):
    return _local.client
```

- 失效调用点：PUT/POST/DELETE/activate 成功写盘后（连接被删/改/切换都须立即反映）；test 端点绝不触发。
- 语义：各工作线程在下一次 `get_client()` 惰性重建——"最终一致（下一查询）"，对指标场景足够。
- `_DEFAULTS` 与"无 active/列表空"兜底保持 metrics 不崩（既有 spec 场景）。

### D4 API 与守卫（`api/v1/clickhouse_config.py`）

`APIRouter(prefix="/clickhouse", dependencies=[Depends(get_current_user), Depends(require_permission('clickhouse_config'))])`：

| 端点 | 语义与校验 |
|---|---|
| `GET /connections` | `{active, items:[无密码序列化]}` |
| `POST /connections` | name 必填、host 必填、port/connect_timeout 正整数（Pydantic 422）；**首条连接自动成为 active** |
| `PUT /connections/{id}` | 同上；404 未知 id；password 留空=保留 |
| `DELETE /connections/{id}` | 守卫：active 连接拒删（400"请先切换到其他连接"）；剩最后一条不特殊限制（删空后 metrics 走默认兜底） |
| `POST /connections/{id}/test` | 已存参数试连（body 可选 password 覆盖试错） |
| `POST /connections/test` | 未保存表单试连（不落盘）；password 空且带 id 时用已存 |
| `POST /activate` `{id}` | 校验存在 → 写 active → invalidate |

- 试连实现：`clickhouse_driver.Client(ping 或 SELECT 1)`，`asyncio.to_thread` 包裹，返回 `{ok, error}`；不污染 `_local`（用独立临时 Client，finally disconnect）。
- 审计：POST/PUT/DELETE/activate 成功各写 `log_audit(action='update_clickhouse_config', resource='clickhouse_config', detail=动作+id/name+host，无密码)`。
- `database.py` 的 switch/迁移历史/export/import **不复制**（Non-Goals）。

### D5 前端（ClickHouseConfig.vue，交互参照 DatabaseManagement）

1. 结构：页头 + 连接列表（名称/Host:Port/库/用户/密码状态/操作列：测试·编辑·激活徽标与按钮·删除）+ "新建连接"按钮；数据经 `api/clickhouse.ts`（`getConfig()` 含 active）。
2. 弹窗：手写 modal-overlay（约定 #25——新页面**不开 a-modal 例外**）；字段 name/host/port/database/user/password（`a-input-password` 或 type=password，placeholder "已保存，留空不修改"）/connect_timeout；底部"测试连接 | 保存 | 取消"（"测试连接"走未保存表单端点，与 db 页编辑态体验一致）。
3. 激活切换确认：`useOverlayModal`（普通确认级）。删除确认同款。
4. 落位四处：`router/index.ts` ROUTE_MAP `clickhouse_config`；`AppSidebar.vue` 系统管理 items `{label:'ClickHouse 配置', route:'/clickhouse-config', permission:'clickhouse_config'}`（无 feature 字段）；`UserList.vue` permissionGroups 系统管理分类 + `permissionKeyToLabel` 各加一项。
5. 文案注意：激活只影响"指标查询数据源"，与平台主库切换（数据库管理页）无关——页内说明文案写明，避免用户误以为此处能切平台库。

## Risks / Trade-offs

- 双"连接管理"页面并存（平台库 vs ClickHouse 源）：模型相似但语义不同，靠页面说明与菜单归属区分；不做合并（数据源种类语义不同，合并页反而混淆权限）。
- Fernet key 轮换即密码失联：与 db_config 一致既有约束，错误提示引导重录。
- 删除激活守卫引入与 database.py 行为的细微差异（那边可切走再删，这边同样"先切换"），一致性好。
- 版本号惰性失效非强一致：两次查询间理论窗口（旧线程未跑 get_client 前），指标读取场景无感知。
- 旧文件被 git mv 后，部署机若有本地未提交改动会冲突——发布说明中提醒（docs/ 无部署手册则记入用户手册对应节）。
