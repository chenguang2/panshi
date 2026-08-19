"""Tests for reserved SNI (edge.local) merge logic.

TDD: Write failing test -> verify fail -> implement -> verify pass.

Covers openspec/changes/add-edge-local-sni tasks 1.1-1.5, 2.1-2.2.
"""
import json

import pytest

from app.models.ssl import SslCertificate


# ===== helpers (real openssl) =====

def _openssl_path():
    from app.services.cert_generator import detect_openssl
    info = detect_openssl()
    assert info["path"], "No openssl available"
    return info["path"]


def _cert_text(cert_pem: str) -> str:
    """Return `openssl x509 -text -noout` output for a PEM cert."""
    import subprocess
    import tempfile
    from pathlib import Path

    with tempfile.TemporaryDirectory(prefix="panshi_san_") as tmp:
        p = Path(tmp) / "cert.pem"
        p.write_text(cert_pem)
        out = subprocess.run(
            [_openssl_path(), "x509", "-in", str(p), "-noout", "-text"],
            capture_output=True, text=True,
        )
        assert out.returncode == 0, f"openssl x509 failed: {out.stderr}"
        return out.stdout


async def _create_ca(test_db, algorithm: str = "rsa") -> int:
    """Create a real CA record in test_db, return its id."""
    from app.services.cert_generator import generate_ca_certificate, detect_openssl

    info = detect_openssl()
    if algorithm == "sm2" and not info["sm2_supported"]:
        pytest.skip("No SM2-capable openssl available")
    result, _ = generate_ca_certificate(
        openssl_path=info["path"],
        common_name=f"Test CA {algorithm}",
        validity_days=3650,
        flavor=info["flavor"],
        algorithm=algorithm,
    )
    ca = SslCertificate(
        cluster_id=1, name=f"test-ca-{algorithm}", sni="ca.local",
        cert=result["ca_cert"], private_key=result["ca_key"],
        cert_type="server", is_ca=True, algorithm=algorithm,
    )
    test_db.add(ca)
    await test_db.commit()
    await test_db.refresh(ca)
    return ca.id


# ===== Task 1.1 + 1.2: constant + merge helper =====

class TestReservedSnisConstant:
    """RESERVED_SNIS constant must exist and contain edge.local."""

    def test_reserved_snis_constant_exists(self):
        from app.api.v1.cluster_ssl import RESERVED_SNIS
        assert RESERVED_SNIS == ("edge.local",)

    def test_reserved_snis_is_tuple_of_str(self):
        from app.api.v1.cluster_ssl import RESERVED_SNIS
        assert all(isinstance(s, str) for s in RESERVED_SNIS)


class TestMergeReservedDns:
    """merge_reserved_dns: merge edge.local into a DNS SAN list."""

    def test_empty_dns_gets_only_reserved(self):
        from app.api.v1.cluster_ssl import merge_reserved_dns
        assert merge_reserved_dns([]) == ["edge.local"]

    def test_appends_user_dns_after_reserved(self):
        from app.api.v1.cluster_ssl import merge_reserved_dns
        assert merge_reserved_dns(["example.com"]) == ["edge.local", "example.com"]

    def test_dedup_exact_match(self):
        from app.api.v1.cluster_ssl import merge_reserved_dns
        assert merge_reserved_dns(["edge.local"]) == ["edge.local"]

    def test_normalizes_case(self):
        from app.api.v1.cluster_ssl import merge_reserved_dns
        assert merge_reserved_dns(["EDGE.LOCAL"]) == ["edge.local"]

    def test_strips_and_lowercases_user_dns(self):
        from app.api.v1.cluster_ssl import merge_reserved_dns
        assert merge_reserved_dns([" Example.COM "]) == ["edge.local", "example.com"]

    def test_mixed_case_duplicates_dedup(self):
        from app.api.v1.cluster_ssl import merge_reserved_dns
        assert merge_reserved_dns(["Edge.Local", "edge.local"]) == ["edge.local"]

    def test_preserves_order_of_user_dns(self):
        from app.api.v1.cluster_ssl import merge_reserved_dns
        assert merge_reserved_dns(["b.com", "a.com"]) == ["edge.local", "b.com", "a.com"]

    def test_handles_none(self):
        from app.api.v1.cluster_ssl import merge_reserved_dns
        assert merge_reserved_dns(None) == ["edge.local"]


