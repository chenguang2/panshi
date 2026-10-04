"""SSL 证书到期字段（ux-review-2026-10-04 H2）。

序列化期从 cert PEM 解析 notAfter，输出 expire_at / expire_days；
解析失败（如国密双证书的非标准 PEM）优雅降级为 None，不影响响应。
schema 级直测：SslCertificateResponse 的所有 API 站点都走 model_validate，
校验器单点生效，无需逐端点重测。
"""
from datetime import datetime, timedelta, timezone

from cryptography import x509
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from cryptography.x509.oid import NameOID

from app.schemas.ssl import SslCertificateResponse


def _self_signed_pem(days: int) -> str:
    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    now = datetime.now(timezone.utc)
    # 负天数（已过期证书）时起点须早于终点，前移量随负天数放大
    before_offset = timedelta(days=1) if days >= 0 else timedelta(days=-days + 1)
    name = x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, "ux-review.local")])
    cert = (
        x509.CertificateBuilder()
        .subject_name(name)
        .issuer_name(name)
        .public_key(key.public_key())
        .serial_number(x509.random_serial_number())
        .not_valid_before(now - before_offset)
        .not_valid_after(now + timedelta(days=days))
        .sign(key, hashes.SHA256())
    )
    return cert.public_bytes(serialization.Encoding.PEM).decode()


def _payload(cert_pem: str) -> dict:
    return {
        "id": 1,
        "edge_uuid": "11111111-1111-1111-1111-111111111111",
        "cluster_id": 1,
        "name": "expiry-cert",
        "sni": "ux-review.local",
        "cert": cert_pem,
        "cert_type": "server",
    }


class TestSslExpiryDerivation:
    def test_valid_cert_gets_expire_fields(self):
        resp = SslCertificateResponse.model_validate(_payload(_self_signed_pem(days=90)))
        assert resp.expire_at is not None
        assert 88 <= resp.expire_days <= 90
        # 序列化穿透：列表端点 model_dump() 后前端可见
        dumped = resp.model_dump()
        assert dumped["expire_at"] == resp.expire_at
        assert dumped["expire_days"] == resp.expire_days

    def test_expiring_soon_has_small_days(self):
        resp = SslCertificateResponse.model_validate(_payload(_self_signed_pem(days=3)))
        assert 2 <= resp.expire_days <= 3

    def test_expired_cert_has_negative_days(self):
        resp = SslCertificateResponse.model_validate(_payload(_self_signed_pem(days=-5)))
        assert -6 <= resp.expire_days <= -4

    def test_unparseable_cert_degrades_to_none(self):
        resp = SslCertificateResponse.model_validate(_payload("not a pem at all"))
        assert resp.expire_at is None
        assert resp.expire_days is None

    def test_ca_cert_also_parsed(self):
        # CA 根证书同样展示到期信息（页面共用卡片）
        pem = _self_signed_pem(days=3650)
        resp = SslCertificateResponse.model_validate(_payload(pem) | {"is_ca": 1})
        assert 3648 <= resp.expire_days <= 3650
