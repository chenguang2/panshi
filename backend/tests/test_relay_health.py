"""链路体检测试（openspec: add-relay-gateway / relay-health-check）。"""
import pytest

from app.models.cluster import Cluster, Node
from app.models.relay import RelayGateway
from app.services import relay_health


async def _seed(test_db):
    test_db.add(RelayGateway(id=1, code="luju", name="路局A",
                             http_base_url="https://10.10.1.1:8443", ssh_jump="tunnel@10.10.1.1:22"))
    test_db.add(RelayGateway(id=2, code="dead", name="失联局",
                             http_base_url="https://10.10.9.9:8443", ssh_jump="tunnel@10.10.9.9:22"))
    for cid in (1, 2):
        c = await test_db.get(Cluster, cid)
        if c is None:
            c = Cluster(id=cid, name=f"c{cid}", status=1)
            test_db.add(c)
        c.region_code = "luju"  # conftest 预 seed 集群 1/2/3，原地写 region
    test_db.add(Node(id=1, cluster_id=1, ip="10.1.1.1", service_port=80, management_port=9180,
                     ssh_port=22, edge_path="/e"))
    test_db.add(Node(id=2, cluster_id=2, ip="10.1.2.2", service_port=80, management_port=9180,
                     ssh_port=22, edge_path="/e"))
    await test_db.commit()


# ── 自跳节点：跳板==目标（网关机自身也是业务节点）→ SSH 腿不适用，走直连 ──
#
# 实测事故：aoh 网关 jboss@192.168.0.13 同时是该集群节点 192.168.0.13。实际节点
# 操作走直连（relay_registry.ssh_jump_for_ip 自跳守卫），体检却仍按跳板探测并把
# 该节点误报为失败。

def _seed_self_region(test_db):
    import asyncio

    async def _seed():
        test_db.add(Cluster(id=7, name="c7", region_code="selfreg", status=1))
        test_db.add(RelayGateway(id=7, code="selfreg", name="自跳局",
                                 http_base_url="https://10.7.7.7:8443",
                                 ssh_jump="tunnel@10.7.7.7:22"))
        test_db.add(Node(id=7, cluster_id=7, ip="10.7.7.7", service_port=80,
                         management_port=9180, ssh_port=22, edge_path="/e"))
        await test_db.commit()

    asyncio.run(_seed())


def test_self_jump_node_ssh_leg_skipped(test_db, monkeypatch):
    import asyncio

    _seed_self_region(test_db)

    async def ok(*args, **kwargs):
        return None

    async def ssh_boom(jump, ip, ssh_port, timeout):
        raise ConnectionError("跳板转发建立失败 (rc=255)")

    monkeypatch.setattr(relay_health, "_tcp_probe", _fake_probe(ok=True))
    monkeypatch.setattr(relay_health, "_probe_node_mgmt_via_gateway", ok)
    monkeypatch.setattr(relay_health, "_probe_node_ssh_via_jump", ssh_boom)

    res = asyncio.run(relay_health.check_region("selfreg", db=test_db))
    seg3 = next(s for s in res["segments"] if s["name"] == "抽样节点两腿")
    assert seg3["ok"] is True, seg3
    assert seg3["nodes"][0]["ssh_skipped"] is True


def test_sampling_prefers_non_self_jump_node(test_db, monkeypatch):
    """同集群既有自跳节点又有远端节点时，抽样应选远端节点——否则跳板问题被掩盖。"""
    import asyncio

    _seed_self_region(test_db)

    async def _add_remote_node():
        test_db.add(Node(id=8, cluster_id=7, ip="10.7.8.8", service_port=80,
                         management_port=9180, ssh_port=22, edge_path="/e"))
        await test_db.commit()

    asyncio.run(_add_remote_node())

    probed: list[str] = []

    async def ok(*args, **kwargs):
        return None

    async def ssh_probe(jump, ip, ssh_port, timeout):
        probed.append(ip)

    monkeypatch.setattr(relay_health, "_tcp_probe", _fake_probe(ok=True))
    monkeypatch.setattr(relay_health, "_probe_node_mgmt_via_gateway", ok)
    monkeypatch.setattr(relay_health, "_probe_node_ssh_via_jump", ssh_probe)

    asyncio.run(relay_health.check_region("selfreg", db=test_db))
    assert probed == ["10.7.8.8"]  # 选中远端节点，而非自跳的 10.7.7.7


