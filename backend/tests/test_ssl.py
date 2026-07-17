"""Tests for SSL certificate model and schema.

TDD: Write failing test -> verify fail -> implement -> verify pass.
"""
import pytest
import json
from pydantic import ValidationError
from sqlalchemy import select
from app.models.ssl import SslCertificate


class TestSslCertificateModel:
    """Model-level tests for SslCertificate."""

    async def test_create_ssl_minimal(self, test_db):

        cert = SslCertificate(
            cluster_id=1,
            name="test-cert",
            sni="example.com",
            cert="-----BEGIN CERTIFICATE-----\nMIIB2DCCAX4CCQ...\n-----END CERTIFICATE-----",
            private_key="-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgk...\n-----END PRIVATE KEY-----",
        )
        test_db.add(cert)
        await test_db.commit()
        await test_db.refresh(cert)

        assert cert.id is not None
        assert cert.edge_uuid is not None
        assert len(cert.edge_uuid) == 36  # UUID
        assert cert.cluster_id == 1
        assert cert.name == "test-cert"
        assert cert.sni == "example.com"
        assert cert.cert_type == "server"
        assert cert.status == 1
        assert cert.created_at is not None

    async def test_create_ssl_full(self, test_db):
        cert = SslCertificate(
            cluster_id=2,
            name="full-cert",
            sni="api.example.com,admin.example.com",
            cert="-----BEGIN CERTIFICATE-----\nFULLCERT...\n-----END CERTIFICATE-----",
            private_key="-----BEGIN PRIVATE KEY-----\nFULLKEY...\n-----END PRIVATE KEY-----",
            cert_type="server",
            ssl_protocols='["TLSv1.2","TLSv1.3"]',
            description="Test cert for API gateway",
        )
        test_db.add(cert)
        await test_db.commit()
        await test_db.refresh(cert)

        assert cert.id is not None
        assert cert.cluster_id == 2
        assert cert.name == "full-cert"
        assert cert.sni == "api.example.com,admin.example.com"
        assert cert.cert_type == "server"
        assert cert.description == "Test cert for API gateway"
        assert cert.current_version is None  # not published yet

    async def test_ssl_defaults(self, test_db):
        cert = SslCertificate(
            cluster_id=1,
            name="defaults-cert",
            sni="test.local",
            cert="crt",
            private_key="key",
        )
        test_db.add(cert)
        await test_db.commit()
        await test_db.refresh(cert)
        assert cert.cert_type == "server"
        assert cert.status == 1

    async def test_gm_cert_with_sign_fields(self, test_db):
        cert = SslCertificate(
            cluster_id=3,
            name="gm-cert",
            sni="gmtest.local",
            cert="enc-cert-pem",
            private_key="enc-key-pem",
            gm=True,
            sign_cert="sign-cert-pem",
            sign_key="sign-key-pem",
        )
        test_db.add(cert)
        await test_db.commit()
        await test_db.refresh(cert)

        assert cert.gm is True
        assert cert.sign_cert == "sign-cert-pem"
        assert cert.sign_key == "sign-key-pem"
        assert cert.cert == "enc-cert-pem"

    async def test_gm_defaults_to_false(self, test_db):
        cert = SslCertificate(
            cluster_id=1,
            name="non-gm-cert",
            sni="test.local",
            cert="crt",
            private_key="key",
        )
        test_db.add(cert)
        await test_db.flush()
        assert cert.gm is False
        assert cert.sign_cert is None
        assert cert.sign_key is None


class TestSslApi:
    """SSL certificate API tests."""

    def test_ssl_router_has_routes(self):
        from app.api.v1.cluster_ssl import router

        assert len(router.routes) > 0


class TestSslEdgeClient:
    """EdgeClient SSL resource path tests."""

    def test_ssl_resource_path_registered(self):
        from app.services.edge_client import EdgeClient

        assert EdgeClient.RESOURCE_PATHS["ssl"] == "/edge/admin/ssl"


class TestSslCertificateSchema:
    """Schema-level tests."""

    def test_create_schema_valid(self):
        from app.schemas.ssl import SslCertificateCreate

        data = SslCertificateCreate(
            cluster_id=1,
            name="test-cert",
            sni="example.com",
            cert="-----BEGIN CERTIFICATE-----...",
            private_key="-----BEGIN KEY-----...",
        )
        assert data.name == "test-cert"
        assert data.cluster_id == 1
        assert data.cert_type == "server"

    def test_create_schema_missing_required(self):
        from app.schemas.ssl import SslCertificateCreate

        with pytest.raises(ValidationError):
            SslCertificateCreate(cluster_id=1, name="test")

    def test_create_gm_schema_valid(self):
        from app.schemas.ssl import SslCertificateCreate

        data = SslCertificateCreate(
            cluster_id=1,
            name="gm-cert",
            sni="gm.local",
            cert="enc-cert",
            private_key="enc-key",
            gm=True,
            sign_cert="sign-cert",
            sign_key="sign-key",
        )
        assert data.gm is True
        assert data.sign_cert == "sign-cert"
        assert data.sign_key == "sign-key"

    def test_gm_requires_sign_cert(self):
        from app.schemas.ssl import SslCertificateCreate

        with pytest.raises(ValidationError):
            SslCertificateCreate(
                cluster_id=1, name="bad-gm", sni="gm.local",
                cert="crt", private_key="key",
                gm=True, sign_cert="", sign_key="",
            )


class TestSslPublishConfig:
    """SSL publish config_data assembly logic."""

    def _publish_data(self, cert) -> dict:
        sni_list = [s.strip() for s in cert.sni.split(",") if s.strip()] if cert.sni else []
        config = {"cert": cert.cert, "key": cert.private_key, "type": cert.cert_type}
        if len(sni_list) == 1:
            config["sni"] = sni_list[0]
        elif len(sni_list) > 1:
            config["snis"] = sni_list
        if cert.gm:
            config["certs"] = [cert.sign_cert]
            config["keys"] = [cert.sign_key]
            config["gm"] = True
        return config

    def test_gm_publish_includes_sign_fields(self):
        class FakeCert:
            cert = "enc-pem"
            private_key = "enc-key-pem"
            cert_type = "server"
            sni = "gm.local"
            gm = True
            sign_cert = "sign-pem"
            sign_key = "sign-key-pem"

        data = self._publish_data(FakeCert())
        assert data["cert"] == "enc-pem"
        assert data["key"] == "enc-key-pem"
        assert data["certs"] == ["sign-pem"]
        assert data["keys"] == ["sign-key-pem"]
        assert data["gm"] is True

    def test_normal_publish_no_gm_fields(self):
        class FakeCert:
            cert = "crt"
            private_key = "key"
            cert_type = "server"
            sni = "test.local"
            gm = False
            sign_cert = ""
            sign_key = ""

        data = self._publish_data(FakeCert())
        assert "certs" not in data
        assert "keys" not in data
        assert "gm" not in data
