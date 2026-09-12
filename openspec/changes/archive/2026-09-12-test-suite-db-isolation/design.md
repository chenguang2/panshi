# Design: 测试套件 — 脱离真实库隔离

## 现状链路（问题根）

```
test file ──> AuthedTestClient(app) / AsyncClient(ASGITransport(app))
                     │ with 进入触发 lifespan
                     ▼
        app.main.lifespan
          ├─ init_db()                 ──► 连接 db_config.json active（真实库！）
          ├─ seed_data(session)        ──► 真实库写入
          ├─ recover_interrupted_tasks ──► 真实库写入
          └─ shutdown: get_node_task_service().shutdown_sync()
                                        ──► join 后台线程（曾挂死 90s+）
```

## 目标 harness

```
tests/conftest.py
  isolated_app  (fixture, scope=function)
    ├─ create_async_engine("sqlite+aiosqlite:///:memory:")   # per-test 独立内存库
    ├─ Base.metadata.create_all + 最小种子（见 §种子策略）
    ├─ isolated_app_lifespan()        # api_helpers 已有：stub init_db/seed_data/
    │                                 #   recover/shutdown/close_db/AsyncSessionLocal
    ├─ app.dependency_overrides[get_db] = async generator factory（见 §get_db override）
    ├─ yield AuthedTestClient(app)；退出时 clear overrides
    └─ engine.dispose()
```

### get_db override 机制

`get_db` 签名为 `async def get_db() -> AsyncGenerator[AsyncSession, None]`，FastAPI Depends 会调用它、yield session、然后 close。override 必须是一个**async generator factory**，不能直接传 session：

```python
@pytest.fixture(scope="function")
def isolated_app():
    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    event.listen(engine.sync_engine, "connect", _enable_sqlite_fk)
    
    # 同步 setup：create_all + 种子
    async def _setup():
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
        async with async_sessionmaker(engine)() as s:
            s.add(Cluster(id=1, name="test-cluster"))
            s.add(User(id=1, username="admin", ...))
            await s.commit()
    anyio.from_thread.run(_setup)
    
    session_factory = async_sessionmaker(engine, class_=AsyncSession)
    
    async def _get_db_override():
        async with session_factory() as session:
            yield session
    
    with isolated_app_lifespan():
        app.dependency_overrides[get_db] = _get_db_override
        with AuthedTestClient(app) as client:
            yield client
        app.dependency_overrides.clear()
    
    anyio.from_thread.run(engine.dispose())
```

关键决策：
- **per-test 独立 engine**：内存 SQLite create_all + drop_all 开销 <50ms，已验证单文件 39 用例 90s→9.6s。per-test 隔离确保测试间零污染、可并行化。
- **不复用 `test_db` fixture**：`test_db` 返回单个 session，而 `get_db` override 需要的是可反复调用的 factory。两者职责不同，不合并。

### 种子策略：核心最小集 + 按需自建

**核心种子**（conftest 固定提供，所有测试可依赖）：

| 种子 | ID | 用途 |
|------|-----|------|
| admin User | id=1 | 认证、权限 |
| Cluster | id=1 | 外键父级 |

**不提供万能种子**，理由：
1. 万能种子导致测试间隐式耦合——改种子数据影响所有测试
2. 不同测试需要的种子差异大（inventory 需要 SSH 配置、audit 需要日志、database 需要连接记录……）
3. 按需种子让每个测试自包含，可维护性好

各文件在迁移时按需在 test setup 中创建自己的数据，见 §B/C 类种子清单。

### AsyncClient 与 sync client 双 fixture

43 个文件中存在两种 client：

| | AuthedTestClient (sync) | httpx.AsyncClient (async) |
|---|---|---|
| 走 lifespan | 是 | 否（ASGITransport 不触发） |
| 走 DI override | 是 | 是 |
| 测试需要 async | 否 | 是 |

