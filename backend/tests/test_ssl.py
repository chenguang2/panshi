"""Tests for SSL certificate model and schema.

TDD: Write failing test -> verify fail -> implement -> verify pass.
"""
import pytest
import json
from unittest.mock import patch
from pydantic import ValidationError
from sqlalchemy import select
from app.models.ssl import SslCertificate
from app.models.cluster import Node
from app.schemas.ssl import SslCertificateUpdate
from app.api.v1.cluster_ssl import update_ssl_certificate, publish_ssl_certificate
from app.services import edge_sync


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
        # algorithm field exists (may be None for old records)
        assert hasattr(cert, "algorithm")

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

    # --- Task 1.1: create_method field ---

    async def test_create_method_default_is_upload(self, test_db):
        cert = SslCertificate(
            cluster_id=1,
            name="create-method-test",
            sni="test.local",
            cert="crt",
            private_key="key",
        )
        test_db.add(cert)
        await test_db.commit()
        await test_db.refresh(cert)
        assert cert.create_method == "upload"

    async def test_create_method_can_be_set(self, test_db):
        cert = SslCertificate(
            cluster_id=1,
            name="create-method-set",
            sni="test.local",
            cert="crt",
            private_key="key",
            create_method="local_generate",
        )
        test_db.add(cert)
        await test_db.commit()
        await test_db.refresh(cert)
        assert cert.create_method == "local_generate"


class TestSslApi:
    """SSL certificate API tests."""

    def test_generate_route_registered(self):
        from app.api.v1.cluster_ssl import router

        route_paths = [r.path for r in router.routes]
        assert any("generate" in p for p in route_paths), (
            f"No /generate route found in {route_paths}"
        )

    def test_generate_route_accepts_post(self):
        from app.api.v1.cluster_ssl import router

        for r in router.routes:
            if "generate" in r.path:
                methods = r.methods
                assert "POST" in methods, f"generate route {r.path} methods: {methods}"
                return
        raise AssertionError("No generate route found")


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


class TestSslCertificateCreateMethod:
    """Tests for create_method in Pydantic schemas."""

    def test_create_method_in_response_schema(self):
        from app.schemas.ssl import SslCertificateResponse

        # Use field names (not aliases) for inspection
        schema_fields = SslCertificateResponse.model_fields
        assert "create_method" in schema_fields, "create_method missing from SslCertificateResponse"

    def test_create_method_inherited_by_create_schema(self):
        from app.schemas.ssl import SslCertificateCreate

        schema_fields = SslCertificateCreate.model_fields
        assert "create_method" in schema_fields, "create_method should be inherited from Base"
        # Has default "upload", so it's optional - server handler overrides it
        field = schema_fields["create_method"]
        assert field.default == "upload"

    def test_response_create_method_default(self):
        from app.schemas.ssl import SslCertificateResponse

        resp = SslCertificateResponse(
            id=1,
            edge_uuid="00000000-0000-0000-0000-000000000001",
            cluster_id=1,
            name="test",
            sni="test.local",
            cert="crt",
            private_key="key",
        )
        assert resp.create_method == "upload"


class TestSslMigration:
    """Migration tests for column additions."""

    def test_create_method_in_column_migrations(self):
        from app.core.migrate import COLUMN_MIGRATIONS
        assert any(
            table == "ps_ssl_certificate" and col == "create_method"
            for table, col, _ in COLUMN_MIGRATIONS
        ), "create_method migration entry missing in COLUMN_MIGRATIONS"

    def test_column_migration_adds_create_method(self):
        """Verify _add_column creates create_method column."""
        from sqlalchemy import create_engine, text
        from app.core.migrate import _add_column

        engine = create_engine("sqlite://", echo=False)
        with engine.connect() as conn:
            conn.execute(text(
                "CREATE TABLE ps_ssl_certificate ("
                "  id INTEGER PRIMARY KEY,"
                "  cluster_id INTEGER NOT NULL"
                ")"
            ))
            conn.commit()

        added = _add_column(engine, "ps_ssl_certificate", "create_method", "VARCHAR(32) DEFAULT 'upload'")
        assert added is True

        with engine.connect() as conn:
            cols = conn.execute(text("PRAGMA table_info(ps_ssl_certificate)")).fetchall()
            col_names = [c[1] for c in cols]
            assert "create_method" in col_names


