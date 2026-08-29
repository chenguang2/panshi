"""Tests for cluster_edge_env API router with mocked ansible."""
import pytest
from unittest.mock import patch, AsyncMock, MagicMock
from httpx import AsyncClient, ASGITransport
from tests.api_helpers import admin_auth_headers

AUTH = admin_auth_headers()
from fastapi import FastAPI

from app.api.v1.cluster_edge_env import router
from app.core.database import get_db
from app.models.cluster import Cluster, Node, ConfigVersion
from app.services.ansible_service import AnsibleRunnerService
from app.services.edge_sync import create_config_version


@pytest.fixture
def mock_ansible():
    svc = MagicMock(spec=AnsibleRunnerService)
    svc.run_playbook = AsyncMock(return_value={"rc": 0, "stdout": "deploy:\n  prefix: edge\n", "stderr": ""})
    svc.generic_run = AsyncMock(return_value={"rc": 0, "stdout": "init OK.", "stderr": ""})
    with patch("app.api.v1.cluster_edge_env._ansible_service", svc):
        yield svc



def _make_app(db_session):
    app = FastAPI()
    async def override_get_db():
        yield db_session
    app.dependency_overrides[get_db] = override_get_db
    app.include_router(router, prefix="/api/v1")
    return app


@pytest.fixture
async def edge_env_db(test_db):
    """test_db + 种子 API 用户（edge_env 路由已加装认证依赖）。"""
    from app.models.user import User
    from app.core.security import hash_password
    if await test_db.get(User, 1) is None:
        test_db.add(User(id=1, username="api_user", password_hash=hash_password("password123"),
                         role="admin", status=1))
        await test_db.commit()
    return test_db