建议在 conftest 提供两个 fixture：
```python
@pytest.fixture
def isolated_app():         # sync: AuthedTestClient
@pytest.fixture  
def async_isolated_client(): # async: httpx.AsyncClient + ASGITransport
```

`get_db` override 对两种 client 同样有效。`isolated_app_lifespan()` 对 AsyncClient 无害但多余（lifespan 本就不会触发）。

### 双库问题防护

`test_db` fixture（conftest.py）创建自己的内存 DB，`isolated_app` 也会创建自己的内存 DB。如果测试同时使用两者，API 调用和直接 session 操作会命中**两个不同的数据库**。

防护措施：
1. 迁移清单增加「是否需要 session fixture」列
2. 需要 session 的测试，session 必须来自 `isolated_app` 的 session_factory
3. 迁移后废弃 conftest 中的 `test_db` fixture（或改为从 `isolated_app` 借 engine）

## 迁移分类（43 文件盘点后三分）

| 类别 | 处理 | 预估 |
|------|------|------|
| A. 纯 CRUD/API 断言，种子自足 | 机械替换为 `isolated_app` | ~35 文件 |
| B. 断言依赖真实库既有数据 | 补显式种子后按 A 迁移 | ~6 文件 |
| C. 特殊（真实库基线类：test_ansible_inventory_api；网络类残留） | 重写基线为内存库固定数据 | ~4 文件 |

### B/C 类种子依赖清单

| 文件 | 依赖的真实库数据 | 迁移策略 |
|------|-----------------|----------|
| `test_ansible_inventory_api.py` | SSH 连接配置、节点密码、inventory 文件 | C类：mock inventory 文件内容，不依赖真实 SSH |
| `test_database_api.py` | db_config.json 的连接记录 | B类：seed 至少一个非 active 连接记录 |
| `test_edge_autostart.py` | autostart 配置、Edge 节点状态 | B类：seed NodeAutostart + Node 记录 |
| `test_plugin_metadata_api.py` | 内置插件元数据 | B类：mock plugin registry 或 seed 元数据 |
| `test_security_guard.py` | 非 admin 用户、多资源权限 | B类：seed 普通用户 + 权限记录 |
| `test_audit_operations_api.py` | 操作审计日志记录 | B类：seed 审计日志 or 在 setup 中通过 API 产生操作记录 |
| `test_edge_client_api.py` | Edge 节点 IP（真实 IP 在库中） | A类（已 mock 网络）但需 seed Node 记录 |
| `test_system_features.py` | feature flags | B类：seed feature 记录或 mock |

迁移前需逐文件验证种子需求，而非迁移中逐个调试。

## 验收

1. **运行时验证**（替代 grep import）：关闭开发服务后 `uv run pytest -q` 全绿——当前做不到（直接依赖真实服务/库的用例会失败），迁移后应能做到。
2. **无真实库访问验证**：`uv run pytest --tb=short -q 2>&1 | grep -i "database is locked\|sqlite"` 零输出 = 没有测试访问真实库文件。
3. **import 级验证**（辅助）：`grep -rLn "isolated_app" tests/test_*.py` 中不再有 `AuthedTestClient(app)` / `from app.main import app` 直用（白名单除外）。
   - 注意此 grep 的局限：多文件引用（间接通过 helper）会漏检；mock patch（如 `patch("app.main.some_func")`）会误报。以运行时验证为准。
4. 迁移前后每批：用例数不变（或差额有记录）、全量通过、时长不回退。

## 已知风险

- 某些测试可能隐式依赖 `init_db()` 的 schema 创建（lifespan 已 stub），迁移时若发现 schema 缺失，需在 fixture 的 `_setup()` 中补齐。
- `AuthedTestClient` 的同步 vs `AsyncClient` 的异步 fixture 需按文件逐一匹配，不能混用。
- `test_db` fixture 废弃前需确认无文件单独依赖它（grep 确认后方可移除）。