class TestSslGenerateRequest:
    """Tests for SslCertificateGenerateRequest schema (simplified)."""

    def test_required_fields(self):
        from app.schemas.ssl import SslCertificateGenerateRequest

        req = SslCertificateGenerateRequest(
            name="test-cert",
            common_name="test.com",
        )
        assert req.name == "test-cert"
        assert req.common_name == "test.com"
        assert req.validity_days == 365  # default
        assert req.dual_cert is True  # default
        assert req.ca_cert_id is None
        assert req.generate_client_certs is False

    def test_ca_cert_id_and_client_certs(self):
        from app.schemas.ssl import SslCertificateGenerateRequest

        req = SslCertificateGenerateRequest(
            name="test",
            common_name="test.com",
            ca_cert_id=42,
            generate_client_certs=True,
        )
        assert req.ca_cert_id == 42
        assert req.generate_client_certs is True

    def test_sans_optional(self):
        from app.schemas.ssl import SslCertificateGenerateRequest

        req = SslCertificateGenerateRequest(
            name="test",
            common_name="test.com",
            dns_sans=["a.com", "b.com"],
            ip_sans=["10.0.0.1"],
        )
        assert req.dns_sans == ["a.com", "b.com"]
        assert req.ip_sans == ["10.0.0.1"]

    def test_algorithms_accepted(self):
        from app.schemas.ssl import SslCertificateGenerateRequest

        for alg in ("sm2", "rsa", "ecc"):
            req = SslCertificateGenerateRequest(
                name="test", common_name="test.com", algorithm=alg,
            )
            assert req.algorithm == alg

    def test_ip_sans_accepts_valid_ipv4_and_ipv6(self):
        from app.schemas.ssl import SslCertificateGenerateRequest

        req = SslCertificateGenerateRequest(
            name="test", common_name="test.com",
            ip_sans=["10.0.0.1", "2001:db8::1"],
        )
        assert req.ip_sans == ["10.0.0.1", "2001:db8::1"]

    def test_ip_sans_rejects_invalid_ip(self):
        from pydantic import ValidationError
        from app.schemas.ssl import SslCertificateGenerateRequest

        with pytest.raises(ValidationError) as exc_info:
            SslCertificateGenerateRequest(
                name="test", common_name="test.com",
                ip_sans=["abc"],
            )
        assert "无效的 IP 地址" in str(exc_info.value)

    def test_ip_sans_rejects_multiple_invalid_ips(self):
        from pydantic import ValidationError
        from app.schemas.ssl import SslCertificateGenerateRequest

        with pytest.raises(ValidationError) as exc_info:
            SslCertificateGenerateRequest(
                name="test", common_name="test.com",
                ip_sans=["999", "1.2.3"],
            )
        assert "无效的 IP 地址" in str(exc_info.value)


class TestCaCertificateGenerateRequest:
    """Tests for CaCertificateGenerateRequest schema."""

    def test_required_name(self):
        from app.schemas.ssl import CaCertificateGenerateRequest
        from pydantic import ValidationError

        with pytest.raises(ValidationError):
            CaCertificateGenerateRequest()

    def test_defaults(self):
        from app.schemas.ssl import CaCertificateGenerateRequest

        req = CaCertificateGenerateRequest(name="My CA")
        assert req.name == "My CA"
        assert req.common_name is None
        assert req.validity_days == 3650

    def test_all_fields(self):
        from app.schemas.ssl import CaCertificateGenerateRequest

        req = CaCertificateGenerateRequest(
            name="My CA", common_name="My Root CA", validity_days=7300,
        )
        assert req.name == "My CA"
        assert req.common_name == "My Root CA"
        assert req.validity_days == 7300

    def test_default_algorithm_is_sm2(self):
        from app.schemas.ssl import CaCertificateGenerateRequest

        req = CaCertificateGenerateRequest(name="CA")
        assert req.algorithm == "sm2"

    def test_algorithm_accepts_rsa_ecc(self):
        from app.schemas.ssl import CaCertificateGenerateRequest
        from pydantic import ValidationError

        req = CaCertificateGenerateRequest(name="CA", algorithm="rsa")
        assert req.algorithm == "rsa"
        req2 = CaCertificateGenerateRequest(name="CA", algorithm="ecc")
        assert req2.algorithm == "ecc"

        with pytest.raises(ValidationError):
            CaCertificateGenerateRequest(name="CA", algorithm="invalid")


