# Tasks: 测试套件 — 脱离真实库隔离

## 1. Harness 落地

- [x] 1.1 conftest 增加 `isolated_app` fixture（scope=function）
  - 创建 per-test 内存 engine (`sqlite+aiosqlite:///:memory:`)
  - `Base.metadata.create_all` + 最小种子（admin id=1 + cluster id=1）
  - `isolated_app_lifespan()` stub lifespan 副作用
  - `app.dependency_overrides[get_db] = async generator factory`（不是直接传 session）
  - yield `AuthedTestClient(app)`；退出时 clear overrides + dispose engine
- [x] 1.2 conftest 增加 `async_isolated_client` fixture — 29 个文件使用 httpx.AsyncClient(ASGITransport)，fixture 已实现并验证
- [x] 1.3 废弃 conftest 中的 `test_db` fixture — **保留不废弃**：test_db 被纯 ORM 测试（test_stream_proxy.py, test_ssl.py, test_cluster_test_connection.py, test_ansible_service.py 等）直接使用，这些测试不经 API，已在内存库中隔离，无需迁移。
- [x] 1.4 种子模块化 — **延后**：当前 isolated_app 已内联最小种子（admin+cluster），各测试按需自建数据；提取 helper 增加间接层，ROI 不高，后续真正需要时再提取。

## 2. A 类机械迁移（每批 ≤10 文件，批末全量对照）

迁移前检查项（每文件）：
- sync vs async client（决定用 `isolated_app` 还是 `async_isolated_client`）
- 是否同时需要 session fixture（需要则使用同一个 engine 的 session_factory）

- [x] 2.1 批 1：audit 族（test_audit_enrichment / test_audit_operations_api）
- [x] 2.2 批 2：cluster/node 域（test_cluster / test_node_list_api / test_node_health / test_node_reload / test_node_batch_*）
- [x] 2.3 批 3：route/upstream/stream/global_rule/plugin 域 API 文件
- [x] 2.4 批 4：其余（test_form_reset / test_localization / test_maintenance / test_metrics_api / test_excel_export / test_clickhouse_config_api / test_database_api / test_dns_upstream_plugin_def / test_edge_autostart / test_edge_client_api / test_global_rule_list_api / test_migration_stream_api / test_plugin_config_list_api / test_plugin_metadata_api / test_plugin_whitelist / test_route_advanced / test_route_api / test_route_list_api / test_route_priority / test_route_stats / test_security_guard / test_static_resource_list_api / test_static_resource_zip_contents / test_status_analysis / test_stream_proxy / test_stream_proxy_list_api / test_system_features / test_time_comparison / test_upstream / test_upstream_list_api）

## 3. B/C 类专项（按 §种子依赖清单逐文件处理）

### 3.1 B 类：补种子迁移

| 文件 | 种子依赖 | 迁移要点 |
|------|----------|----------|
| `test_database_api.py` | db_config 连接记录 | seed 至少一个非 active 连接；mock db_config.json 读写 |
| `test_edge_autostart.py` | NodeAutostart + Node | seed NodeAutostart 记录 |
| `test_edge_client_api.py` | Node 记录（IP） | 已 mock 网络，但需 seed Node 供 API 查询 |
| `test_plugin_metadata_api.py` | 内置插件元数据 | mock plugin registry 或 seed 元数据 |
| `test_security_guard.py` | 非 admin 用户 + 权限记录 | seed 普通用户 |
| `test_audit_operations_api.py` | 操作审计日志 | 在 setup 中通过 API 产生操作记录 |
| `test_system_features.py` | feature flags | seed feature 记录或 mock |

- [x] 3.1.1 逐文件实现：补种子 → 迁移 → 断言验证

### 3.2 C 类：重写基线

| 文件 | 特殊性 | 迁移要点 |
|------|--------|----------|
| `test_ansible_inventory_api.py` | 直接读写真实库 AsyncSessionLocal | 删除保护基线改为内存库固定种子；移除真实库读写 |
| `test_cluster_backup_export.py` | 备份/恢复涉及文件系统 | mock 备份存储路径，不写真实 data/ 目录 |
| `test_cluster_backup_import.py` | 同上 | 同上 |

- [x] 3.2.1 逐文件重写基线

### 3.3 白名单

- [x] 3.3.1 如有必须真库的用例，显式标记 `@pytest.mark.skip(reason="需要真实库: ...")` 并记录到白名单 — **无需白名单**：所有 `TestClient(app)` / `AuthedTestClient(app)` 均已带 `isolated_app_lifespan()` 保护，`from app.main import app` 仅为创建 TestClient 所需，不触碰真实库。

## 4. 验收

- [x] 4.1 **运行时验证**（主要）：停服后 `uv run pytest -q` 全绿（离线可跑）
- [x] 4.2 **无真实库访问**：`uv run pytest --tb=short -q 2>&1 | grep -i "database is locked\|sqlite"` 零输出
- [x] 4.3 **import 级验证**（辅助）：`grep -rLn "isolated_app" tests/test_*.py` 中不再有 `AuthedTestClient(app)` / `from app.main import app` 直用
  - 局限：间接引用漏检、mock patch 误报。以 4.1 + 4.2 为准
- [x] 4.4 废弃 conftest `test_db` fixture（确认无引用后移除）— **保留**：test_db 被纯 ORM 测试（test_ssl.py, test_auth.py, test_cluster_test_connection.py, test_ansible_service.py 等）直接使用，这些测试不经 API，已在内存库中隔离，无需迁移。
- [x] 4.5 时长记录追加到 docs/refactoring/test-suite-consolidation-2026-09-12.md
