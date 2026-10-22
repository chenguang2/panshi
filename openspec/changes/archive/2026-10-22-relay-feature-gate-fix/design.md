# Design: relay-feature-gate-fix

## D1: 端点级门控，而非挂载级（feature_routers）

**决策**：`relay.py` 用 router-level dependency `Depends(_require_relay_feature)` 实现关闸 404，不把 relay.router 挪进 `feature_routers` 挂载级门控。

**理由**：
- 挂载级在 `main.py` import 期消费 `feature_routers` dict，改 yaml 后**必须重启**才生效——而 relay_gateway 当初从 `EDGE_RELAY_ENABLED` 环境变量迁入 features.yaml 的核心承诺就是「mtime 热加载，改完即时生效免重启」（relay-region-registry 主 spec「开关热生效」场景明文约束）。挂载级会让 API 层关闸滞后到重启，用户实测会立刻再报「还是不生效」。
- 端点级是请求期实时检查，与 mtime 热加载同粒度；`test_database_api.py` 的 `TestDbMigrationFeatureGate` docstring 已明文记载该取舍（「路由注册发生在 app import 期，测试进程内无法 API 级测『注册级关闭』；端点级门控是请求期实时检查，可 API 级覆盖」）。
- router-level dependencies 对现有与未来全部 `/relay` 端点统一生效，守卫放共享出口、新增路径自动免疫（#187 原则）。

**次序语义**：dependencies 列表 `require_permission("relay_gateway")` 在前、`_require_relay_feature` 在后——FastAPI 按声明序解析，无权限者先得 403，404「中继网关功能未启用」只给持权者，不泄露模块存在性（与 db_migration 的 403→404 次序一致）。

## D2: 与执行路径开关的关系

`relay_registry.relay_enabled()`（④，寻址走向）保持不动：与本检查同源热加载，互为双保险——执行路径层回答「流量走不走网关」，管理面层回答「管理界面/接口在不在」。两层语义不同，不合并。