class TestSslCertificateGenerateResponse:
    """Tests for SslCertificateGenerateResponse schema."""

    def test_server_required_client_optional(self):
        from app.schemas.ssl import (
            SslCertificateGenerateResponse, SslCertificateResponse,
        )

        server = SslCertificateResponse(
            id=1, edge_uuid="uuid", cluster_id=1,
            name="srv", sni="srv.local", cert="crt", key="key",
        )
        resp = SslCertificateGenerateResponse(server=server)
        assert resp.server.id == 1
        assert resp.client is None

    def test_with_client(self):
        from app.schemas.ssl import (
            SslCertificateGenerateResponse, SslCertificateResponse,
        )

        server = SslCertificateResponse(
            id=1, edge_uuid="uuid", cluster_id=1,
            name="srv", sni="srv.local", cert="crt", key="key",
        )
        client = SslCertificateResponse(
            id=2, edge_uuid="uuid2", cluster_id=1,
            name="client", sni="client.local", cert="crt", key="key",
            cert_type="client",
        )
        resp = SslCertificateGenerateResponse(server=server, client=client)
        assert resp.server.id == 1
        assert resp.client is not None
        assert resp.client.id == 2
        assert resp.client.cert_type == "client"


class TestSslResponseIsCaFields:
    """Tests for is_ca and ca_cert_id in response schema."""

    def test_response_has_is_ca_field(self):
        from app.schemas.ssl import SslCertificateResponse

        fields = SslCertificateResponse.model_fields
        assert "is_ca" in fields

    def test_response_has_ca_cert_id_field(self):
        from app.schemas.ssl import SslCertificateResponse

        fields = SslCertificateResponse.model_fields
        assert "ca_cert_id" in fields

    def test_ca_response_masks_private_key(self):
        from app.schemas.ssl import SslCertificateResponse

        resp = SslCertificateResponse(
            id=1, edge_uuid="uuid", cluster_id=1,
            name="ca", sni="ca.local", cert="crt", key="secret-key",
            is_ca=True,
        )
        assert resp.is_ca is True
        assert resp.private_key == "", "CA response should mask private_key"


class TestSslMtlsMigration:
    """Migration tests for new mTLS column additions."""

    def test_client_ca_in_column_migrations(self):
        from app.core.migrate import COLUMN_MIGRATIONS
        assert any(
            table == "ps_ssl_certificate" and col == "client_ca"
            for table, col, _ in COLUMN_MIGRATIONS
        ), "client_ca migration entry missing in COLUMN_MIGRATIONS"

    def test_client_depth_in_column_migrations(self):
        from app.core.migrate import COLUMN_MIGRATIONS
        assert any(
            table == "ps_ssl_certificate" and col == "client_depth"
            for table, col, _ in COLUMN_MIGRATIONS
        ), "client_depth migration entry missing in COLUMN_MIGRATIONS"

    def test_skip_mtls_uri_regex_in_column_migrations(self):
        from app.core.migrate import COLUMN_MIGRATIONS
        assert any(
            table == "ps_ssl_certificate" and col == "skip_mtls_uri_regex"
            for table, col, _ in COLUMN_MIGRATIONS
        ), "skip_mtls_uri_regex migration entry missing in COLUMN_MIGRATIONS"