class TestMergeReservedSniString:
    """merge_reserved_into_sni_str: ensure edge.local in comma-separated sni field."""

    def test_empty_string_gets_reserved(self):
        from app.api.v1.cluster_ssl import merge_reserved_into_sni_str
        assert merge_reserved_into_sni_str("") == "edge.local"

    def test_none_gets_reserved(self):
        from app.api.v1.cluster_ssl import merge_reserved_into_sni_str
        assert merge_reserved_into_sni_str(None) == "edge.local"

    def test_prepends_reserved_to_existing(self):
        from app.api.v1.cluster_ssl import merge_reserved_into_sni_str
        assert merge_reserved_into_sni_str("api.example.com") == "edge.local,api.example.com"

    def test_keeps_existing_reserved_first(self):
        from app.api.v1.cluster_ssl import merge_reserved_into_sni_str
        assert merge_reserved_into_sni_str("edge.local,api.example.com") == "edge.local,api.example.com"

    def test_normalizes_reserved_case_and_moves_to_front(self):
        from app.api.v1.cluster_ssl import merge_reserved_into_sni_str
        assert merge_reserved_into_sni_str("api.example.com,EDGE.LOCAL") == "edge.local,api.example.com"

    def test_dedup_case_insensitive(self):
        from app.api.v1.cluster_ssl import merge_reserved_into_sni_str
        assert merge_reserved_into_sni_str("EDGE.LOCAL,edge.local,api.com") == "edge.local,api.com"

    def test_keeps_ip_entries(self):
        from app.api.v1.cluster_ssl import merge_reserved_into_sni_str
        assert merge_reserved_into_sni_str("10.0.0.1") == "edge.local,10.0.0.1"

    def test_strips_whitespace_entries(self):
        from app.api.v1.cluster_ssl import merge_reserved_into_sni_str
        assert merge_reserved_into_sni_str(" api.com , edge.local ") == "edge.local,api.com"


# ===== Task 1.3 + 1.5: server cert SAN & sni contain edge.local =====

