"""区域注册表（relay_gateways）数据模型测试。

覆盖 openspec/changes/add-relay-gateway/specs/relay-region-registry：
- 表与字段存在性（TDD RED 锚点）
- Cluster.region_code 列存在性
- 写读 round-trip（SQLite/PG 双方言下运行；PG 由 TEST_DB_BACKEND=pg 激活）
"""
import pytest
from sqlalchemy import inspect, text

RELAY_COLS = {"id", "code", "name", "http_base_url", "ssh_jump", "status", "created_at", "updated_at"}


async def test_relay_gateways_table_exists(isolated_session):
    """TDD RED：relay_gateways 表必须存在且字段齐备。"""
    async with isolated_session() as s:
        cols = await s.run_sync(lambda sess: {c["name"] for c in inspect(sess.get_bind()).get_columns("relay_gateways")})
        assert RELAY_COLS <= cols, f"缺少字段: {RELAY_COLS - cols}"


async def test_cluster_has_region_code_column(isolated_session):
    """TDD RED：ps_cluster 必须有 region_code 列。"""
    async with isolated_session() as s:
        cols = await s.run_sync(lambda sess: {c["name"] for c in inspect(sess.get_bind()).get_columns("ps_cluster")})
        assert "region_code" in cols


async def test_relay_gateway_roundtrip(isolated_session):
    """写读 round-trip：code/name/路由字段/status 原样读回（PG 严格类型下的方言信号）。"""
    async with isolated_session() as s:
        await s.execute(
            text(
                "INSERT INTO relay_gateways (code, name, http_base_url, ssh_jump, status) "
                "VALUES ('luju', '路局A', 'http://10.10.1.1:8443', 'tunnel@10.10.1.1:22', 'enabled')"
            )
        )
        await s.commit()
        row = (
            await s.execute(
                text("SELECT code, name, http_base_url, ssh_jump, status FROM relay_gateways WHERE code = 'luju'")
            )
        ).first()
        assert row is not None
        assert row[0] == "luju"
        assert row[1] == "路局A"
        assert row[2] == "http://10.10.1.1:8443"
        assert row[3] == "tunnel@10.10.1.1:22"
        assert row[4] == "enabled"


async def test_cluster_region_code_roundtrip(isolated_session):
    """集群 region_code 写读 round-trip（含 NULL 默认态）。"""
    async with isolated_session() as s:
        await s.execute(text("INSERT INTO ps_cluster (name, status) VALUES ('relay-rt-cluster', 1)"))
        await s.commit()
        cid = (
            await s.execute(text("SELECT id FROM ps_cluster WHERE name = 'relay-rt-cluster'"))
        ).scalar_one()
        assert (
            await s.execute(text("SELECT region_code FROM ps_cluster WHERE id = :i"), {"i": cid})
        ).scalar_one() is None
        await s.execute(
            text("UPDATE ps_cluster SET region_code = 'luju' WHERE id = :i"), {"i": cid}
        )
        await s.commit()
        assert (
            await s.execute(text("SELECT region_code FROM ps_cluster WHERE id = :i"), {"i": cid})
        ).scalar_one() == "luju"
