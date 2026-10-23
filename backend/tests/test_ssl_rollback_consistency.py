"""SSL 回滚/发布链路的 sni ≡ SAN 一致性（ssl-cert-rollback-consistency）。

根因背景（uapm 案例）：版本快照的 SNI 键跨三代格式（sni 字符串 / snis 数组 / 更老的
certs+keys 组合），回滚恢复只认 `sni` —— 回滚到多 SNI 版本静默不恢复、回滚到老版本
被老窄值覆盖，sni 与证书本体 SAN 脱节。

修复语义（design D1-D5）：证书 PEM SAN 为唯一事实源——
1. 回滚恢复键名双读（snis/sni）；
2. 回滚恢复 PEM 后从 SAN 重同步 sni（解析失败降级键名兼容结果）；
3. 发布时匹配名单从 PEM SAN 推导（解析失败回退现值）并回写 cert.sni；
4. 响应携带派生布尔 sni_mismatch（PEM 解析失败恒 False）。
"""
import ipaddress
import json
from contextlib import ExitStack
from datetime import datetime, timedelta, timezone
from unittest.mock import MagicMock, patch

import pytest
from cryptography import x509
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from cryptography.x509.oid import NameOID
from sqlalchemy import select

from app.models.cluster import ConfigVersion, Node
from app.services.edge_client import EdgeClient

FAKE_EDGE_OK = {"ssl_id": "ok"}


def _pem(dns_sans: list[str] | None = None, ip_sans: list[str] | None = None) -> str:
    """自签证书（可带 SAN）；SAN 决定 sni ≡ SAN 断言的锚点。"""
    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    now = datetime.now(timezone.utc)
    name = x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, "rollback-test.local")])
    builder = (
        x509.CertificateBuilder()
        .subject_name(name)
        .issuer_name(name)
        .public_key(key.public_key())
        .serial_number(x509.random_serial_number())
        .not_valid_before(now - timedelta(days=1))
        .not_valid_after(now + timedelta(days=365))
    )
    if dns_sans or ip_sans:
        items: list[x509.GeneralName] = [x509.DNSName(d) for d in (dns_sans or [])]
        items += [x509.IPAddress(ipaddress.ip_address(ip)) for ip in (ip_sans or [])]
        builder = builder.add_extension(x509.SubjectAlternativeName(items), critical=False)
    cert = builder.sign(key, hashes.SHA256())
    return cert.public_bytes(serialization.Encoding.PEM).decode()


async def _create_cert(client, name: str, sni: str, cert: str) -> int:
    resp = await client.post(
        "/api/v1/clusters/1/ssl",
        json={"name": name, "sni": sni, "cert": cert, "private_key": "KEY-PEM", "cluster_id": 1},
    )
    assert resp.status_code in (200, 201), resp.text
    return resp.json()["id"]


async def _mk_version(session, cert_id: int, version: int, cfg: dict) -> None:
    async with session() as s:
        s.add(
            ConfigVersion(cluster_id=1, resource_type="ssl", resource_id=cert_id, version=version, config=json.dumps(cfg))
        )
        await s.commit()


async def _detail(client, cert_id: int) -> dict:
    resp = await client.get(f"/api/v1/clusters/1/ssl/{cert_id}")
    assert resp.status_code == 200, resp.text
    return resp.json()


async def _rollback(client, cert_id: int, version: int):
    return await client.post(f"/api/v1/clusters/1/ssl/{cert_id}/rollback/{version}")


async def _add_node(session) -> None:
    """publish 需要集群有在线节点才会走 Edge 调用。"""
    async with session() as s:
        s.add(Node(cluster_id=1, ip="10.9.0.9", service_port=80, management_port=9180, edge_path="/edge", status=1))
        await s.commit()


