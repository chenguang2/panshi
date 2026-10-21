"""ssl-ux-review-fixes 10.1：POST /clusters/{id}/ssl/preview PEM 即时预览。

契约（评审问题 9）：
- 请求体 {cert?, key?}，均可选
- 响应分字段：cert: {ok, subject_cn, san[], not_after, algorithm, expire_days} | null（非法/缺失=null）
  key: {ok} | null（缺失=null，非法=ok:false）
  key_match: bool | null（仅 cert/key 双 ok 时返回）
- 不落库（纯解析）
"""

import pytest

from tests.api_helpers import isolated_app_lifespan

VALID_CERT_PEM = None  # 运行时生成


def _make_pair() -> tuple[str, str]:
    """生成一对真实 RSA 证书/私钥 PEM（cryptography 本地生成，无外部依赖）。"""
    from cryptography import x509
    from cryptography.hazmat.primitives import hashes, serialization
    from cryptography.hazmat.primitives.asymmetric import rsa
    from cryptography.x509.oid import NameOID
    import datetime

    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    subject = x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, "preview.example.com")])
    now = datetime.datetime.now(datetime.timezone.utc)
    cert = (
        x509.CertificateBuilder()
        .subject_name(subject)
        .issuer_name(subject)
        .public_key(key.public_key())
        .serial_number(x509.random_serial_number())
        .not_valid_before(now - datetime.timedelta(days=1))
        .not_valid_after(now + datetime.timedelta(days=30))
        .add_extension(
            x509.SubjectAlternativeName([x509.DNSName("preview.example.com"), x509.DNSName("alt.example.com")]),
            critical=False,
        )
        .sign(key, hashes.SHA256())
    )
    cert_pem = cert.public_bytes(serialization.Encoding.PEM).decode()
    key_pem = key.private_bytes(
        serialization.Encoding.PEM,
        serialization.PrivateFormat.PKCS8,
        serialization.NoEncryption(),
    ).decode()
    return cert_pem, key_pem


def _other_key_pem() -> str:
    from cryptography.hazmat.primitives import serialization
    from cryptography.hazmat.primitives.asymmetric import rsa

    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    return key.private_bytes(
        serialization.Encoding.PEM,
        serialization.PrivateFormat.PKCS8,
        serialization.NoEncryption(),
    ).decode()


def _preview(client, body: dict):
    return client.post("/api/v1/clusters/1/ssl/preview", json=body)


@pytest.fixture
def client():
    """预览端点不落库，用会话级全局引擎客户端（鉴权 + seed admin，#42）。"""
    return global_engine_client


def test_preview_valid_pair_returns_cert_fields_and_match(global_engine_client):
    cert_pem, key_pem = _make_pair()
    with isolated_app_lifespan():
        client = global_engine_client
        resp = _preview(client, {"cert": cert_pem, "key": key_pem})
        assert resp.status_code == 200, resp.text
        data = resp.json()
        c = data["cert"]
        assert c is not None and c["ok"] is True
        assert c["subject_cn"] == "preview.example.com"
        assert set(c["san"]) == {"preview.example.com", "alt.example.com"}
        assert c["not_after"] and c["expire_days"] is not None and c["expire_days"] >= 28
        assert c["algorithm"] == "rsa"
        assert data["key"] == {"ok": True}
        assert data["key_match"] is True


def test_preview_mismatched_pair_reports_false(global_engine_client):
    cert_pem, _ = _make_pair()
    other_key = _other_key_pem()
    with isolated_app_lifespan():
        client = global_engine_client
        resp = _preview(client, {"cert": cert_pem, "key": other_key})
        assert resp.status_code == 200
        data = resp.json()
        assert data["key"]["ok"] is True
        assert data["key_match"] is False


def test_preview_invalid_or_missing_fields(global_engine_client):
    cert_pem, _ = _make_pair()
    with isolated_app_lifespan():
        client = global_engine_client
        # 非法 cert → cert=null；非法 key → key.ok=false；key_match=None
        resp = _preview(client, {"cert": "not-a-pem", "key": "junk"})
        data = resp.json()
        assert data["cert"] is None
        assert data["key"] == {"ok": False}
        assert data["key_match"] is None
        # 缺失字段 → 对应项 null
        resp2 = _preview(client, {"cert": cert_pem})
        data2 = resp2.json()
        assert data2["cert"]["ok"] is True
        assert data2["key"] is None
        assert data2["key_match"] is None
        # 空体 → 全 null
        resp3 = _preview(client, {})
        assert resp3.json() == {"cert": None, "key": None, "key_match": None}


def test_preview_does_not_persist(global_engine_client):
    cert_pem, key_pem = _make_pair()
    with isolated_app_lifespan():
        client = global_engine_client
        before = client.get("/api/v1/clusters/1/ssl").json()
        items_before = before if isinstance(before, list) else before.get("items", [])
        resp = _preview(client, {"cert": cert_pem, "key": key_pem})
        assert resp.status_code == 200
        after = client.get("/api/v1/clusters/1/ssl").json()
        items_after = after if isinstance(after, list) else after.get("items", [])
        assert len(items_after) == len(items_before)
