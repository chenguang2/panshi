"""SSL 删除清版本 + 存量孤儿清理（ssl-version-orphan-purge）。

背景：cluster_ssl DELETE 是全仓库唯一漏「删除时清版本」的域——7 月的 gm-server(id=2)
删除后版本 v1 成孤儿，今天新建 uapm 复用 id=2 被错误继承（含回滚进死证书的事故链）。

覆盖：
1. 删除证书（delete_db）→ 版本快照清零；后续同 id 新证书不见旧条目；
2. 仅 delete_edge 保留平台记录与版本（现状不变）；
3. 启动清理 purge_orphan_ssl_versions：早于证书 created_at 的快照清除、
   同代快照保留、重复调用幂等。
"""
import json
from datetime import datetime, timedelta
from unittest.mock import MagicMock, patch

import pytest
from sqlalchemy import select

from app.models.cluster import ConfigVersion
from app.services.edge_client import EdgeClient
from app.services.ssl_version_cleanup import purge_orphan_ssl_versions

FAKE_EDGE_OK = {"ssl_id": "ok"}


async def _create_cert(client, name: str) -> int:
    resp = await client.post(
        "/api/v1/clusters/1/ssl",
        json={"name": name, "sni": "edge.local,a.com", "cert": "CERT-PEM", "private_key": "K", "cluster_id": 1},
    )
    assert resp.status_code in (200, 201), resp.text
    return resp.json()["id"]


async def _mk_version(session, cert_id: int, version: int, cfg: dict, created_at=None) -> None:
    async with session() as s:
        row = ConfigVersion(cluster_id=1, resource_type="ssl", resource_id=cert_id, version=version, config=json.dumps(cfg))
        if created_at is not None:
            row.created_at = created_at
        s.add(row)
        await s.commit()


async def _version_ids(session, cert_id: int) -> list[int]:
    async with session() as s:
        rows = (
            await s.execute(
                select(ConfigVersion).where(
                    ConfigVersion.resource_type == "ssl", ConfigVersion.resource_id == cert_id
                )
            )
        ).scalars().all()
        return [r.id for r in rows]


class TestDeletePurgesVersions:
    @pytest.mark.asyncio
    async def test_delete_cert_purges_its_versions(self, async_authed_client, isolated_session):
        cert_id = await _create_cert(async_authed_client, "zz-orphan-del")
        await _mk_version(isolated_session, cert_id, 1, {"name": "zz-orphan-del", "sni": "a.com"})

        resp = await async_authed_client.request(
            "DELETE", f"/api/v1/clusters/1/ssl/{cert_id}", json={"delete_db": True, "delete_edge": False}
        )
        assert resp.status_code == 200, resp.text
        assert await _version_ids(isolated_session, cert_id) == []

    @pytest.mark.asyncio
    async def test_new_cert_with_reused_id_sees_no_old_history(self, async_authed_client, isolated_session):
        """uapm 案例回归：删旧建新复用 id，新证书版本历史必须为空。"""
        old_id = await _create_cert(async_authed_client, "zz-reuse-old")
        await _mk_version(isolated_session, old_id, 1, {"name": "zz-reuse-old", "sni": "a.com"})

        resp = await async_authed_client.request(
            "DELETE", f"/api/v1/clusters/1/ssl/{old_id}", json={"delete_db": True, "delete_edge": False}
        )
        assert resp.status_code == 200, resp.text

        resp = await async_authed_client.post(
            "/api/v1/clusters/1/ssl",
            json={"name": "zz-reuse-new", "sni": "edge.local,b.com", "cert": "C2", "private_key": "K", "cluster_id": 1},
        )
        assert resp.status_code in (200, 201), resp.text
        new_id = resp.json()["id"]
        hist = await async_authed_client.get(f"/api/v1/clusters/1/ssl/{new_id}/history")
        assert hist.status_code == 200, hist.text
        assert hist.json()["total"] == 0

    @pytest.mark.asyncio
    async def test_edge_only_delete_keeps_versions(self, async_authed_client, isolated_session):
        cert_id = await _create_cert(async_authed_client, "zz-keep-ver")
        await _mk_version(isolated_session, cert_id, 1, {"name": "zz-keep-ver"})

        resp = await async_authed_client.request(
            "DELETE", f"/api/v1/clusters/1/ssl/{cert_id}", json={"delete_db": False, "delete_edge": True}
        )
        assert resp.status_code == 200, resp.text
        assert len(await _version_ids(isolated_session, cert_id)) == 1