class TestEdgeEnvDeploy:

    async def test_invalid_yaml_returns_422(self, edge_env_db):
        app = _make_app(edge_env_db)
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test", headers=AUTH) as c:
            resp = await c.post("/api/v1/clusters/1/edge-env/deploy", json={"content": "key:\n\tval\n"})
            assert resp.status_code == 422

    async def test_empty_content_returns_422(self, edge_env_db):
        app = _make_app(edge_env_db)
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test", headers=AUTH) as c:
            resp = await c.post("/api/v1/clusters/1/edge-env/deploy", json={"content": ""})
            assert resp.status_code == 422

    async def test_nonexistent_cluster_returns_404(self, edge_env_db):
        app = _make_app(edge_env_db)
        valid_content = "deploy:\n  prefix: edge\n  http:\n    edge:\n      listen:\n        - addr: 0.0.0.0:9980\n    admin:\n      listen:\n        - addr: 0.0.0.0:9990\n"
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test", headers=AUTH) as c:
            resp = await c.post("/api/v1/clusters/9999/edge-env/deploy", json={"content": valid_content})
            assert resp.status_code == 404

    async def test_deploy_missing_required_fields_returns_422(self, mock_ansible, edge_env_db):
        """Deploy with content lacking deploy.http.admin.listen should fail validation."""
        c = Cluster(name="tc", status=1)
        edge_env_db.add(c)
        await edge_env_db.commit()
        await edge_env_db.refresh(c)
        n = Node(cluster_id=c.id, ip="192.168.1.1", service_port=80, management_port=9990, edge_path="/data/edge", status=1)
        edge_env_db.add(n)
        await edge_env_db.commit()
        app = _make_app(edge_env_db)
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test", headers=AUTH) as cl:
            resp = await cl.post(
                f"/api/v1/clusters/{c.id}/edge-env/deploy",
                json={"content": "deploy:\n  prefix: edge\n"},
            )
            assert resp.status_code == 422
            body = resp.json()
            assert "detail" in body

    async def test_deploy_false_success_guard(self, mock_ansible, edge_env_db):
        """rc==0 但 playbook 未执行目标主机（节点不在清单 → no hosts matched）必须判为 failed。

        镜像 node_task_service 的 Bug 3 防护：ansible 对空匹配以 rc=0 退出，
        若按 rc==0 报 success 会把"没做任何事"误报为部署成功。
        """
        c = Cluster(name="tc-guard", status=1)
        edge_env_db.add(c)
        await edge_env_db.commit()
        await edge_env_db.refresh(c)
        n1 = Node(cluster_id=c.id, ip="192.168.1.1", service_port=80, management_port=9990, edge_path="/data/edge", status=1)
        edge_env_db.add(n1)
        await edge_env_db.commit()
        await edge_env_db.refresh(n1)

        app = _make_app(edge_env_db)
        valid_content = "deploy:\n  prefix: edge\n  http:\n    edge:\n      listen:\n        - addr: 0.0.0.0:9980\n    admin:\n      listen:\n        - addr: 0.0.0.0:9990\n"

        async def fake_run_playbook(**kwargs):
            handler = kwargs.get("event_handler")
            if handler:
                handler({"stdout": "skipping: no hosts matched"})
            return {"rc": 0, "status": "successful", "stdout": "skipping: no hosts matched", "stderr": ""}

        mock_ansible.run_playbook = AsyncMock(side_effect=fake_run_playbook)

        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test", headers=AUTH) as cl:
            async with cl.stream(
                "POST", f"/api/v1/clusters/{c.id}/edge-env/deploy",
                json={"content": valid_content, "node_ids": [n1.id]},
            ) as resp:
                assert resp.status_code == 200
                body = "".join([line async for line in resp.aiter_lines()])
                # 节点必须判为 failed 并给出友好错误，整体状态 all_failed
                # （SSE 内 JSON 中文以 \uXXXX 转义，需解析后再断言文案）
                import json as _json
                assert '"status": "failed"' in body
                assert "all_failed" in body
                complete = next(l for l in body.split("data: ") if '"type": "complete"' in l)
                payload = _json.loads(complete)
                assert payload["node_results"][0]["error"] and "不在 Ansible 主机清单" in payload["node_results"][0]["error"]

    async def test_deploy_normal_success_still_success(self, mock_ansible, edge_env_db):
        """rc==0 且输出无 no-hosts 标记 → 保持 success（守卫不误伤正常成功）。"""
        c = Cluster(name="tc-normal", status=1)
        edge_env_db.add(c)
        await edge_env_db.commit()
        await edge_env_db.refresh(c)
        n1 = Node(cluster_id=c.id, ip="192.168.1.1", service_port=80, management_port=9990, edge_path="/data/edge", status=1)
        edge_env_db.add(n1)
        await edge_env_db.commit()
        await edge_env_db.refresh(n1)

        app = _make_app(edge_env_db)
        valid_content = "deploy:\n  prefix: edge\n  http:\n    edge:\n      listen:\n        - addr: 0.0.0.0:9980\n    admin:\n      listen:\n        - addr: 0.0.0.0:9990\n"

        async def fake_run_playbook(**kwargs):
            handler = kwargs.get("event_handler")
            if handler:
                handler({"stdout": "ok: [192.168.0.24]"})
            return {"rc": 0, "status": "successful", "stdout": "ok: [192.168.0.24]", "stderr": ""}

        mock_ansible.run_playbook = AsyncMock(side_effect=fake_run_playbook)

        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test", headers=AUTH) as cl:
            async with cl.stream(
                "POST", f"/api/v1/clusters/{c.id}/edge-env/deploy",
                json={"content": valid_content, "node_ids": [n1.id]},
            ) as resp:
                assert resp.status_code == 200
                body = "".join([line async for line in resp.aiter_lines()])
                assert '"status": "success"' in body
                assert "all_success" in body

    async def test_deploy_with_node_ids(self, mock_ansible, edge_env_db):
        """Deploy with specific node_ids should only deploy to listed nodes."""
        c = Cluster(name="tc", status=1)
        edge_env_db.add(c)
        await edge_env_db.commit()
        await edge_env_db.refresh(c)
        n1 = Node(cluster_id=c.id, ip="192.168.1.1", service_port=80, management_port=9990, edge_path="/data/edge", status=1)
        n2 = Node(cluster_id=c.id, ip="192.168.1.2", service_port=80, management_port=9990, edge_path="/data/edge", status=1)
        edge_env_db.add_all([n1, n2])
        await edge_env_db.commit()
        await edge_env_db.refresh(n1)
        await edge_env_db.refresh(n2)
        app = _make_app(edge_env_db)
        valid_content = "deploy:\n  prefix: edge\n  http:\n    edge:\n      listen:\n        - addr: 0.0.0.0:9980\n    admin:\n      listen:\n        - addr: 0.0.0.0:9990\n"
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test", headers=AUTH) as cl:
            async with cl.stream(
                "POST", f"/api/v1/clusters/{c.id}/edge-env/deploy",
                json={"content": valid_content, "node_ids": [n1.id]},
            ) as resp:
                assert resp.status_code == 200
                found = False
                async for line in resp.aiter_lines():
                    if line.startswith("data: ") and "complete" in line:
                        found = True
                assert found, "Should have completed"

    async def test_deploy_creates_version_record(self, mock_ansible, edge_env_db):
        c = Cluster(name="test-cluster", status=1)
        edge_env_db.add(c)
        await edge_env_db.commit()
        await edge_env_db.refresh(c)
        n = Node(cluster_id=c.id, ip="192.168.1.1", service_port=80, management_port=9990, edge_path="/data/edge", status=1)
        edge_env_db.add(n)
        await edge_env_db.commit()
        app = _make_app(edge_env_db)
        valid_content = "deploy:\n  prefix: edge\n  http:\n    edge:\n      listen:\n        - addr: 0.0.0.0:9980\n    admin:\n      listen:\n        - addr: 0.0.0.0:9990\n"
        with patch("app.api.v1.cluster_edge_env.create_config_version", new_callable=AsyncMock, return_value=1):
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test", headers=AUTH) as cl:
                async with cl.stream("POST", f"/api/v1/clusters/{c.id}/edge-env/deploy", json={"content": valid_content}) as resp:
                    assert resp.status_code == 200
                    found_complete = False
                    async for line in resp.aiter_lines():
                        if line.startswith("data: "):
                            try:
                                import json
                                data = json.loads(line[6:])
                                if data.get("type") == "complete":
                                    assert data.get("version") == 1
                                    assert data["status"] in ("all_success", "partial", "all_failed")
                                    found_complete = True
                            except json.JSONDecodeError:
                                pass
                    assert found_complete, "Should have received a 'complete' event"


