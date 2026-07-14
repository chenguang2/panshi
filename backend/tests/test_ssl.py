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