class TestGenerateLocalServerCert:
    """_generate_local must merge edge.local into server certs (all algorithms)."""

    async def _gen(self, test_db, **overrides):
        from app.api.v1.cluster_ssl import _generate_local
        from app.schemas.ssl import SslCertificateGenerateRequest

        params = dict(
            name="srv-cert", common_name="example.com",
            dns_sans=["example.com"], algorithm="rsa",
            ca_cert_id=None,
        )
        params.update(overrides)
        req = SslCertificateGenerateRequest(**params)
        return await _generate_local(test_db, 1, req)

    async def test_rsa_server_sni_contains_edge_local(self, test_db):
        ca_id = await _create_ca(test_db, "rsa")
        result = await self._gen(test_db, algorithm="rsa", ca_cert_id=ca_id)
        resp = result.server
        assert resp.sni == "edge.local,example.com"

    async def test_rsa_server_cert_san_contains_edge_local(self, test_db):
        ca_id = await _create_ca(test_db, "rsa")
        result = await self._gen(test_db, algorithm="rsa", ca_cert_id=ca_id)
        cert_text = _cert_text(result.server.cert)
        assert "DNS:edge.local" in cert_text
        assert "DNS:example.com" in cert_text

    async def test_ecc_server_cert_san_contains_edge_local(self, test_db):
        ca_id = await _create_ca(test_db, "rsa")
        result = await self._gen(test_db, algorithm="ecc", ca_cert_id=ca_id)
        assert result.server.sni == "edge.local,example.com"
        assert "DNS:edge.local" in _cert_text(result.server.cert)

    async def test_sm2_server_dual_certs_contain_edge_local(self, test_db):
        ca_id = await _create_ca(test_db, "sm2")
        result = await self._gen(
            test_db, algorithm="sm2", ca_cert_id=ca_id,
        )
        resp = result.server
        assert resp.sni == "edge.local,example.com"
        assert "DNS:edge.local" in _cert_text(resp.cert)
        assert "DNS:edge.local" in _cert_text(resp.sign_cert)

    async def test_empty_dns_still_gets_edge_local(self, test_db):
        ca_id = await _create_ca(test_db, "rsa")
        result = await self._gen(
            test_db, algorithm="rsa", ca_cert_id=ca_id, dns_sans=[],
        )
        resp = result.server
        assert resp.sni == "edge.local"
        assert "DNS:edge.local" in _cert_text(resp.cert)

    async def test_user_dns_case_normalized_and_deduped(self, test_db):
        ca_id = await _create_ca(test_db, "rsa")
        result = await self._gen(
            test_db, algorithm="rsa", ca_cert_id=ca_id,
            dns_sans=["EDGE.LOCAL", " Example.COM "],
        )
        resp = result.server
        assert resp.sni == "edge.local,example.com"

    async def test_ip_sans_stripped_and_preserved(self, test_db):
        ca_id = await _create_ca(test_db, "rsa")
        result = await self._gen(
            test_db, algorithm="rsa", ca_cert_id=ca_id,
            dns_sans=[], ip_sans=[" 10.0.0.1 "],
        )
        resp = result.server
        assert resp.sni == "edge.local,10.0.0.1"
        cert_text = _cert_text(resp.cert)
        assert "DNS:edge.local" in cert_text
        assert "IP Address:10.0.0.1" in cert_text

    async def test_sni_matches_cert_san_list(self, test_db):
        ca_id = await _create_ca(test_db, "rsa")
        result = await self._gen(
            test_db, algorithm="rsa", ca_cert_id=ca_id,
            dns_sans=["a.com", "b.com"], ip_sans=["10.0.0.1"],
        )
        resp = result.server
        assert resp.sni == "edge.local,a.com,b.com,10.0.0.1"
        cert_text = _cert_text(resp.cert)
        assert "DNS:edge.local" in cert_text
        assert "DNS:a.com" in cert_text
        assert "DNS:b.com" in cert_text
        assert "IP Address:10.0.0.1" in cert_text


# ===== Task 1.4: client certs are NOT force-merged =====

class TestGenerateLocalClientCert:
    """_generate_local must NOT merge edge.local into client certs."""

    async def _gen(self, test_db, **overrides):
        from app.api.v1.cluster_ssl import _generate_local
        from app.schemas.ssl import SslCertificateGenerateRequest

        params = dict(
            name="cert", common_name="example.com",
            dns_sans=["example.com"], algorithm="sm2",
            ca_cert_id=None, generate_client_certs=True,
        )
        params.update(overrides)
        req = SslCertificateGenerateRequest(**params)
        return await _generate_local(test_db, 1, req)

    async def test_sm2_client_dual_certs_keep_user_san(self, test_db):
        ca_id = await _create_ca(test_db, "sm2")
        result = await self._gen(test_db, ca_cert_id=ca_id)
        client = result.client
        assert client is not None
        assert client.cert_type == "client"
        assert client.sni == "example.com"
        assert "edge.local" not in client.sni
        cert_text = _cert_text(client.cert)
        assert "DNS:example.com" in cert_text
        assert "DNS:edge.local" not in cert_text
        sign_text = _cert_text(client.sign_cert)
        assert "DNS:edge.local" not in sign_text

    async def test_sm2_client_cert_sni_falls_back_to_cn(self, test_db):
        ca_id = await _create_ca(test_db, "sm2")
        result = await self._gen(
            test_db, ca_cert_id=ca_id, dns_sans=[], ip_sans=[],
        )
        client = result.client
        assert client.sni == "example.com-client"

    async def test_cert_type_client_request_not_merged(self, test_db):
        ca_id = await _create_ca(test_db, "rsa")
        from app.api.v1.cluster_ssl import _generate_local
        from app.schemas.ssl import SslCertificateGenerateRequest

        req = SslCertificateGenerateRequest(
            name="client-cert", common_name="client.example.com",
            dns_sans=["client.example.com"], algorithm="rsa",
            ca_cert_id=ca_id, cert_type="client",
        )
        result = await _generate_local(test_db, 1, req)
        resp = result.server
        assert resp.cert_type == "client"
        assert resp.sni == "client.example.com"
        assert "edge.local" not in resp.sni
        cert_text = _cert_text(resp.cert)
        assert "DNS:client.example.com" in cert_text
        assert "DNS:edge.local" not in cert_text

    async def test_client_record_sni_does_not_inherit_server_merge(self, test_db):
        ca_id = await _create_ca(test_db, "sm2")
        result = await self._gen(
            test_db, ca_cert_id=ca_id, dns_sans=["a.com"],
        )
        assert result.server.sni == "edge.local,a.com"
        client = result.client
        assert client.sni == "a.com"