class TestEdgeEnvRead:

    async def test_read_nonexistent_cluster_returns_404(self, edge_env_db):
        app = _make_app(edge_env_db)
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test", headers=AUTH) as c:
            resp = await c.get("/api/v1/clusters/9999/edge-env?node_id=1")
            assert resp.status_code == 404

    async def test_read_nonexistent_node_returns_404(self, edge_env_db):
        c = Cluster(name="tc", status=1)
        edge_env_db.add(c)
        await edge_env_db.commit()
        await edge_env_db.refresh(c)
        app = _make_app(edge_env_db)
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test", headers=AUTH) as cl:
            resp = await cl.get(f"/api/v1/clusters/{c.id}/edge-env?node_id=9999")
            assert resp.status_code == 404

    async def test_read_success(self, mock_ansible, edge_env_db):
        c = Cluster(name="tc", status=1)
        edge_env_db.add(c)
        await edge_env_db.commit()
        await edge_env_db.refresh(c)
        n = Node(cluster_id=c.id, ip="192.168.1.1", service_port=80, management_port=9990, edge_path="/data/edge", status=1)
        edge_env_db.add(n)
        await edge_env_db.commit()
        await edge_env_db.refresh(n)
        app = _make_app(edge_env_db)
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test", headers=AUTH) as cl:
            resp = await cl.get(f"/api/v1/clusters/{c.id}/edge-env?node_id={n.id}")
            assert resp.status_code == 200
            body = resp.json()
            assert "content" in body
            assert body["node_id"] == n.id