def _publish_patch():
    stack = ExitStack()
    edge_mock = MagicMock(return_value=FAKE_EDGE_OK)
    stack.enter_context(patch.object(EdgeClient, "api", edge_mock))
    stack.enter_context(patch("app.services.edge_sync.get_edge_logger", return_value=MagicMock()))
    return stack, edge_mock


class TestRollbackKeyCompat:
    @pytest.mark.asyncio
    async def test_rollback_dual_read_snisArray(self, async_authed_client, isolated_session):
        """快照用 snis 数组（新格式）：回滚后 sni 从 snis 恢复，不再静默丢弃。"""
        cert_id = await _create_cert(async_authed_client, "zz-rb-arr", "edge.local,x.com", "CERT-PEM")
        await _mk_version(
            isolated_session, cert_id, 1,
            {"name": "zz-rb-arr", "cert": "CERT-PEM", "key": "K", "type": "server",
             "snis": ["edge.local", "a.com", "192.168.0.13"]},
        )
        resp = await _rollback(async_authed_client, cert_id, 1)
        assert resp.status_code == 200, resp.text
        d = await _detail(async_authed_client, cert_id)
        sni_set = set(d["sni"].split(","))
        assert {"a.com", "192.168.0.13"} <= sni_set

    @pytest.mark.asyncio
    async def test_rollback_dual_read_sniString(self, async_authed_client, isolated_session):
        """快照用 sni 字符串（老格式）：回滚后 sni 恢复并合并系统保留项。"""
        cert_id = await _create_cert(async_authed_client, "zz-rb-str", "edge.local,x.com", "CERT-PEM")
        await _mk_version(
            isolated_session, cert_id, 1,
            {"name": "zz-rb-str", "cert": "CERT-PEM", "key": "K", "type": "server", "sni": "b.com"},
        )
        resp = await _rollback(async_authed_client, cert_id, 1)
        assert resp.status_code == 200, resp.text
        d = await _detail(async_authed_client, cert_id)
        assert "b.com" in d["sni"].split(",")

    @pytest.mark.asyncio
    async def test_rollback_without_sni_keys_keeps_value(self, async_authed_client, isolated_session):
        """快照无 sni/snis：sni 保持回滚前值，不被清空。"""
        cert_id = await _create_cert(async_authed_client, "zz-rb-none", "edge.local,keep.com", "CERT-PEM")
        await _mk_version(
            isolated_session, cert_id, 1,
            {"name": "zz-rb-none", "cert": "CERT-PEM", "key": "K", "type": "server"},
        )
        resp = await _rollback(async_authed_client, cert_id, 1)
        assert resp.status_code == 200, resp.text
        d = await _detail(async_authed_client, cert_id)
        assert "keep.com" in d["sni"].split(",")


class TestRollbackSanResync:
    @pytest.mark.asyncio
    async def test_rollback_resyncs_sni_from_pem_san(self, async_authed_client, isolated_session):
        """PEM SAN 为准：快照 snis 缺 IP，回滚后 sni 仍含 PEM 里的 IP（uapm 反向用例）。"""
        pem = _pem(dns_sans=["a.com"], ip_sans=["192.168.0.13"])
        cert_id = await _create_cert(async_authed_client, "zz-rb-resync", "edge.local,a.com", pem)
        await _mk_version(
            isolated_session, cert_id, 1,
            {"name": "zz-rb-resync", "cert": pem, "key": "K", "type": "server", "snis": ["a.com"]},
        )
        resp = await _rollback(async_authed_client, cert_id, 1)
        assert resp.status_code == 200, resp.text
        d = await _detail(async_authed_client, cert_id)
        sni_set = set(d["sni"].split(","))
        assert {"a.com", "192.168.0.13"} <= sni_set
        assert d["sni_mismatch"] is False

    @pytest.mark.asyncio
    async def test_rollback_unparseable_pem_falls_back_to_dual_read(self, async_authed_client, isolated_session):
        """不可解析 PEM：降级为键名兼容恢复的结果，回滚不失败。"""
        cert_id = await _create_cert(async_authed_client, "zz-rb-junk", "edge.local,x.com", "CERT-PEM")
        await _mk_version(
            isolated_session, cert_id, 1,
            {"name": "zz-rb-junk", "cert": "CERT-PEM", "key": "K", "type": "server", "snis": ["a.com"]},
        )
        resp = await _rollback(async_authed_client, cert_id, 1)
        assert resp.status_code == 200, resp.text
        d = await _detail(async_authed_client, cert_id)
        assert "a.com" in d["sni"].split(",")