class TestSslMtlsSchemaFields:
    """Tests for mTLS fields in Pydantic schemas (Tasks 2.1-2.4)."""

    def test_base_schema_has_mtls_fields(self):
        from app.schemas.ssl import SslCertificateBase

        fields = SslCertificateBase.model_fields
        assert "client_ca" in fields
        assert "client_depth" in fields
        assert "skip_mtls_uri_regex" in fields

    def test_base_schema_mtls_fields_optional(self):
        from app.schemas.ssl import SslCertificateBase

        base = SslCertificateBase(cluster_id=1)
        assert base.client_ca is None
        assert base.client_depth is None
        assert base.skip_mtls_uri_regex is None

    def test_base_schema_mtls_fields_settable(self):
        from app.schemas.ssl import SslCertificateBase

        base = SslCertificateBase(
            cluster_id=1,
            client_ca="ca-pem",
            client_depth=2,
            skip_mtls_uri_regex="/health",
        )
        assert base.client_ca == "ca-pem"
        assert base.client_depth == 2
        assert base.skip_mtls_uri_regex == "/health"

    def test_create_schema_inherits_mtls_fields(self):
        from app.schemas.ssl import SslCertificateCreate

        fields = SslCertificateCreate.model_fields
        assert "client_ca" in fields
        assert "client_depth" in fields
        assert "skip_mtls_uri_regex" in fields

    def test_update_schema_has_mtls_fields(self):
        from app.schemas.ssl import SslCertificateUpdate

        fields = SslCertificateUpdate.model_fields
        assert "client_ca" in fields
        assert "client_depth" in fields
        assert "skip_mtls_uri_regex" in fields

    def test_response_schema_has_mtls_fields(self):
        from app.schemas.ssl import SslCertificateResponse

        fields = SslCertificateResponse.model_fields
        assert "client_ca" in fields
        assert "client_depth" in fields
        assert "skip_mtls_uri_regex" in fields

    def test_generate_request_has_mtls_fields(self):
        from app.schemas.ssl import SslCertificateGenerateRequest

        fields = SslCertificateGenerateRequest.model_fields
        assert "client_ca" in fields
        assert "client_depth" in fields
        assert "skip_mtls_uri_regex" in fields

    def test_generate_request_mtls_fields_optional(self):
        from app.schemas.ssl import SslCertificateGenerateRequest

        req = SslCertificateGenerateRequest(name="test", common_name="test.com")
        assert req.client_ca is None
        assert req.client_depth is None
        assert req.skip_mtls_uri_regex is None

    def test_generate_request_mtls_fields_settable(self):
        from app.schemas.ssl import SslCertificateGenerateRequest

        req = SslCertificateGenerateRequest(
            name="test", common_name="test.com",
            client_ca="ca-pem",
            client_depth=3,
            skip_mtls_uri_regex="/health,/metrics",
        )
        assert req.client_ca == "ca-pem"
        assert req.client_depth == 3
        assert req.skip_mtls_uri_regex == "/health,/metrics"


