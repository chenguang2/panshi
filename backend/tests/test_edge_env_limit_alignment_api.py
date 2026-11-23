"""edge-upload-limit-alignment 端点级测试：读取诊断 + 部署前自动对齐。

契约（openspec/changes/edge-upload-limit-alignment/specs/edge-env-remote-editing）：
- GET 读取响应带 limits（platform/admin/effective/sufficient/note），admin 缺失时 effective=32；
- POST deploy 下发内容 = 自动对齐后的内容（缺失→inserted、更低→raised、更高→kept 原样），
  并在 SSE 首部输出一行说明；其余内容逐行不变。
"""

import json
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from httpx import AsyncClient, ASGITransport
from fastapi import FastAPI
from sqlalchemy import select

from tests.api_helpers import admin_auth_headers

AUTH = admin_auth_headers()

from app.api.v1.cluster_edge_env import router
from app.core.database import get_db
from app.models.cluster import Cluster, ConfigVersion, Node
from app.services.ansible_service import AnsibleRunnerService

# 真实节点形态（http 级 132m + admin 无该键）
CONTENT_NO_ADMIN = (
    "deploy:\n"
    "  prefix: edge\n"
    "  http:\n"
    "    client_max_body_size: 132m\n"
    "    edge:\n"
    "      listen:\n"
    "        - addr: 0.0.0.0:16611\n"
    "    admin:\n"
    "      listen:\n"
    "        - addr: 0.0.0.0:16621\n"
)

CONTENT_ADMIN_32 = CONTENT_NO_ADMIN.replace(
    "        - addr: 0.0.0.0:16621\n",
    "        - addr: 0.0.0.0:16621\n      client_max_body_size: 32m\n",
)
CONTENT_ADMIN_256 = CONTENT_NO_ADMIN.replace(
    "        - addr: 0.0.0.0:16621\n",
    "        - addr: 0.0.0.0:16621\n      client_max_body_size: 256m\n",
)


def _make_app(db_session):
    app = FastAPI()

    async def override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = override_get_db
    app.include_router(router, prefix="/api/v1")
    return app


@pytest.fixture
async def env_db(test_db):
    from app.models.user import User
    from app.core.security import hash_password

    if await test_db.get(User, 1) is None:
        test_db.add(User(id=1, username="api_user", password_hash=hash_password("password123"),
                         role="admin", status=1))
    cluster = Cluster(name="limit-cluster", status=1)
    test_db.add(cluster)
    await test_db.commit()
    await test_db.refresh(cluster)
    test_db.add(Node(cluster_id=cluster.id, ip="10.9.9.9", service_port=80, management_port=16621,
                    edge_path="/data/edge", status=1))
    await test_db.commit()
    return test_db, cluster


def _lines_of(events: list[str]) -> list[str]:
    """把 SSE data 行解码为其中的 line 文本（后端 json.dumps 默认转义中文）。"""
    out = []
    for e in events:
        try:
            payload = json.loads(e.removeprefix("data: ").removesuffix("\n\n"))
        except json.JSONDecodeError:
            continue
        if payload.get("line"):
            out.append(payload["line"])
    return out


def _deploy_stream_recorder(captured: list[dict], rc: int = 0):
    async def fake_stream(*args, **kwargs):
        captured.append(kwargs.get("extravars") or {})
        yield json.dumps({"line": "TASK [edge_init_env]"}) .join(["data: ", "\n\n"])
        yield f"data: {json.dumps({'rc': rc, 'status': 'successful', 'percent': 100})}\n\n"

    return fake_stream