class TestPublishSanSync:
    @pytest.mark.asyncio
    async def test_publish_derives_matching_list_from_pem_san(self, async_authed_client, isolated_session):
        """存量脱节证书发布自愈：Edge 匹配名单含 PEM 里的 IP，库内 sni 回写。"""
        pem = _pem(dns_sans=["edge.local", "qcg.com"], ip_sans=["192.168.0.13"])
        cert_id = await _create_cert(async_authed_client, "zz-pub-san", "edge.local,qcg.com", pem)
        await _add_node(isolated_session)
        stack, edge_mock = _publish_patch()
        with stack:
            resp = await async_authed_client.post(f"/api/v1/clusters/1/ssl/{cert_id}/publish")
        assert resp.status_code == 200, resp.text
        # Edge 载荷：匹配名单与证书 SAN 一致（含 IP）
        config_data = edge_mock.call_args.args[-1]
        snis = config_data.get("snis") or ([config_data["sni"]] if config_data.get("sni") else [])
        assert "192.168.0.13" in snis
        # 库内回写
        d = await _detail(async_authed_client, cert_id)
        assert "192.168.0.13" in d["sni"].split(",")
        assert d["sni_mismatch"] is False

    @pytest.mark.asyncio
    async def test_publish_unparseable_pem_falls_back_to_current_sni(self, async_authed_client, isolated_session):
        """PEM 不可解析：匹配名单按现 sni 下发（与旧行为一致），不失败。"""
        cert_id = await _create_cert(async_authed_client, "zz-pub-junk", "edge.local,a.com", "CERT-PEM")
        await _add_node(isolated_session)
        stack, edge_mock = _publish_patch()
        with stack:
            resp = await async_authed_client.post(f"/api/v1/clusters/1/ssl/{cert_id}/publish")
        assert resp.status_code == 200, resp.text
        config_data = edge_mock.call_args.args[-1]
        snis = config_data.get("snis") or ([config_data["sni"]] if config_data.get("sni") else [])
        assert snis == ["edge.local", "a.com"]


class TestSniMismatchFlag:
    @pytest.mark.asyncio
    async def test_mismatch_true_when_sni_narrower_than_san(self, async_authed_client):
        """uapm 场景：sni 窄于 PEM SAN → sni_mismatch=True（列表与详情都带）。"""
        pem = _pem(dns_sans=["edge.local", "qcg.com", "g.gkpt.cars"], ip_sans=["192.168.0.13"])
        cert_id = await _create_cert(async_authed_client, "zz-mm-yes", "edge.local,qcg.com", pem)
        d = await _detail(async_authed_client, cert_id)
        assert d["sni_mismatch"] is True

    @pytest.mark.asyncio
    async def test_mismatch_false_when_consistent(self, async_authed_client):
        pem = _pem(dns_sans=["edge.local", "a.com"])
        cert_id = await _create_cert(async_authed_client, "zz-mm-no", "edge.local,a.com", pem)
        d = await _detail(async_authed_client, cert_id)
        assert d["sni_mismatch"] is False

    @pytest.mark.asyncio
    async def test_mismatch_false_when_pem_unparseable(self, async_authed_client):
        cert_id = await _create_cert(async_authed_client, "zz-mm-junk", "edge.local,a.com", "CERT-PEM")
        d = await _detail(async_authed_client, cert_id)
        assert d["sni_mismatch"] is False