def test_normal_node_ssh_leg_still_probed(test_db, monkeypatch):
    """对照：跳板与节点不同主机时不得误跳过（SSH 腿失败仍计失败）。"""
    import asyncio

    async def _seed():
        test_db.add(RelayGateway(id=8, code="othreg", name="他局",
                                 http_base_url="https://10.9.9.9:8443",
                                 ssh_jump="tunnel@10.9.9.9:22"))
        test_db.add(Cluster(id=8, name="c8", region_code="othreg", status=1))
        test_db.add(Node(id=8, cluster_id=8, ip="10.8.8.8", service_port=80,
                         management_port=9180, ssh_port=22, edge_path="/e"))
        await test_db.commit()

    asyncio.run(_seed())

    async def ok(*args, **kwargs):
        return None

    async def ssh_boom(jump, ip, ssh_port, timeout):
        raise ConnectionError("跳板转发建立失败 (rc=255)")

    monkeypatch.setattr(relay_health, "_tcp_probe", _fake_probe(ok=True))
    monkeypatch.setattr(relay_health, "_probe_node_mgmt_via_gateway", ok)
    monkeypatch.setattr(relay_health, "_probe_node_ssh_via_jump", ssh_boom)

    res = asyncio.run(relay_health.check_region("othreg", db=test_db))
    seg3 = next(s for s in res["segments"] if s["name"] == "抽样节点两腿")
    assert seg3["ok"] is False
    assert "SSH腿" in seg3["error"]


@pytest.fixture
def all_up(monkeypatch):
    """段 1/2/3 全部可达。"""
    monkeypatch.setattr(relay_health, "_tcp_probe", _fake_probe(ok=True))

    async def fake_mgmt(base_url, ip, mgmt_port, timeout):
        return None

    async def fake_ssh(jump, ip, ssh_port, timeout):
        return None

    monkeypatch.setattr(relay_health, "_probe_node_mgmt_via_gateway", fake_mgmt)
    monkeypatch.setattr(relay_health, "_probe_node_ssh_via_jump", fake_ssh)


@pytest.fixture
def jump_down(monkeypatch):
    """段 2 跳板不可达（段 3 级联失败）。"""
    async def probe(host, port, timeout, tls=False):
        if port == 22 and host == "10.10.1.1":
            raise TimeoutError("timeout")
        return None
    monkeypatch.setattr(relay_health, "_tcp_probe", probe)


def _fake_probe(ok: bool):
    async def probe(host, port, timeout, tls=False):
        if not ok:
            raise ConnectionError("refused")
        return None
    return probe


@pytest.mark.asyncio
async def test_all_green(test_db, test_db_factory, all_up):
    await _seed(test_db)
    result = await relay_health.check_region("luju", db=test_db)
    assert result["region"] == "luju"
    assert [s["ok"] for s in result["segments"]] == [True, True, True]
    assert all("elapsed_ms" in s for s in result["segments"])


@pytest.mark.asyncio
async def test_jump_down_cascades(test_db, test_db_factory, jump_down):
    await _seed(test_db)
    result = await relay_health.check_region("luju", db=test_db)
    segs = result["segments"]
    assert segs[0]["ok"] is True   # 段 1 网关腿正常
    assert segs[1]["ok"] is False  # 段 2 跳板失败
    assert segs[2]["ok"] is False  # 段 3 级联失败（依赖段 2）