# ===== Task 2.1: update path forces edge.local on server certs =====

class TestUpdateSslCertificateReservedSni:
    """PUT /ssl/{id} must keep edge.local in server cert sni."""

    async def _make_cert(self, test_db, cert_type="server", is_ca=False, sni="old.local"):
        cert = SslCertificate(
            cluster_id=1, name="update-me", sni=sni,
            cert="crt", private_key="key",
            cert_type=cert_type, is_ca=is_ca,
        )
        test_db.add(cert)
        await test_db.commit()
        await test_db.refresh(cert)
        return cert

    async def test_update_server_sni_merges_edge_local(self, test_db):
        from app.api.v1.cluster_ssl import update_ssl_certificate
        from app.schemas.ssl import SslCertificateUpdate

        cert = await self._make_cert(test_db)
        await update_ssl_certificate(1, cert.id, SslCertificateUpdate(sni="api.example.com"), test_db)
        await test_db.refresh(cert)
        assert cert.sni == "edge.local,api.example.com"

    async def test_update_server_sni_dedups_existing_edge_local(self, test_db):
        from app.api.v1.cluster_ssl import update_ssl_certificate
        from app.schemas.ssl import SslCertificateUpdate

        cert = await self._make_cert(test_db)
        await update_ssl_certificate(1, cert.id, SslCertificateUpdate(sni="edge.local,api.example.com"), test_db)
        await test_db.refresh(cert)
        assert cert.sni == "edge.local,api.example.com"

    async def test_update_server_sni_normalizes_case(self, test_db):
        from app.api.v1.cluster_ssl import update_ssl_certificate
        from app.schemas.ssl import SslCertificateUpdate

        cert = await self._make_cert(test_db)
        await update_ssl_certificate(1, cert.id, SslCertificateUpdate(sni="api.example.com,EDGE.LOCAL"), test_db)
        await test_db.refresh(cert)
        assert cert.sni == "edge.local,api.example.com"

    async def test_update_client_sni_not_merged(self, test_db):
        from app.api.v1.cluster_ssl import update_ssl_certificate
        from app.schemas.ssl import SslCertificateUpdate

        cert = await self._make_cert(test_db, cert_type="client")
        await update_ssl_certificate(1, cert.id, SslCertificateUpdate(sni="api.example.com"), test_db)
        await test_db.refresh(cert)
        assert cert.sni == "api.example.com"

    async def test_update_ca_sni_not_merged(self, test_db):
        from app.api.v1.cluster_ssl import update_ssl_certificate
        from app.schemas.ssl import SslCertificateUpdate

        cert = await self._make_cert(test_db, is_ca=True)
        await update_ssl_certificate(1, cert.id, SslCertificateUpdate(sni="api.example.com"), test_db)
        await test_db.refresh(cert)
        assert cert.sni == "api.example.com"

    async def test_update_without_sni_leaves_it_untouched(self, test_db):
        from app.api.v1.cluster_ssl import update_ssl_certificate
        from app.schemas.ssl import SslCertificateUpdate

        cert = await self._make_cert(test_db)
        await update_ssl_certificate(1, cert.id, SslCertificateUpdate(description="no sni change"), test_db)
        await test_db.refresh(cert)
        assert cert.sni == "old.local"

    async def test_update_server_type_change_to_client_skips_merge(self, test_db):
        from app.api.v1.cluster_ssl import update_ssl_certificate
        from app.schemas.ssl import SslCertificateUpdate

        cert = await self._make_cert(test_db)
        await update_ssl_certificate(
            1, cert.id,
            SslCertificateUpdate(sni="api.example.com", cert_type="client"),
            test_db,
        )
        await test_db.refresh(cert)
        assert cert.sni == "api.example.com"


