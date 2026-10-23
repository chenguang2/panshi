"""SSL PEM 解析公共函数（ssl-ux-review-fixes 10.1，评审问题 9）。

`SslCertificateResponse.derive_expiry` 与 `POST /clusters/{id}/ssl/preview`
共用本模块，禁止两处各写一份 x509 解析。

所有函数对非法输入优雅降级（返回 None / False），绝不抛出。
"""

from __future__ import annotations

from datetime import datetime
from typing import Any, Optional

# 系统保留 SNI（强制合并进 DNS SAN 与 sni，不可被用户移除）。
# 语义归属：证书/匹配名单公共语义，api 层与 schema 层共用（cluster_ssl 与
# SslCertificateResponse.sni_mismatch 比对都要用它，且 schema 不得反向依赖 api）。
RESERVED_SNIS = ("edge.local",)


def parse_cert_pem(pem: Any) -> Optional[dict]:
    """解析证书 PEM → {ok, subject_cn, san, not_after, algorithm, expire_days}；非法返回 None。

    not_after 为 naive UTC 的 isoformat（全站后端时间约定，前端经 parseBackendDate 展示）。
    algorithm 取值与证书卡一致：rsa / ecc / sm2。
    """
    if not isinstance(pem, str) or "BEGIN CERTIFICATE" not in pem:
        return None
    try:
        from cryptography import x509
        from cryptography.hazmat.primitives.asymmetric import ec, rsa
        from cryptography.x509.oid import NameOID

        parsed = x509.load_pem_x509_certificate(pem.encode())
        cn_attrs = parsed.subject.get_attributes_for_oid(NameOID.COMMON_NAME)
        subject_cn = cn_attrs[0].value if cn_attrs else None
        san: list[str] = []
        dns_names: list[str] = []
        ip_addrs_str: list[str] = []
        try:
            san_ext = parsed.extensions.get_extension_for_class(x509.SubjectAlternativeName)
            dns_names = [str(v) for v in san_ext.value.get_values_for_type(x509.DNSName)]
            ip_addrs_str = [str(v) for v in san_ext.value.get_values_for_type(x509.IPAddress)]
            san = dns_names + ip_addrs_str
        except x509.ExtensionNotFound:
            san = []

        not_after = getattr(parsed, "not_valid_after_utc", None)
        if not_after is not None:
            not_after = not_after.replace(tzinfo=None)
        else:
            # cryptography<42 只有 naive UTC 版本
            not_after = parsed.not_valid_after

        pub = parsed.public_key()
        if isinstance(pub, rsa.RSAPublicKey):
            algorithm = "rsa"
        elif isinstance(pub, ec.EllipticCurvePublicKey) and pub.curve.name.lower() == "sm2":
            algorithm = "sm2"
        elif isinstance(pub, ec.EllipticCurvePublicKey):
            algorithm = "ecc"
        else:
            algorithm = type(pub).__name__.lower()

        return {
            "ok": True,
            "subject_cn": subject_cn,
            "san": san,
            "dns_sans": dns_names,
            "ip_sans": ip_addrs_str,
            "not_after": not_after.isoformat(),
            "algorithm": algorithm,
            "expire_days": (not_after - datetime.utcnow()).days,
        }
    except Exception:
        return None


def parse_key_pem(key: Any) -> bool:
    """私钥 PEM 能否被解析（RSA/EC PKCS8/Traditional 均可；国密私钥视 cryptography 能力降级）。"""
    if not isinstance(key, str) or "PRIVATE KEY" not in key:
        return False
    try:
        from cryptography.hazmat.primitives.serialization import load_pem_private_key

        load_pem_private_key(key.encode(), password=None)
        return True
    except Exception:
        return False


def keys_match(cert_pem: Any, key_pem: Any) -> Optional[bool]:
    """证书与私钥是否同对；任一不可解析返回 None（不做配对判定）。"""
    if not isinstance(cert_pem, str) or not isinstance(key_pem, str):
        return None
    try:
        from cryptography import x509
        from cryptography.hazmat.primitives.asymmetric import ec, rsa
        from cryptography.hazmat.primitives.serialization import load_pem_private_key

        cert = x509.load_pem_x509_certificate(cert_pem.encode())
        priv = load_pem_private_key(key_pem.encode(), password=None)
        cert_pub = cert.public_key()
        if isinstance(cert_pub, rsa.RSAPublicKey) and isinstance(priv, rsa.RSAPrivateKey):
            return cert_pub.public_numbers() == priv.public_key().public_numbers()
        if isinstance(cert_pub, ec.EllipticCurvePublicKey) and isinstance(priv, ec.EllipticCurvePrivateKey):
            return cert_pub.public_numbers() == priv.public_key().public_numbers()
        return False
    except Exception:
        return None