@pytest.mark.asyncio
async def test_timeout_marked_failed(test_db, test_db_factory, monkeypatch):
    await _seed(test_db)

    async def slow(host, port, timeout, tls=False):
        await asyncio.sleep(10)

    import asyncio
    monkeypatch.setattr(relay_health, "_tcp_probe", slow)
    monkeypatch.setattr(relay_health, "_SEGMENT_TIMEOUT", 0.05)
    result = await relay_health.check_region("luju", db=test_db)
    segs = result["segments"]
    for i in (0, 1):
        assert segs[i]["ok"] is False
        assert "超时" in segs[i].get("error", "")
    assert segs[2]["ok"] is False  # 段 3 级联跳过


@pytest.mark.asyncio
async def test_region_filter_and_all(test_db, test_db_factory, all_up, monkeypatch):
    await _seed(test_db)
    one = await relay_health.check_region("luju", db=test_db)
    assert one["region"] == "luju"

    monkeypatch.setattr(relay_health, "_sample_nodes", lambda nodes, limit=1: nodes[:1])
    everything = await relay_health.check_all(db=test_db)
    regions = {r["region"] for r in everything["regions"]}
    assert {"luju", "dead"} <= regions


@pytest.mark.asyncio
async def test_seg1_tls_follows_scheme(test_db, test_db_factory, monkeypatch):
    """段 1 仅 https 走 TLS 握手；http 部署强推 TLS 会误报 WRONG_VERSION_NUMBER。"""
    await _seed(test_db)
    seen: list[bool] = []

    async def probe(host, port, timeout, tls=False):
        seen.append(tls)
        return None

    monkeypatch.setattr(relay_health, "_tcp_probe", probe)
    # 种子是 https://
    await relay_health.check_region("luju", db=test_db)
    assert seen and seen[0] is True

    seen.clear()
    # 改成 http://
    from sqlalchemy import update
    from app.models.relay import RelayGateway

    await test_db.execute(
        update(RelayGateway).where(RelayGateway.code == "luju").values(http_base_url="http://10.10.1.1:8443")
    )
    await test_db.commit()
    await relay_health.check_region("luju", db=test_db)
    assert seen and seen[0] is False  # http 不得走 TLS


@pytest.mark.asyncio
async def test_health_ends_db_transaction_before_probe(test_db, test_db_factory, monkeypatch):
    """单区域体检：网络探测前必须结束读事务，避免 SQLite SHARED 锁横跨探测
    阻塞并发写请求提交（AGENTS #29 同类隐患）。"""
    await _seed(test_db)
    seen = {}

    async def fake_probe(region, nodes):
        seen["in_transaction"] = test_db.in_transaction()
        return {"region": region.code, "ok": True, "segments": []}

    monkeypatch.setattr(relay_health, "_probe_region", fake_probe)
    await relay_health.check_region("luju", db=test_db)
    assert seen["in_transaction"] is False


@pytest.mark.asyncio
async def test_check_all_ends_db_transaction_before_probe(test_db, test_db_factory, monkeypatch):
    """全量巡检：并发探测前必须结束读事务（且探测不再共享会话）。"""
    await _seed(test_db)
    seen = {}

    async def fake_probe(region, nodes):
        seen[region.code] = test_db.in_transaction()
        return {"region": region.code, "ok": True, "segments": []}

    monkeypatch.setattr(relay_health, "_probe_region", fake_probe)
    await relay_health.check_all(db=test_db)
    assert seen, "应有区域被探测"
    assert all(v is False for v in seen.values())


@pytest.mark.asyncio
async def test_sampling_per_cluster(test_db, test_db_factory, all_up):
    await _seed(test_db)
    sampled = relay_health._sample_nodes(
        [Node(id=1, cluster_id=1, ip="10.1.1.1", service_port=80, management_port=9180,
              ssh_port=22, edge_path="/e"),
         Node(id=2, cluster_id=2, ip="10.1.2.2", service_port=80, management_port=9180,
              ssh_port=22, edge_path="/e")],
        limit=1,
    )
    assert len(sampled) == 2  # 每集群一台 → 两集群各取一台