# ===== Task 2.2: rollback path forces edge.local on server certs =====

class TestRollbackSslCertificateReservedSni:
    """rollback must keep edge.local in server cert sni."""

    async def _setup(self, test_db, cert_type="server", is_ca=False, current_sni="edge.local,current.local"):
        cert = SslCertificate(
            cluster_id=1, name="rollback-me", sni=current_sni,
            cert="crt", private_key="key",
            cert_type=cert_type, is_ca=is_ca, current_version=3,
        )
        test_db.add(cert)
        await test_db.commit()
        await test_db.refresh(cert)

        from app.models.cluster import ConfigVersion
        config = {
            "name": "rollback-me",
            "sni": "old.local",
            "cert": "old-crt",
            "key": "old-key",
            "type": cert_type,
        }
        ver = ConfigVersion(
            cluster_id=1, resource_type="ssl", resource_id=cert.id,
            version=2, config=json.dumps(config),
        )
        test_db.add(ver)
        await test_db.commit()
        await test_db.refresh(ver)
        return cert, ver

    async def test_rollback_server_sni_merges_edge_local(self, test_db):
        from app.api.v1.cluster_ssl import rollback_ssl_certificate

        cert, _ = await self._setup(test_db)
        await rollback_ssl_certificate(1, cert.id, 2, test_db)
        await test_db.refresh(cert)
        assert cert.sni == "edge.local,old.local"

    async def test_rollback_server_keeps_existing_edge_local(self, test_db):
        from app.api.v1.cluster_ssl import rollback_ssl_certificate

        cert, _ = await self._setup(test_db, current_sni="edge.local,current.local")
        from app.models.cluster import ConfigVersion
        from sqlalchemy import select as sa_select
        rows = (await test_db.execute(
            sa_select(ConfigVersion).where(ConfigVersion.resource_id == cert.id)
        )).scalars().all()
        rows[0].config = json.dumps({
            "name": "rollback-me", "sni": "edge.local,old.local",
            "cert": "old-crt", "key": "old-key", "type": "server",
        })
        await test_db.commit()
        await rollback_ssl_certificate(1, cert.id, 2, test_db)
        await test_db.refresh(cert)
        assert cert.sni == "edge.local,old.local"

    async def test_rollback_client_sni_not_merged(self, test_db):
        from app.api.v1.cluster_ssl import rollback_ssl_certificate

        cert, _ = await self._setup(test_db, cert_type="client")
        await rollback_ssl_certificate(1, cert.id, 2, test_db)
        await test_db.refresh(cert)
        assert cert.sni == "old.local"

    async def test_rollback_ca_sni_not_merged(self, test_db):
        from app.api.v1.cluster_ssl import rollback_ssl_certificate

        cert, _ = await self._setup(test_db, is_ca=True)
        await rollback_ssl_certificate(1, cert.id, 2, test_db)
        await test_db.refresh(cert)
        assert cert.sni == "old.local"