"""ssl-ux-review-fixes 组 9：私钥保护对齐（设计 D4，接口行为变更）。

9.1 列表/详情响应 `private_key`/`sign_key` SHALL 均为空串（无条件掩码），并带
    `has_private_key`/`has_sign_key` 布尔；生成接口（/generate）一次性响应不掩码
    （前端据以下载客户端证书包，属唯一取钥窗口）。
9.2 `GET /clusters/{id}/ssl/{cert_id}/key` 按需端点：全证书类型（含 CA）、国密返回
    加密+签名双私钥、记审计、不存在 404。
9.4 PUT `private_key` 为 None/空串 SHALL 跳过更新（仅此字段）；编辑不碰私钥后
    库中私钥逐字节不变。
"""

import pytest

pytestmark = pytest.mark.asyncio

PEM_CERT = "-----BEGIN CERTIFICATE-----\nMIIB\n-----END CERTIFICATE-----\n"
PEM_KEY = "-----BEGIN PRIVATE KEY-----\nORIGINAL-KEY-CONTENT\n-----END PRIVATE KEY-----\n"
SIGN_KEY = "-----BEGIN PRIVATE KEY-----\nSIGN-KEY-CONTENT\n-----END PRIVATE KEY-----\n"


async def _setup(client) -> tuple[int, int]:
    import uuid
    suffix = uuid.uuid4().hex[:8]
    resp = client.post("/api/v1/clusters", json={"name": f"ssl-key-{suffix}", "display_name": "ssl-key"})
    assert resp.status_code in (200, 201), resp.text
    cid = resp.json()["id"]
    resp = client.post(
        f"/api/v1/clusters/{cid}/ssl",
        json={
            "name": "keyed-cert",
            "cluster_id": cid,
            "sni": "key.example.com",
            "cert": PEM_CERT,
            "key": PEM_KEY,
            "sign_cert": PEM_CERT,
            "sign_key": SIGN_KEY,
            "gm": True,
            "algorithm": "sm2",
        },
    )
    assert resp.status_code == 201, resp.text
    return cid, resp.json()["id"]


async def test_list_and_detail_mask_private_and_sign_key(global_engine_client):
    client = global_engine_client
    cid, sid = await _setup(client)
    lst = client.get(f"/api/v1/clusters/{cid}/ssl?page_size=50")
    item = next(i for i in lst.json()["items"] if i["id"] == sid)
    assert item["private_key"] == ""
    assert item["sign_key"] in ("", None)
    assert item["has_private_key"] is True
    assert item["has_sign_key"] is True

    detail = client.get(f"/api/v1/clusters/{cid}/ssl/{sid}")
    assert detail.status_code == 200
    # 单体响应按 alias 序列化（private_key -> key），与既有 API 契约一致
    assert detail.json()["key"] == ""
    assert detail.json()["has_private_key"] is True

    # 全局列表同样掩码
    all_list = client.get("/api/v1/ssl?page_size=500")
    item2 = next(i for i in all_list.json()["items"] if i["id"] == sid)
    assert item2["private_key"] == ""
    assert item2["has_private_key"] is True


async def test_cert_without_key_has_flag_false(global_engine_client):
    client = global_engine_client
    import uuid
    suffix = uuid.uuid4().hex[:8]
    resp = client.post("/api/v1/clusters", json={"name": f"ssl-nokey-{suffix}", "display_name": "ssl-nokey"})
    cid = resp.json()["id"]
    resp = client.post(
        f"/api/v1/clusters/{cid}/ssl",
        json={"name": "nokey", "cluster_id": cid, "sni": "n.example.com", "cert": PEM_CERT, "key": " "},
    )
    # key 最少 1 字符，空格可过校验但等价无钥内容——用仅空白制造「无钥」语义
    assert resp.status_code == 201, resp.text
    sid = resp.json()["id"]
    detail = client.get(f"/api/v1/clusters/{cid}/ssl/{sid}")
    assert detail.json()["has_private_key"] is False


async def test_key_endpoint_returns_key_and_audits(global_engine_client):
    client = global_engine_client
    cid, sid = await _setup(client)
    resp = client.get(f"/api/v1/clusters/{cid}/ssl/{sid}/key")
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["private_key"] == PEM_KEY
    assert body["sign_key"] == SIGN_KEY  # 国密双私钥

    # 审计可见（系统操作日志）
    ops = client.get("/api/v1/system/operations?page_size=50")
    assert ops.status_code == 200
    rows = ops.json().get("items", ops.json() if isinstance(ops.json(), list) else [])
    assert any(
        r.get("action") == "download_key" and r.get("resource") == "ssl" and r.get("resource_id") == sid
        for r in rows
    ), f"audit row missing: {str(rows)[:300]}"


async def test_key_endpoint_serves_ca_cert(global_engine_client):
    client = global_engine_client
    import uuid
    suffix = uuid.uuid4().hex[:8]
    resp = client.post("/api/v1/clusters", json={"name": f"ssl-cakey-{suffix}", "display_name": "ssl-cakey"})
    cid = resp.json()["id"]
    resp = client.post(f"/api/v1/clusters/{cid}/ssl/ca", json={"name": f"ca-{suffix}", "cluster_id": cid})
    assert resp.status_code == 201, resp.text
    ca_id = resp.json()["id"]
    resp = client.get(f"/api/v1/clusters/{cid}/ssl/{ca_id}/key")
    assert resp.status_code == 200, resp.text
    assert resp.json()["private_key"]  # 本地生成的 CA 有私钥


async def test_key_endpoint_404_for_missing_cert(global_engine_client):
    client = global_engine_client
    import uuid
    suffix = uuid.uuid4().hex[:8]
    resp = client.post("/api/v1/clusters", json={"name": f"ssl-k404-{suffix}", "display_name": "ssl-k404"})
    cid = resp.json()["id"]
    resp = client.get(f"/api/v1/clusters/{cid}/ssl/999999/key")
    assert resp.status_code == 404


async def test_put_empty_private_key_skips_update_and_keeps_bytes(global_engine_client):
    client = global_engine_client
    cid, sid = await _setup(client)

    # ① 不带 private_key 字段（前端省略语义）
    resp = client.put(
        f"/api/v1/clusters/{cid}/ssl/{sid}",
        json={"name": "keyed-cert-renamed", "cert_type": "server", "cert": PEM_CERT},
    )
    assert resp.status_code == 200, resp.text
    key_resp = client.get(f"/api/v1/clusters/{cid}/ssl/{sid}/key")
    assert key_resp.json()["private_key"] == PEM_KEY  # 逐字节不变

    # ② 显式空串（留空表示不修改）
    resp = client.put(
        f"/api/v1/clusters/{cid}/ssl/{sid}",
        json={"name": "keyed-cert-renamed", "cert": PEM_CERT, "key": ""},
    )
    assert resp.status_code == 200, resp.text
    key_resp = client.get(f"/api/v1/clusters/{cid}/ssl/{sid}/key")
    assert key_resp.json()["private_key"] == PEM_KEY  # 仍逐字节不变

    # ③ 真·换钥仍然生效
    new_key = PEM_KEY.replace("ORIGINAL", "REPLACED")
    resp = client.put(
        f"/api/v1/clusters/{cid}/ssl/{sid}",
        json={"name": "keyed-cert-renamed", "cert": PEM_CERT, "key": new_key},
    )
    assert resp.status_code == 200, resp.text
    key_resp = client.get(f"/api/v1/clusters/{cid}/ssl/{sid}/key")
    assert key_resp.json()["private_key"] == new_key
