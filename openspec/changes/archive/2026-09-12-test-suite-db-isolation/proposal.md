# Proposal: 测试套件 — 脱离真实库隔离

## 概述

将 45 个直接绑定 `app.main.app`（经 lifespan 连接 db_config active 真实库）的后端测试文件迁移到隔离的内存库 harness，使测试套件：不随 active 连接切换漂移、不与运行中的开发服务争 SQLite WAL 锁、不读写真实数据库、可安全并行/CI 化。

背景与数据：`docs/refactoring/test-suite-consolidation-2026-09-12.md`（P0 提速、P1 修失效、P4 retry 自锁修复已完成并验收；本变更承接 P3 结构治理）。

## 动机

1. **环境漂移**：`app.main` lifespan 的 `init_db()` 连接 `db_config.json` active 指向的真实库；active 一旦切换（历史先例：切到 manual-demo.db），45 个文件集体漂移甚至集体失败。
2. **争锁互扰**：测试与运行中的开发服务互为 "database is locked" 来源（实测 pytest 全量期间后端 retry 端点 500）。
3. **危险写入**：`test_ansible_inventory_api.py` 直接读写真实库（插删 Node、读删除保护基线）；`test_edge_client_api.py` 修复前曾真实请求用户 Edge 节点。
4. **CI 化前提**：依赖本机真实库与运行服务的测试无法进 CI。

## 方案

以 `tests/api_helpers.py` 已落地的 `isolated_app_lifespan()`（P0 引入）为基础，提供标准 harness：

1. **conftest 级 `isolated_app` fixture**：`isolated_app_lifespan()` + 每测试独立内存库 `test_db` 注入 `app.dependency_overrides[get_db]`，TestClient 请求全部落在内存库。
2. **逐文件迁移**（机械替换）：45 文件的 `AuthedTestClient(app)` / `AsyncClient(ASGITransport(app))` 改用 `isolated_app` fixture；种子数据（admin id=1、cluster 1、node）由 harness 统一播种。
3. **真实库依赖专项**：`test_ansible_inventory_api.py` 的真实库读写改为内存库固定基线；跨文件运行顺序依赖（若有）显式声明或消除。

**不做的事**：
- 不改任何业务代码（纯测试基建 + 测试迁移）。
- 不动 11 个 PG opt-in 跳过测试与 E2E（Playwright 走独立 vite 实例，不在范围）。
- 不强行合并 batch-delete 四文件（决策记录见治理文档 §4.2：各资源端点处理器集成测试有真实差异，抽象 ROI 为负）。

## 风险与缓解

| 风险 | 缓解 |
|------|------|
| 部分测试隐式依赖真实库已有数据（如删除保护基线、种子插件元数据） | harness 提供显式种子清单；迁移时逐文件核对断言对数据的假设 |
| lifespan 短路后个别测试实际测到的是真实库行为而静默失真 | 迁移以"断言仍通过 + 断言语义复核"双闸门 |
| 一次性迁移 45 文件回归面大 | 分批迁移（每批 ≤10 文件），每批全量 pytest 对照 |

## 影响

- 测试套件可离线/CI 运行；消除环境漂移类偶发失败。
- 后续治理（并行化、覆盖率门槛）解锁。
