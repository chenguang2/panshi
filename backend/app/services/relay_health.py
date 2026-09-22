"""链路体检（openspec: add-relay-gateway / relay-health-check）。

三段式：段 1 网关 HTTP 腿（TCP 握手，https 时叠加 TLS；不依赖 HTTP 响应码——
网关对白名单外目标返回 403，不能以响应码判活）；段 2 SSH 跳板；段 3 抽样节点两腿。
段级超时 10s、单区域总预算 60s；区域间互不阻塞。
"""
import asyncio
import ssl
import time
from urllib.parse import urlparse

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.cluster import Cluster, Node
from app.models.relay import RelayGateway

_SEGMENT_TIMEOUT = 10.0
_REGION_BUDGET = 60.0
_SAMPLE_PER_CLUSTER = 1


async def _tcp_probe(host: str, port: int, timeout: float, tls: bool = False) -> None:
    """TCP（可选 TLS）握手探测；失败抛异常，成功返回 None。"""
    ctx = None
    if tls:
        ctx = ssl.create_default_context()
        ctx.check_hostname = False
        ctx.verify_mode = ssl.CERT_NONE  # 内部 CA 自签证书，只验证握手可达性
    _, writer = await asyncio.wait_for(
        asyncio.open_connection(host, port, ssl=ctx), timeout=timeout
    )
    writer.close()
    try:
        await writer.wait_closed()
    except Exception:
        pass


def _sample_nodes(nodes: list[Node], limit: int = _SAMPLE_PER_CLUSTER) -> list[Node]:
    """每集群抽取 limit 台（默认 1），避免长耗时全量探测。"""
    per_cluster: dict[int, int] = {}
    picked: list[Node] = []
    for n in nodes:
        count = per_cluster.get(n.cluster_id, 0)
        if count >= max(1, limit):
            continue
        per_cluster[n.cluster_id] = count + 1
        picked.append(n)
    return picked


async def _probe_node_mgmt_via_gateway(base_url: str, ip: str, mgmt_port: int, timeout: float) -> None:
    """管理腿探活：经网关 HTTP 携带 X-Edge-Target；任何 HTTP 响应都证明路径存活。"""
    import httpx

    def _do():
        resp = httpx.get(
            base_url,
            headers={"X-Edge-Target": f"{ip}:{mgmt_port}"},
            timeout=timeout,
            trust_env=False,
        )
        # 网关白名单拦截（403 + 非 Edge JSON 结构）→ 白名单漂移信号
        if resp.status_code == 403 and "error_msg" not in resp.text:
            raise RuntimeError("目标不在该局网关白名单，请执行配置下发")

    await asyncio.to_thread(_do)


async def _probe_node_ssh_via_jump(jump: str, ip: str, ssh_port: int, timeout: float) -> None:
    """SSH 腿探活：经跳板 stdio 转发（ssh -W）建立到节点:22 的通路，免节点凭据。"""
    proc = await asyncio.create_subprocess_exec(
        "ssh",
        "-W", f"{ip}:{ssh_port}",
        "-i", _relay_key_path(),
        "-o", "BatchMode=yes",
        "-o", "StrictHostKeyChecking=no",
        "-o", "UserKnownHostsFile=/dev/null",
        "-o", f"ConnectTimeout={max(1, int(timeout))}",
        jump,
        stdin=asyncio.subprocess.DEVNULL,
        stdout=asyncio.subprocess.DEVNULL,
        stderr=asyncio.subprocess.DEVNULL,
    )
    try:
        rc = await asyncio.wait_for(proc.wait(), timeout=timeout)
    except asyncio.TimeoutError:
        proc.kill()
        raise TimeoutError("探测超时")
    if rc != 0:
        raise ConnectionError(f"跳板转发建立失败 (rc={rc})")


def _relay_key_path() -> str:
    import os

    return os.path.expanduser(os.getenv("EDGE_RELAY_SSH_KEY", "~/.ssh/relay_ed25519"))


async def _run_segment(name: str, coro_factory) -> dict:
    start = time.monotonic()

    async def _timed():
        await coro_factory()
        return None

    try:
        await asyncio.wait_for(_timed(), timeout=_SEGMENT_TIMEOUT)
        return {"name": name, "ok": True, "elapsed_ms": int((time.monotonic() - start) * 1000)}
    except asyncio.TimeoutError:
        return {
            "name": name,
            "ok": False,
            "elapsed_ms": int((time.monotonic() - start) * 1000),
            "error": "探测超时",
        }
    except Exception as e:  # 连接拒绝/证书错误等
        return {
            "name": name,
            "ok": False,
            "elapsed_ms": int((time.monotonic() - start) * 1000),
            "error": str(e) or type(e).__name__,
        }