class TestSslMtlsUpdateEndpoint:
    """更新端点 mTLS 清理/写入行为 — 直调 update_ssl_certificate（AsyncSession + 真实 ORM 记录）。

    契约（cluster_ssl.py::update_ssl_certificate）：
    - 更新载荷含 gm=False → sign_cert/sign_key/client_ca/client_depth/skip_mtls_uri_regex 全部清空；
    - 更新载荷不含 gm → mTLS 字段保持不变；
    - 更新载荷含 mTLS 字段 → 写入库。
    """

    async def _seed_gm_mtls_cert(self, test_db):
        cert = SslCertificate(
            cluster_id=1, name="gm-mtls", sni="mtls.local",
            cert="crt", private_key="key",
            gm=True, sign_cert="sc", sign_key="sk",
            client_ca="ca-pem", client_depth=2, skip_mtls_uri_regex="/health",
        )
        test_db.add(cert)
        await test_db.commit()
        await test_db.refresh(cert)
        return cert

    async def test_update_gm_false_clears_sign_and_mtls_fields(self, test_db):
        cert = await self._seed_gm_mtls_cert(test_db)

        resp = await update_ssl_certificate(
            cluster_id=1, cert_id=cert.id,
            data=SslCertificateUpdate(gm=False), db=test_db,
        )

        assert resp.gm is False
        assert resp.sign_cert is None
        assert resp.sign_key is None
        assert resp.client_ca is None
        assert resp.client_depth is None
        assert resp.skip_mtls_uri_regex is None
        reloaded = await test_db.get(SslCertificate, cert.id)
        assert reloaded.gm is False
        assert reloaded.sign_cert is None
        assert reloaded.sign_key is None
        assert reloaded.client_ca is None
        assert reloaded.client_depth is None
        assert reloaded.skip_mtls_uri_regex is None

    async def test_update_without_gm_change_persists_mtls(self, test_db):
        cert = await self._seed_gm_mtls_cert(test_db)
        cert.client_depth = 1
        cert.skip_mtls_uri_regex = "/status"
        await test_db.commit()

        await update_ssl_certificate(
            cluster_id=1, cert_id=cert.id,
            data=SslCertificateUpdate(description="updated"), db=test_db,
        )

        reloaded = await test_db.get(SslCertificate, cert.id)
        assert reloaded.gm is True
        assert reloaded.client_ca == "ca-pem"
        assert reloaded.client_depth == 1
        assert reloaded.skip_mtls_uri_regex == "/status"

    async def test_update_payload_with_mtls_fields_writes_them(self, test_db):
        cert = await self._seed_gm_mtls_cert(test_db)

        resp = await update_ssl_certificate(
            cluster_id=1, cert_id=cert.id,
            data=SslCertificateUpdate(
                client_ca="new-ca", client_depth=3, skip_mtls_uri_regex="/metrics",
            ),
            db=test_db,
        )

        assert resp.client_ca == "new-ca"
        assert resp.client_depth == 3
        assert resp.skip_mtls_uri_regex == "/metrics"
        reloaded = await test_db.get(SslCertificate, cert.id)
        assert reloaded.client_ca == "new-ca"
        assert reloaded.client_depth == 3
        assert reloaded.skip_mtls_uri_regex == "/metrics"


class TestSslCertificateMtlsFields:
    """Tests for mTLS fields on SslCertificate model (Task 1.1)."""

    async def test_model_has_client_ca_field(self, test_db):
        """SslCertificate should have client_ca field (Text, nullable)."""
        cert = SslCertificate(
            cluster_id=1,
            name="mtls-cert",
            sni="mtls.local",
            cert="crt",
            private_key="key",
            client_ca="-----BEGIN CERTIFICATE-----\nMTLS_CA\n-----END CERTIFICATE-----",
        )
        test_db.add(cert)
        await test_db.commit()
        await test_db.refresh(cert)
        assert hasattr(cert, "client_ca")
        assert cert.client_ca is not None
        assert "MTLS_CA" in cert.client_ca

    async def test_model_client_ca_nullable(self, test_db):
        """client_ca should default to None."""
        cert = SslCertificate(
            cluster_id=1,
            name="no-mtls-cert",
            sni="test.local",
            cert="crt",
            private_key="key",
        )
        test_db.add(cert)
        await test_db.commit()
        await test_db.refresh(cert)
        assert cert.client_ca is None

    async def test_model_has_client_depth_field(self, test_db):
        """SslCertificate should have client_depth field (Integer, nullable, default=1)."""
        cert = SslCertificate(
            cluster_id=1,
            name="mtls-depth",
            sni="depth.local",
            cert="crt",
            private_key="key",
            client_depth=2,
        )
        test_db.add(cert)
        await test_db.commit()
        await test_db.refresh(cert)
        assert hasattr(cert, "client_depth")
        assert cert.client_depth == 2

    async def test_model_has_skip_mtls_uri_regex_field(self, test_db):
        """SslCertificate should have skip_mtls_uri_regex field (Text, nullable)."""
        cert = SslCertificate(
            cluster_id=1,
            name="mtls-skip",
            sni="skip.local",
            cert="crt",
            private_key="key",
            skip_mtls_uri_regex="/health",
        )
        test_db.add(cert)
        await test_db.commit()
        await test_db.refresh(cert)
        assert hasattr(cert, "skip_mtls_uri_regex")
        assert cert.skip_mtls_uri_regex == "/health"


