"""edge.env 部署 SSE 的节点执行路径标注（SSH 腿 route/relay_via）。

契约：node_start / node_done（成功与失败）/ complete.node_results[] 均带
route（relay|direct）；经中继时另带 relay_via（跳板主机字符串），直连时不出现。
判定与 ansible 同源：relay_registry.ssh_jump_for_ip(node.ip)。
"""
import json
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient

from app.api.v1.cluster_edge_env import router
from app.core.database import get_db
from app.models.cluster import Cluster, Node
from app.services import relay_registry
from app.services.ansible_service import AnsibleRunnerService
from tests.api_helpers import admin_auth_headers

AUTH = admin_auth_headers()
JUMP = "jboss@192.168.0.13"
VALID = (
    "deploy:\n  prefix: edge\n  http:\n    edge:\n      listen:\n"
    "        - addr: 0.0.0.0:9980\n    admin:\n      listen:\n"
    "        - addr: 0.0.0.0:9990\n"
)


@pytest.fixture
async def edge_env_db(test_db):
    from app.models.user import User
    from app.core.security import hash_password
    if await test_db.get(User, 1) is None:
        test_db.add(User(id=1, username="api_user", password_hash=hash_password("password123"),
                         role="admin", status=1))
        await test_db.commit()
    return test_db


def _make_app(db_session):
    app = FastAPI()

    async def override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = override_get_db
    app.include_router(router, prefix="/api/v1")
    return app


async def _seed_node(db, ip="192.168.1.1"):
    c = Cluster(name=f"route-{ip}", status=1)
    db.add(c)
    await db.commit()
    await db.refresh(c)
    n = Node(cluster_id=c.id, ip=ip, service_port=80, management_port=9990,
             edge_path="/data/edge", status=1)
    db.add(n)
    await db.commit()
    await db.refresh(n)
    return c, n


def _fake_stream(rc=0, line=None):
    async def _gen(*args, **kwargs):
        if line is not None:
            yield f"data: {json.dumps({'line': line})}\n\n"
        yield f"data: {json.dumps({'rc': rc, 'status': 'successful' if rc == 0 else 'failed', 'percent': 100})}\n\n"
    return _gen


async def _collect(app, cid, node_ids=None):
    payload = {"content": VALID}
    if node_ids:
        payload["node_ids"] = node_ids
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test", headers=AUTH) as cl:
        async with cl.stream("POST", f"/api/v1/clusters/{cid}/edge-env/deploy", json=payload) as resp:
            assert resp.status_code == 200
            events = []
            async for line in resp.aiter_lines():
                if line.startswith("data: "):
                    events.append(json.loads(line[6:]))
            return events


def _by_type(events, etype):
    return [e for e in events if e.get("type") == etype]


async def test_relay_marks_start_done_and_complete(edge_env_db, monkeypatch):
    monkeypatch.setattr(relay_registry, "ssh_jump_for_ip", lambda ip: JUMP)
    c, n = await _seed_node(edge_env_db)
    app = _make_app(edge_env_db)
    with (
        patch("app.api.v1.cluster_edge_env._run_ansible_stream", side_effect=_fake_stream(0)),
        patch("app.api.v1.cluster_edge_env._ansible_service", MagicMock(spec=AnsibleRunnerService)),
        patch("app.api.v1.cluster_edge_env.create_config_version", new_callable=AsyncMock, return_value=1),
    ):
        events = await _collect(app, c.id, [n.id])

    start = _by_type(events, "node_start")[0]
    assert start["route"] == "relay"
    assert start["relay_via"] == JUMP

    done = _by_type(events, "node_done")[0]
    assert done["status"] == "success"
    assert done["route"] == "relay"
    assert done["relay_via"] == JUMP

    complete = _by_type(events, "complete")[0]
    assert complete["node_results"][0]["route"] == "relay"
    assert complete["node_results"][0]["relay_via"] == JUMP


async def test_direct_omits_relay_via(edge_env_db, monkeypatch):
    monkeypatch.setattr(relay_registry, "ssh_jump_for_ip", lambda ip: None)
    c, n = await _seed_node(edge_env_db)
    app = _make_app(edge_env_db)
    with (
        patch("app.api.v1.cluster_edge_env._run_ansible_stream", side_effect=_fake_stream(0)),
        patch("app.api.v1.cluster_edge_env._ansible_service", MagicMock(spec=AnsibleRunnerService)),
        patch("app.api.v1.cluster_edge_env.create_config_version", new_callable=AsyncMock, return_value=1),
    ):
        events = await _collect(app, c.id, [n.id])

    for etype in ("node_start", "node_done"):
        ev = _by_type(events, etype)[0]
        assert ev["route"] == "direct"
        assert "relay_via" not in ev

    complete = _by_type(events, "complete")[0]
    assert complete["node_results"][0]["route"] == "direct"
    assert "relay_via" not in complete["node_results"][0]


async def test_failed_node_still_carries_relay(edge_env_db, monkeypatch):
    monkeypatch.setattr(relay_registry, "ssh_jump_for_ip", lambda ip: JUMP)
    c, n = await _seed_node(edge_env_db)
    app = _make_app(edge_env_db)
    with (
        patch("app.api.v1.cluster_edge_env._run_ansible_stream", side_effect=_fake_stream(1)),
        patch("app.api.v1.cluster_edge_env._ansible_service", MagicMock(spec=AnsibleRunnerService)),
        patch("app.api.v1.cluster_edge_env.create_config_version", new_callable=AsyncMock, return_value=1),
    ):
        events = await _collect(app, c.id, [n.id])

    done = _by_type(events, "node_done")[0]
    assert done["status"] == "failed"
    assert done["route"] == "relay"
    assert done["relay_via"] == JUMP

    complete = _by_type(events, "complete")[0]
    assert complete["node_results"][0]["status"] == "failed"
    assert complete["node_results"][0]["route"] == "relay"
    assert complete["node_results"][0]["relay_via"] == JUMP