class TestReadLimitsDiagnosis:
    @pytest.mark.parametrize("content,effective,sufficient,admin_mb", [
        (CONTENT_NO_ADMIN, 32, False, None),
        (CONTENT_ADMIN_32, 32, False, 32),
        (CONTENT_ADMIN_256, 256, True, 256),
    ])
    async def test_read_returns_limits(self, env_db, monkeypatch, content, effective, sufficient, admin_mb):
        db, cluster = env_db
        monkeypatch.setattr("app.api.v1.cluster_edge_env.static_zip_max_mb", lambda: 132)
        svc = MagicMock(spec=AnsibleRunnerService)
        svc.generic_run = AsyncMock(return_value={"rc": 0, "shell_stdout": content, "stdout": content})
        app = _make_app(db)
        with patch("app.api.v1.cluster_edge_env._ansible_service", svc):
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test", headers=AUTH) as c:
                resp = await c.get(f"/api/v1/clusters/{cluster.id}/edge-env?node_id=1")
        assert resp.status_code == 200, resp.text
        limits = resp.json()["limits"]
        assert limits["platform_mb"] == 132
        # 路由声明 response_model_exclude_none：未配置时该键缺省（等价 null）
        assert limits.get("admin_mb") == admin_mb
        assert limits["effective_mb"] == effective
        assert limits["sufficient"] is sufficient
        assert limits["note"]

    async def test_missing_admin_note_explains_pack_baseline(self, env_db, monkeypatch):
        db, cluster = env_db
        monkeypatch.setattr("app.api.v1.cluster_edge_env.static_zip_max_mb", lambda: 132)
        svc = MagicMock(spec=AnsibleRunnerService)
        svc.generic_run = AsyncMock(return_value={"rc": 0, "shell_stdout": CONTENT_NO_ADMIN, "stdout": ""})
        app = _make_app(db)
        with patch("app.api.v1.cluster_edge_env._ansible_service", svc):
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test", headers=AUTH) as c:
                resp = await c.get(f"/api/v1/clusters/{cluster.id}/edge-env?node_id=1")
        note = resp.json()["limits"]["note"]
        assert "http 段写更大的值不生效" in note
        assert "32MB" in note


class TestDeployInjection:
    async def _deploy(self, db, cluster, content, platform_mb, captured):
        app = _make_app(db)
        fake = _deploy_stream_recorder(captured)
        with (
            patch("app.api.v1.cluster_edge_env._run_ansible_stream", side_effect=fake),
            patch("app.api.v1.cluster_edge_env.static_zip_max_mb", lambda: platform_mb),
        ):
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test", headers=AUTH) as c:
                async with c.stream("POST", f"/api/v1/clusters/{cluster.id}/edge-env/deploy",
                                    json={"content": content}) as resp:
                    assert resp.status_code == 200
                    events = []
                    async for line in resp.aiter_lines():
                        if line.startswith("data: "):
                            events.append(line)
        return events

    async def test_missing_admin_key_is_inserted(self, env_db, monkeypatch):
        db, cluster = env_db
        captured: list[dict] = []
        events = await self._deploy(db, cluster, CONTENT_NO_ADMIN, 132, captured)

        sent = captured[0]["env_content"]
        assert "      client_max_body_size: 132m" in sent
        # 其余行原样（只多一行）
        assert len(sent.splitlines()) == len(CONTENT_NO_ADMIN.splitlines()) + 1
        assert any("已自动补齐" in line for line in _lines_of(events)[:1]), _lines_of(events)[:2]

    async def test_lower_admin_value_is_raised(self, env_db):
        db, cluster = env_db
        captured: list[dict] = []
        events = await self._deploy(db, cluster, CONTENT_ADMIN_32, 132, captured)

        sent = captured[0]["env_content"]
        assert "client_max_body_size: 132m" in sent
        assert "client_max_body_size: 32m" not in sent
        assert any("抬到 132m" in line for line in _lines_of(events)[:1]), _lines_of(events)[:2]

    async def test_higher_admin_value_kept(self, env_db):
        db, cluster = env_db
        captured: list[dict] = []
        events = await self._deploy(db, cluster, CONTENT_ADMIN_256, 132, captured)

        assert captured[0]["env_content"] == CONTENT_ADMIN_256
        # kept 不推说明行（首事件即 ansible 行）
        assert not any("已自动补齐" in line or "抬到" in line for line in _lines_of(events)[:1])

    async def test_version_records_deployed_content(self, env_db):
        """版本基线 = 实际下发（对齐后）内容，读取节点/历史时才能自证。"""
        db, cluster = env_db
        captured: list[dict] = []
        await self._deploy(db, cluster, CONTENT_NO_ADMIN, 132, captured)
        db.expire_all()
        rows = (await db.execute(
            select(ConfigVersion).where(ConfigVersion.resource_type == "edge_env")
        )).scalars().all()
        assert rows, "部署成功应产生 edge_env 版本"
        assert "client_max_body_size: 132m" in rows[-1].config