class TestSslEdgeImportMtls:
    """Tests for mTLS field parsing in Edge import (Task 4.2)."""

    def _make_import_service(self):
        from app.services.edge_import_service import EdgeImportService
        svc = EdgeImportService.__new__(EdgeImportService)
        svc.cluster_id = 1
        return svc

    def test_import_parses_client_object(self):
        svc = self._make_import_service()
        edge_data = {
            "id": "uuid-123",
            "name": "mtls-cert",
            "cert": "cert-pem",
            "key": "key-pem",
            "type": "server",
            "gm": True,
            "certs": ["sign-pem"],
            "keys": ["sign-key"],
            "client": {
                "ca": "mtls-ca-pem",
                "depth": 2,
                "skip_mtls_uri_regex": "/health",
            },
        }
        result = svc.convert_ssl_certificate(edge_data)
        sc = result["ssl_certificate"]
        assert sc["client_ca"] == "mtls-ca-pem"
        assert sc["client_depth"] == 2
        assert sc["skip_mtls_uri_regex"] == "/health"

    def test_import_no_client_defaults_none(self):
        svc = self._make_import_service()
        edge_data = {
            "id": "uuid-456",
            "name": "normal-cert",
            "cert": "cert-pem",
            "key": "key-pem",
            "type": "server",
        }
        result = svc.convert_ssl_certificate(edge_data)
        sc = result["ssl_certificate"]
        assert sc["client_ca"] is None
        assert sc["client_depth"] is None
        assert sc["skip_mtls_uri_regex"] is None

    def test_import_partial_client(self):
        svc = self._make_import_service()
        edge_data = {
            "id": "uuid-789",
            "name": "partial-mtls",
            "cert": "cert-pem",
            "key": "key-pem",
            "type": "server",
            "client": {"ca": "just-ca"},
        }
        result = svc.convert_ssl_certificate(edge_data)
        sc = result["ssl_certificate"]
        assert sc["client_ca"] == "just-ca"
        assert sc["client_depth"] is None
        assert sc["skip_mtls_uri_regex"] is None


