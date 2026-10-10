"""集群列表/详情响应透传 current_version 与 region_code（cluster-ux-close-loop 3.1）。

背景：ps_cluster 模型本有 current_version（edge.env 集群配置版本）列，
但 ClusterResponse 未声明该字段 → 列表/详情静默丢弃，前端卡片微标无从渲染。
本测试钉住两个字段在 GET /clusters 与 GET /clusters/{id} 的透传（无模型变更）。
"""
import asyncio
from contextlib import contextmanager

from fastapi.testclient import TestClient
from sqlalchemy import select

from app.main import app
from app.core.database import get_db
from app.core.security import create_access_token, hash_password
from app.models.cluster import Cluster
from app.models.user import User
from tests.api_helpers import isolated_app_lifespan
from tests.conftest import _isolated_engine_factory, _prepare_isolated_db


def _build_ctx():
    engine, S, teardown = _isolated_engine_factory()

    async def _setup():
        await _prepare_isolated_db(engine)
        async with S() as s:
            s.add(User(id=1, username="admin",
                       password_hash=hash_password("panshi123"), role="admin", status=1))
            # C1：已发布过 edge.env（v3）且挂接区域；C2：从未发布、直连
            s.add(Cluster(id=1, name="demo-cluster", current_version=3,
                          region_code="aoh", status=1))
            s.add(Cluster(id=2, name="fresh-cluster", current_version=None,
                          region_code=None, status=1))
            await s.commit()
            admin_hash = (await s.get(User, 1)).password_hash
        return admin_hash

    admin_hash = asyncio.run(_setup())

    async def override_get_db():
        async with S() as session:
            yield session

    app.dependency_overrides[get_db] = override_get_db
    return {
        "headers": {"Authorization": f"Bearer {create_access_token({'sub': '1'}, password_hash=admin_hash)}"},
    }, teardown


@contextmanager
def passthrough_env():
    ctx, teardown = _build_ctx()
    try:
        with isolated_app_lifespan(), TestClient(app) as client:
            yield client, ctx
    finally:
        app.dependency_overrides.clear()
        asyncio.run(teardown())


def test_list_passes_current_version_and_region_code():
    """GET /clusters 列表项透传 current_version / region_code（None → null）。"""
    with passthrough_env() as (client, ctx):
        resp = client.get("/api/v1/clusters", headers=ctx["headers"])
        assert resp.status_code == 200, resp.text
        by_name = {item["name"]: item for item in resp.json()["items"]}

        demo = by_name["demo-cluster"]
        assert demo["current_version"] == 3
        assert demo["region_code"] == "aoh"

        fresh = by_name["fresh-cluster"]
        assert fresh["current_version"] is None
        assert fresh["region_code"] is None


def test_detail_passes_current_version_and_region_code():
    """GET /clusters/{id} 详情同样透传两字段。"""
    with passthrough_env() as (client, ctx):
        resp = client.get("/api/v1/clusters/1", headers=ctx["headers"])
        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert body["current_version"] == 3
        assert body["region_code"] == "aoh"