async def test_false_success_guard_path_carries_relay(edge_env_db, monkeypatch):
    """防假成功分支（no hosts matched）也必须带 route。"""
    monkeypatch.setattr(relay_registry, "ssh_jump_for_ip", lambda ip: JUMP)
    c, n = await _seed_node(edge_env_db)
    app = _make_app(edge_env_db)
    with (
        patch("app.api.v1.cluster_edge_env._run_ansible_stream",
              side_effect=_fake_stream(0, line="skipping: no hosts matched")),
        patch("app.api.v1.cluster_edge_env._ansible_service", MagicMock(spec=AnsibleRunnerService)),
        patch("app.api.v1.cluster_edge_env.create_config_version", new_callable=AsyncMock, return_value=1),
    ):
        events = await _collect(app, c.id, [n.id])

    done = _by_type(events, "node_done")[0]
    assert done["status"] == "failed"
    assert "不在 Ansible 主机清单" in done["error"]
    assert done["route"] == "relay"
    assert done["relay_via"] == JUMP

    complete = _by_type(events, "complete")[0]
    assert complete["node_results"][0]["route"] == "relay"
    assert complete["node_results"][0]["relay_via"] == JUMP


# ── 单节点读取 GET /edge-env（read_edge_env） ────────────────

def _mock_read_service(stdout="prefix: edge"):
    svc = MagicMock(spec=AnsibleRunnerService)
    svc.generic_run = AsyncMock(return_value={"rc": 0, "stdout": stdout, "stderr": ""})
    return svc


async def _get_edge_env(app, cid, nid):
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test", headers=AUTH) as cl:
        resp = await cl.get(f"/api/v1/clusters/{cid}/edge-env?node_id={nid}")
        assert resp.status_code == 200
        return resp.json()


async def test_read_relay_carries_via(edge_env_db, monkeypatch):
    monkeypatch.setattr(relay_registry, "ssh_jump_for_ip", lambda ip: JUMP)
    c, n = await _seed_node(edge_env_db)
    app = _make_app(edge_env_db)
    with patch("app.api.v1.cluster_edge_env._ansible_service", _mock_read_service()):
        body = await _get_edge_env(app, c.id, n.id)
    assert body["route"] == "relay"
    assert body["relay_via"] == JUMP
    assert body["content"] == "prefix: edge"


async def test_read_direct_omits_via(edge_env_db, monkeypatch):
    monkeypatch.setattr(relay_registry, "ssh_jump_for_ip", lambda ip: None)
    c, n = await _seed_node(edge_env_db)
    app = _make_app(edge_env_db)
    with patch("app.api.v1.cluster_edge_env._ansible_service", _mock_read_service()):
        body = await _get_edge_env(app, c.id, n.id)
    assert body["route"] == "direct"
    assert "relay_via" not in body


# ── 读取流 GET /edge-env/read-stream（read_edge_env_stream） ──

async def _read_stream(app, cid, nid):
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test", headers=AUTH) as cl:
        async with cl.stream("GET", f"/api/v1/clusters/{cid}/edge-env/read-stream?node_id={nid}") as resp:
            assert resp.status_code == 200
            events = []
            async for line in resp.aiter_lines():
                if line.startswith("data: "):
                    events.append(json.loads(line[6:]))
            return events


async def test_read_stream_content_marks_relay(edge_env_db, monkeypatch):
    monkeypatch.setattr(relay_registry, "ssh_jump_for_ip", lambda ip: JUMP)
    c, n = await _seed_node(edge_env_db)
    app = _make_app(edge_env_db)
    with (
        patch("app.api.v1.cluster_edge_env._run_ansible_stream", side_effect=_fake_stream(0)),
        patch("app.api.v1.cluster_edge_env._ansible_service", _mock_read_service()),
    ):
        events = await _read_stream(app, c.id, n.id)
    content = _by_type(events, "content")[0]
    assert content["route"] == "relay"
    assert content["relay_via"] == JUMP


async def test_read_stream_content_direct_omits_via(edge_env_db, monkeypatch):
    monkeypatch.setattr(relay_registry, "ssh_jump_for_ip", lambda ip: None)
    c, n = await _seed_node(edge_env_db)
    app = _make_app(edge_env_db)
    with (
        patch("app.api.v1.cluster_edge_env._run_ansible_stream", side_effect=_fake_stream(0)),
        patch("app.api.v1.cluster_edge_env._ansible_service", _mock_read_service()),
    ):
        events = await _read_stream(app, c.id, n.id)
    content = _by_type(events, "content")[0]
    assert content["route"] == "direct"
    assert "relay_via" not in content


async def test_read_stream_error_marks_relay(edge_env_db, monkeypatch):
    """失败/异常路径也带 route。"""
    monkeypatch.setattr(relay_registry, "ssh_jump_for_ip", lambda ip: JUMP)
    c, n = await _seed_node(edge_env_db)
    app = _make_app(edge_env_db)

    svc = MagicMock(spec=AnsibleRunnerService)
    svc.generic_run = AsyncMock(side_effect=RuntimeError("boom"))
    with (
        patch("app.api.v1.cluster_edge_env._run_ansible_stream", side_effect=_fake_stream(0)),
        patch("app.api.v1.cluster_edge_env._ansible_service", svc),
    ):
        events = await _read_stream(app, c.id, n.id)
    err = _by_type(events, "error")[0]
    assert err["route"] == "relay"
    assert err["relay_via"] == JUMP