class TestSslPublishPayload:
    """发布端点 config_data 组装 — 直调 publish_ssl_certificate（真实发布编排 + mock Edge 网络）。

    替换原测试文件内手写的 _publish_data 副本：真实契约（B1-NEW-07）为
    DB sni 逗号分隔字符串 → 单值映射 `sni`（字符串）、多值映射 `snis`（数组）、
    IP 原样保留、空 sni 两键均不出现；gm 证书带 certs/keys/gm 与可选 client 对象。
    Edge 调用在 edge_sync.publish_to_nodes 处 mock（捕获端点真实组装的 edge_data），
    版本快照/节点选择等编排保持真实（test_db 隔离库）。
    """

    async def _seed_active_node(self, test_db, cluster_id=1):
        node = Node(cluster_id=cluster_id, ip="10.1.1.1", service_port=80,
                    management_port=9180, edge_path="/edge", status=1)
        test_db.add(node)
        await test_db.commit()
        await test_db.refresh(node)
        return node

    async def _seed_cert(self, test_db, **kwargs):
        params = dict(
            cluster_id=1, name="pub-cert", sni="pub.local",
            cert="crt", private_key="key",
        )
        params.update(kwargs)
        cert = SslCertificate(**params)
        test_db.add(cert)
        await test_db.commit()
        await test_db.refresh(cert)
        return cert

    async def _publish_capture_edge_data(self, test_db, cert):
        captured: dict = {}

        async def fake_publish_to_nodes(cluster_id, active_nodes, edge_data, **kwargs):
            captured["edge_data"] = edge_data
            captured["active_nodes"] = active_nodes
            return [{"node": "10.1.1.1:9180", "scope": "edge", "status": "success"}], 1, 0

        with patch.object(edge_sync, "publish_to_nodes", new=fake_publish_to_nodes):
            resp = await publish_ssl_certificate(
                cluster_id=1, cert_id=cert.id, req=None, db=test_db,
            )
        assert resp["status"] == "ok", f"发布编排未走通: {resp}"
        return captured["edge_data"]

    # --- sni/snis 映射契约（B1-NEW-07） ---

    async def test_single_sni_maps_to_sni_string(self, test_db):
        await self._seed_active_node(test_db)
        cert = await self._seed_cert(test_db, sni="pub.local")

        edge_data = await self._publish_capture_edge_data(test_db, cert)

        assert edge_data["sni"] == "pub.local"
        assert "snis" not in edge_data

    async def test_multi_sni_maps_to_snis_array(self, test_db):
        await self._seed_active_node(test_db)
        cert = await self._seed_cert(test_db, sni="a.com,b.com")

        edge_data = await self._publish_capture_edge_data(test_db, cert)

        assert edge_data["snis"] == ["a.com", "b.com"]
        assert "sni" not in edge_data

    async def test_single_ip_sni_preserved_as_string(self, test_db):
        await self._seed_active_node(test_db)
        cert = await self._seed_cert(test_db, sni="192.168.1.5")

        edge_data = await self._publish_capture_edge_data(test_db, cert)

        assert edge_data["sni"] == "192.168.1.5"
        assert "snis" not in edge_data

    async def test_empty_sni_omits_both_keys(self, test_db):
        await self._seed_active_node(test_db)
        cert = await self._seed_cert(test_db, sni="")

        edge_data = await self._publish_capture_edge_data(test_db, cert)

        assert "sni" not in edge_data
        assert "snis" not in edge_data

    # --- gm / mTLS client 字段契约（原副本块断言的真实现版本） ---

    async def test_gm_publish_includes_sign_fields(self, test_db):
        await self._seed_active_node(test_db)
        cert = await self._seed_cert(
            test_db, gm=True, sign_cert="sign-pem", sign_key="sign-key-pem",
        )

        edge_data = await self._publish_capture_edge_data(test_db, cert)

        assert edge_data["cert"] == "crt"
        assert edge_data["key"] == "key"
        assert edge_data["certs"] == ["sign-pem"]
        assert edge_data["keys"] == ["sign-key-pem"]
        assert edge_data["gm"] is True

    async def test_gm_mtls_publish_includes_client_object(self, test_db):
        await self._seed_active_node(test_db)
        cert = await self._seed_cert(
            test_db, gm=True, sign_cert="sign-pem", sign_key="sign-key-pem",
            client_ca="mtls-ca-pem", client_depth=2, skip_mtls_uri_regex="/health",
        )

        edge_data = await self._publish_capture_edge_data(test_db, cert)

        assert edge_data["client"]["ca"] == "mtls-ca-pem"
        assert edge_data["client"]["depth"] == 2
        assert edge_data["client"]["skip_mtls_uri_regex"] == "/health"

    async def test_gm_without_client_ca_has_no_client_object(self, test_db):
        await self._seed_active_node(test_db)
        cert = await self._seed_cert(
            test_db, gm=True, sign_cert="sign-pem", sign_key="sign-key-pem",
        )

        edge_data = await self._publish_capture_edge_data(test_db, cert)

        assert "client" not in edge_data

    async def test_non_gm_with_client_ca_has_no_client_object(self, test_db):
        """非国密证书即使配了 client_ca 也不发布 client 对象（端点只在 gm 分支组装）。"""
        await self._seed_active_node(test_db)
        cert = await self._seed_cert(
            test_db, gm=False, client_ca="mtls-ca", client_depth=1,
            skip_mtls_uri_regex="/status",
        )

        edge_data = await self._publish_capture_edge_data(test_db, cert)

        assert "client" not in edge_data
        assert "gm" not in edge_data
        assert "certs" not in edge_data
        assert "keys" not in edge_data