async def check_region(region_code: str, db: AsyncSession) -> dict:
    region = (
        await db.execute(select(RelayGateway).where(RelayGateway.code == region_code))
    ).scalar_one_or_none()
    if region is None:
        return {"region": region_code, "ok": False, "segments": [], "error": "区域不存在"}

    start = time.monotonic()
    segments: list[dict] = []

    # 段 1：网关 HTTP 腿（TCP 握手；https 时叠加 TLS——http 部署上强推 TLS 会
    # 得到 SSL: WRONG_VERSION_NUMBER 而误报不可达）
    parsed = urlparse(region.http_base_url or "")
    default_port = 443 if parsed.scheme == "https" else 80
    seg1_target = (parsed.hostname or "", parsed.port or default_port)
    use_tls = parsed.scheme == "https"
    seg1 = (
        await _run_segment(
            "网关HTTP腿",
            lambda: _tcp_probe(seg1_target[0], seg1_target[1], _SEGMENT_TIMEOUT, tls=use_tls),
        )
        if seg1_target[0]
        else {"name": "网关HTTP腿", "ok": False, "elapsed_ms": 0, "error": "未配置 http_base_url"}
    )
    segments.append(seg1)

    # 段 2：SSH 跳板
    jump = region.ssh_jump or ""
    if ":" in jump.rsplit("@", 1)[-1]:
        user_host, gw_port = jump.rsplit(":", 1)
        gw_port = int(gw_port)
    else:
        user_host, gw_port = jump, 22
    jump_host = user_host.rsplit("@", 1)[-1] if user_host else ""
    seg2 = (
        await _run_segment("SSH跳板", lambda: _tcp_probe(jump_host, gw_port, _SEGMENT_TIMEOUT))
        if jump_host
        else {"name": "SSH跳板", "ok": False, "elapsed_ms": 0, "error": "未配置 ssh_jump"}
    )
    segments.append(seg2)

    # 段 3：抽样节点两腿（前两段失败时级联跳过）——节点端口从武清不可直探，
    # 经中继路径探测：管理腿走网关 HTTP（X-Edge-Target），SSH 腿走跳板 stdio 转发；
    # 两者均无需节点凭据（任何 HTTP 响应 / 转发建立成功即视为路径存活）。
    if seg2["ok"] and seg1["ok"]:
        nodes = (
            (
                await db.execute(
                    select(Node)
                    .join(Cluster, Node.cluster_id == Cluster.id)
                    .where(Cluster.region_code == region_code, Node.status == 1)
                    .order_by(Node.ip)
                )
            )
            .scalars()
            .all()
        )
        samples = _sample_nodes(list(nodes))

        async def _probe_node(n: Node) -> dict:
            try:
                await _probe_node_mgmt_via_gateway(
                    region.http_base_url or "", n.ip, n.management_port, _SEGMENT_TIMEOUT
                )
            except Exception as e:
                return {"node": n.ip, "ok": False, "error": f"管理腿(经网关): {e}"}
            try:
                await _probe_node_ssh_via_jump(jump, n.ip, n.ssh_port or 22, _SEGMENT_TIMEOUT)
            except Exception as e:
                return {"node": n.ip, "ok": False, "error": f"SSH腿(经跳板): {e}"}
            return {"node": n.ip, "ok": True}

        budget = max(0.1, _REGION_BUDGET - (time.monotonic() - start))
        try:
            node_results = await asyncio.wait_for(
                asyncio.gather(*[_probe_node(n) for n in samples]), timeout=budget
            )
            seg3_ok = all(r["ok"] for r in node_results) if node_results else True
            seg3 = {
                "name": "抽样节点两腿",
                "ok": seg3_ok,
                "elapsed_ms": int((time.monotonic() - start) * 1000),
                "nodes": node_results,
            }
            if not seg3_ok:
                first_bad = next((r for r in node_results if not r["ok"]), None)
                seg3["error"] = first_bad.get("error", "节点探测失败") if first_bad else "节点探测失败"
        except asyncio.TimeoutError:
            seg3 = {
                "name": "抽样节点两腿",
                "ok": False,
                "elapsed_ms": int((time.monotonic() - start) * 1000),
                "error": "探测超时",
            }
    else:
        seg3 = {"name": "抽样节点两腿", "ok": False, "error": "前段失败，级联跳过"}
    segments.append(seg3)

    return {
        "region": region_code,
        "ok": all(s["ok"] for s in segments),
        "segments": segments,
        "elapsed_ms": int((time.monotonic() - start) * 1000),
    }


async def check_all(db: AsyncSession) -> dict:
    """全量巡检：全部启用区域各自独立体检，区域间互不阻塞。"""
    regions = (
        await db.execute(select(RelayGateway).where(RelayGateway.status == "enabled").order_by(RelayGateway.id))
    ).scalars().all()
    results = await asyncio.gather(
        *[check_region(r.code, db=db) for r in regions], return_exceptions=True
    )
    out = []
    for r, res in zip(regions, results):
        if isinstance(res, Exception):
            out.append({"region": r.code, "ok": False, "error": str(res), "segments": []})
        else:
            out.append(res)
    return {"regions": out}