class TestEdgeEnvVersions:

    async def test_list_empty(self, edge_env_db):
        c = Cluster(name="tc", status=1)
        edge_env_db.add(c)
        await edge_env_db.commit()
        await edge_env_db.refresh(c)
        app = _make_app(edge_env_db)
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test", headers=AUTH) as cl:
            resp = await cl.get(f"/api/v1/clusters/{c.id}/edge-env/versions")
            assert resp.status_code == 200
            assert resp.json()["total"] == 0

    async def test_list_nonexistent_cluster_returns_404(self, edge_env_db):
        app = _make_app(edge_env_db)
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test", headers=AUTH) as c:
            resp = await c.get("/api/v1/clusters/9999/edge-env/versions")
            assert resp.status_code == 404

    async def test_get_nonexistent_version_returns_404(self, edge_env_db):
        c = Cluster(name="tc", status=1)
        edge_env_db.add(c)
        await edge_env_db.commit()
        await edge_env_db.refresh(c)
        app = _make_app(edge_env_db)
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test", headers=AUTH) as cl:
            resp = await cl.get(f"/api/v1/clusters/{c.id}/edge-env/versions/9999")
            assert resp.status_code == 404

    async def test_version_list_uses_config_version(self, edge_env_db):
        """Version list should query ConfigVersion with resource_type='edge_env'."""
        c = Cluster(name="tc", status=1)
        edge_env_db.add(c)
        await edge_env_db.commit()
        await edge_env_db.refresh(c)
        # Insert a ConfigVersion record directly
        cv = ConfigVersion(
            cluster_id=c.id, resource_type="edge_env", resource_id=c.id,
            version=1, config='{"yaml": "deploy:\\n  prefix: edge\\n"}',
        )
        edge_env_db.add(cv)
        await edge_env_db.commit()
        app = _make_app(edge_env_db)
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test", headers=AUTH) as cl:
            resp = await cl.get(f"/api/v1/clusters/{c.id}/edge-env/versions")
            assert resp.status_code == 200
            body = resp.json()
            assert body["total"] >= 1
            assert any(v["version"] == 1 for v in body["items"])


class TestEdgeEnvReadStream:

    async def test_read_stream_nonexistent_cluster_returns_404(self, edge_env_db):
        app = _make_app(edge_env_db)
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test", headers=AUTH) as c:
            resp = await c.get("/api/v1/clusters/9999/edge-env/read-stream?node_id=1")
            assert resp.status_code == 404

    async def test_read_stream_nonexistent_node_returns_404(self, edge_env_db):
        c = Cluster(name="tc", status=1)
        edge_env_db.add(c)
        await edge_env_db.commit()
        await edge_env_db.refresh(c)
        app = _make_app(edge_env_db)
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test", headers=AUTH) as cl:
            resp = await cl.get(f"/api/v1/clusters/{c.id}/edge-env/read-stream?node_id=9999")
            assert resp.status_code == 404

    async def test_read_stream_returns_sse_events(self, edge_env_db):
        c = Cluster(name="tc", status=1)
        edge_env_db.add(c)
        await edge_env_db.commit()
        await edge_env_db.refresh(c)
        n = Node(cluster_id=c.id, ip="192.168.1.1", service_port=80, management_port=9990, edge_path="/data/edge", status=1)
        edge_env_db.add(n)
        await edge_env_db.commit()
        await edge_env_db.refresh(n)

        async def fake_stream(*args, **kwargs):
            yield "data: {\"line\": \"TASK [read edge.env]\"}\n\n"
            yield "data: {\"line\": \"prefix: edge\", \"percent\": 50}\n\n"
            yield "data: {\"rc\": 0, \"status\": \"successful\", \"percent\": 100}\n\n"

        mock_svc = MagicMock(spec=AnsibleRunnerService)
        mock_svc.generic_run = AsyncMock(return_value={"rc": 0, "stdout": "deploy:\n  prefix: edge\n", "shell_stdout": ""})
        app = _make_app(edge_env_db)
        with (
            patch("app.api.v1.cluster_edge_env._run_ansible_stream", side_effect=fake_stream),
            patch("app.api.v1.cluster_edge_env._ansible_service", mock_svc),
        ):
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test", headers=AUTH) as cl:
                async with cl.stream("GET", f"/api/v1/clusters/{c.id}/edge-env/read-stream?node_id={n.id}") as resp:
                    assert resp.status_code == 200
                    events = []
                    async for line in resp.aiter_lines():
                        if line.startswith("data: "):
                            events.append(line)
                    assert len(events) >= 2
                    assert '"line"' in events[0]
                    last_event = events[-1]
                    assert '"type": "content"' in last_event
                    assert '"content"' in last_event


