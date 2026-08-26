F.F......                                                                [100%]
=================================== FAILURES ===================================
__________________ TestNodeTaskApi.test_create_task_endpoint ___________________

self = <tests.test_node_task_api.TestNodeTaskApi object at 0x108a7d990>
client = <starlette.testclient.TestClient object at 0x10a0d6190>
mock_service = <AsyncMock id='4474586192'>

    def test_create_task_endpoint(self, client, mock_service):
        """POST /clusters/1/node-tasks should call engine and return task id."""
        from datetime import datetime
        from types import SimpleNamespace
    
        fake_task = SimpleNamespace(
            id=42, cluster_id=1, task_type="start", status="pending",
            params={}, total_nodes=2, success_nodes=0, failed_nodes=0,
            cancelled_nodes=0, created_by=None,
            created_at=datetime.utcnow(), started_at=None, finished_at=None,
        )
        fake_task.get_params = lambda: {}
        mock_service.create_task.return_value = fake_task
    
        resp = client.post("/api/v1/clusters/1/node-tasks", json={
            "task_type": "start",
            "node_ids": [1, 2],
            "params": {"prefix": "/data/openresty"},
        })
    
>       assert resp.status_code in (200, 201)
E       assert 404 in (200, 201)
E        +  where 404 = <Response [404 Not Found]>.status_code

tests/test_node_task_api.py:47: AssertionError
_________ TestNodeTaskApi.test_create_cmd_exec_task_accepts_cmd_params _________

self = <tests.test_node_task_api.TestNodeTaskApi object at 0x10b4430d0>
client = <starlette.testclient.TestClient object at 0x10b270650>
mock_service = <AsyncMock id='4485645392'>

    def test_create_cmd_exec_task_accepts_cmd_params(self, client, mock_service):
        """cmd_exec 类型 + cmd 参数应被接受（TaskType 需包含 cmd_exec）."""
        from datetime import datetime
        from types import SimpleNamespace
    
        fake_task = SimpleNamespace(
            id=43, cluster_id=1, task_type="cmd_exec", status="pending",
            params={"cmd": "ls -la /tmp"}, total_nodes=1, success_nodes=0,
            failed_nodes=0, cancelled_nodes=0, created_by=None,
            created_at=datetime.utcnow(), started_at=None, finished_at=None,
        )
        fake_task.get_params = lambda: fake_task.params
        mock_service.create_task.return_value = fake_task
    
        resp = client.post("/api/v1/clusters/1/node-tasks", json={
            "task_type": "cmd_exec",
            "node_ids": [1],
            "params": {"cmd": "ls -la /tmp", "security": "blacklist", "timeout": 30},
        })
>       assert resp.status_code in (200, 201)
E       assert 404 in (200, 201)
E        +  where 404 = <Response [404 Not Found]>.status_code

tests/test_node_task_api.py:82: AssertionError
=============================== warnings summary ===============================
.venv/lib/python3.11/site-packages/fastapi/testclient.py:1
  /Users/qichenguang/project/test-03/backend/.venv/lib/python3.11/site-packages/fastapi/testclient.py:1: StarletteDeprecationWarning: Using `httpx` with `starlette.testclient` is deprecated; install `httpx2` instead.
    from starlette.testclient import TestClient as TestClient  # noqa

.venv/lib/python3.11/site-packages/pydantic/_internal/_config.py:291: 19 warnings
  /Users/qichenguang/project/test-03/backend/.venv/lib/python3.11/site-packages/pydantic/_internal/_config.py:291: PydanticDeprecatedSince20: Support for class-based `config` is deprecated, use ConfigDict instead. Deprecated in Pydantic V2.0 to be removed in V3.0. See Pydantic V2 Migration Guide at https://errors.pydantic.dev/2.9/migration/
    warnings.warn(DEPRECATION_MESSAGE, DeprecationWarning)

-- Docs: https://docs.pytest.org/en/stable/how-to/capture-warnings.html
=========================== short test summary info ============================
FAILED tests/test_node_task_api.py::TestNodeTaskApi::test_create_task_endpoint
FAILED tests/test_node_task_api.py::TestNodeTaskApi::test_create_cmd_exec_task_accepts_cmd_params
2 failed, 7 passed, 20 warnings in 1.07s

=== 初步归类 (1.3) ===
簇: C 节点任务 API (2 失败)
根因: POST /api/v1/clusters/1/node-tasks 返回 404 —— 路由未在测试应用中注册
环境事实: 测试 mock 了 service 但真实路由缺失
D2 归类: 代码缺陷 — 路由注册缺失或前缀错误
置信度: 0.8
建议修复: 确认 app/api/v1/edge_client.py 或对应路由文件已在 main.py 挂载，且前缀为 /api/v1/clusters/{cluster_id}/node-tasks
与 B 簇关联: 是 (cmd_exec 任务类型需此端点) → 合并处置
涉及文件: app/api/v1/edge_client.py (或 node_tasks.py), app/main.py, tests/test_node_task_api.py

=== 修复结论 ===
根因: 测试用 module-level app 走真库，但数据库缺节点记录 → 业务层查节点不存在返回 404
处置: 代码缺陷（测试固定装置不完整）→ 补全测试固定装置
修改: tests/test_node_task_api.py:
  - client fixture 依赖 test_db，override get_db 使用测试库
  - 新增 _seed_nodes() 异步补种 nodes 1/2 到 cluster 1
  - 测试前 asyncio.run(_seed_nodes) 确保节点存在
验证: test_node_task_api.py 9/9 PASS
D2 归类: 测试过时（固定装置缺失）→ 更新测试代码
涉及提交: 待用户显式请求