class TestStartupOrphanPurge:
    @pytest.mark.asyncio
    async def test_backdated_orphan_removed_same_generation_kept(self, async_authed_client, isolated_session):
        """uapm 场景：早于证书创建的孤儿清除；同代快照（哪怕异名）保留。"""
        cert_id = await _create_cert(async_authed_client, "zz-sweep-target")
        cert_created = None
        async with isolated_session() as s:
            from app.models.ssl import SslCertificate

            cert_created = (await s.get(SslCertificate, cert_id)).created_at

        # 孤儿：7 月（早于证书创建）；同代：创建之后（异名也保留——可见化交由前端）
        await _mk_version(
            isolated_session, cert_id, 1,
            {"name": "gm-server", "sni": "qcg.com"}, created_at=cert_created - timedelta(days=90),
        )
        await _mk_version(
            isolated_session, cert_id, 2,
            {"name": "zz-sweep-target", "sni": "edge.local"}, created_at=cert_created + timedelta(minutes=5),
        )

        async with isolated_session() as s:
            removed = await purge_orphan_ssl_versions(s)
        assert removed == 1
        ids = await _version_ids(isolated_session, cert_id)
        assert len(ids) == 1

    @pytest.mark.asyncio
    async def test_idempotent(self, async_authed_client, isolated_session):
        cert_id = await _create_cert(async_authed_client, "zz-sweep-idem")
        async with isolated_session() as s:
            from app.models.ssl import SslCertificate

            cert_created = (await s.get(SslCertificate, cert_id)).created_at
        await _mk_version(isolated_session, cert_id, 1, {"name": "old"}, created_at=cert_created - timedelta(days=1))

        async with isolated_session() as s:
            first = await purge_orphan_ssl_versions(s)
        assert first == 1
        async with isolated_session() as s:
            second = await purge_orphan_ssl_versions(s)
        assert second == 0

    @pytest.mark.asyncio
    async def test_other_domains_untouched(self, async_authed_client, isolated_session):
        """清理只作用于 ssl 资源域；route 等其它域的版本不受影响。"""
        async with isolated_session() as s:
            s.add(ConfigVersion(cluster_id=1, resource_type="route", resource_id=1, version=1, config="{}"))
            await s.commit()
        async with isolated_session() as s:
            await purge_orphan_ssl_versions(s)
        async with isolated_session() as s:
            rows = (
                await s.execute(select(ConfigVersion).where(ConfigVersion.resource_type == "route"))
            ).scalars().all()
            assert len(rows) == 1


class TestSourceGuard:
    """源码守卫：cluster_ssl 的 DELETE 端点必须含版本快照清理（防回归再漏，uapm 案例根因）。

    照 test_publish_response.py 的源码模式守卫风格：正则检查函数体。
    """

    def test_delete_endpoint_purges_config_versions(self):
        import inspect
        import re

        from app.api.v1 import cluster_ssl

        src = inspect.getsource(cluster_ssl.delete_ssl_certificate)
        assert re.search(r"ConfigVersion\.__table__\.delete\(\)", src), (
            "cluster_ssl DELETE 端点缺少版本快照清理——删除证书会留下孤儿版本，"
            "经 id 复用被新证书继承（uapm 案例）"
        )
        # 清理必须在同事务（delete cert 之前或同块），且 resource_type 钉死 ssl
        assert re.search(r'resource_type\s*==\s*"ssl"', src)

    def test_ssl_only_domain_with_purge_is_not_unique_anymore(self):
        """全域对照：凡有版本写/读流的集群域，删除端点必须见清理证据。

        证据形态任一：内联 ConfigVersion.__table__.delete()、共享 helper
        （stream_proxy 的 _delete_proxy_versions 被 dns_proxies 复用）、
        或专用 purge 函数。无版本流的域（如 nodes）不要求。
        """
        import inspect
        import re
        from pathlib import Path

        from app.api.v1 import cluster_ssl

        api_dir = Path(inspect.getfile(cluster_ssl)).parent
        missing = []
        for f in sorted(api_dir.glob("cluster_*.py")):
            src = f.read_text()
            has_version_flow = bool(
                re.search(r"publish_resource|rollback_resource|list_config_versions|delete_config_version", src)
            )
            if not has_version_flow or "@router.delete" not in src:
                continue
            has_purge_evidence = bool(
                re.search(r"ConfigVersion\.__table__\.delete\(\)|_delete_proxy_versions|purge", src)
            )
            if not has_purge_evidence:
                missing.append(f.name)
        assert missing == [], f"以下集群域有版本流但删除端点未见清理证据: {missing}"