class TestEdgeEnvDeployFailureDetection:
    """Node with ansible rc != 0 must be marked failed (not success)."""

    async def test_deploy_marks_node_failed_when_ansible_rc_nonzero(self, edge_env_db):
        """rc != 0 in _run_ansible_stream's final event must mark node failed."""
        import json
        c = Cluster(name="rc-test", status=1)
        edge_env_db.add(c)
        await edge_env_db.commit()
        await edge_env_db.refresh(c)
        n1 = Node(cluster_id=c.id, ip="192.168.1.1", service_port=80, management_port=9990, edge_path="/data/edge", status=1)
        edge_env_db.add(n1)
        await edge_env_db.commit()
        await edge_env_db.refresh(n1)

        async def fake_stream_rc1(*args, **kwargs):
            yield "data: {\"line\": \"TASK [run]\"}\n\n"
            yield "data: {\"rc\": 1, \"status\": \"failed\", \"percent\": 100}\n\n"

        mock_svc = MagicMock(spec=AnsibleRunnerService)
        app = _make_app(edge_env_db)
        valid_content = "deploy:\n  prefix: edge\n  http:\n    edge:\n      listen:\n        - addr: 0.0.0.0:9980\n    admin:\n      listen:\n        - addr: 0.0.0.0:9990\n"
        with (
            patch("app.api.v1.cluster_edge_env._run_ansible_stream", side_effect=fake_stream_rc1),
            patch("app.api.v1.cluster_edge_env._ansible_service", mock_svc),
        ):
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test", headers=AUTH) as cl:
                async with cl.stream("POST", f"/api/v1/clusters/{c.id}/edge-env/deploy", json={"content": valid_content}) as resp:
                    assert resp.status_code == 200
                    node_done = None
                    complete = None
                    async for line in resp.aiter_lines():
                        if not line.startswith("data: "):
                            continue
                        data = json.loads(line[6:])
                        if data.get("type") == "node_done":
                            node_done = data
                        elif data.get("type") == "complete":
                            complete = data
                    assert node_done is not None, "Should emit node_done"
                    assert node_done["status"] == "failed", f"rc!=0 node must be failed, got {node_done['status']}"
                    assert complete["status"] == "all_failed", f"single failed node -> all_failed, got {complete['status']}"

    async def test_deploy_mixed_nodes_marks_partial(self, edge_env_db):
        """One node rc=0, another rc=1 -> overall status partial."""
        import json
        c = Cluster(name="mix-test", status=1)
        edge_env_db.add(c)
        await edge_env_db.commit()
        await edge_env_db.refresh(c)
        n1 = Node(cluster_id=c.id, ip="192.168.1.1", service_port=80, management_port=9990, edge_path="/data/edge", status=1)
        n2 = Node(cluster_id=c.id, ip="192.168.1.2", service_port=80, management_port=9990, edge_path="/data/edge", status=1)
        edge_env_db.add_all([n1, n2])
        await edge_env_db.commit()
        await edge_env_db.refresh(n1)
        await edge_env_db.refresh(n2)

        async def fake_stream(*args, **kwargs):
            yield "data: {\"rc\": 0, \"status\": \"successful\", \"percent\": 100}\n\n"

        mock_svc = MagicMock(spec=AnsibleRunnerService)
        app = _make_app(edge_env_db)
        valid_content = "deploy:\n  prefix: edge\n  http:\n    edge:\n      listen:\n        - addr: 0.0.0.0:9980\n    admin:\n      listen:\n        - addr: 0.0.0.0:9990\n"
        rc_values = iter([0, 1])
        real_run_playbook = mock_svc.run_playbook

        async def fake_stream_rc(*args, **kwargs):
            rc = next(rc_values)
            yield f"data: {{\"rc\": {rc}, \"status\": \"{'successful' if rc == 0 else 'failed'}\", \"percent\": 100}}\n\n"

        with (
            patch("app.api.v1.cluster_edge_env._run_ansible_stream", side_effect=fake_stream_rc),
            patch("app.api.v1.cluster_edge_env._ansible_service", mock_svc),
        ):
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test", headers=AUTH) as cl:
                async with cl.stream("POST", f"/api/v1/clusters/{c.id}/edge-env/deploy", json={"content": valid_content}) as resp:
                    assert resp.status_code == 200
                    done_statuses = []
                    complete = None
                    async for line in resp.aiter_lines():
                        if not line.startswith("data: "):
                            continue
                        data = json.loads(line[6:])
                        if data.get("type") == "node_done":
                            done_statuses.append(data["status"])
                        elif data.get("type") == "complete":
                            complete = data
                    assert sorted(done_statuses) == ["failed", "success"]
                    assert complete["status"] == "partial", f"mixed nodes -> partial, got {complete['status']}"
