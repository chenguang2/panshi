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

    def test_ssl_router_has_routes(self):
        from app.api.v1.cluster_ssl import router

        assert len(router.routes) > 0

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


class TestSslMtlsUpdateClear:
    async def test_update_handler_clears_mtls_on_gm_false(self, test_db):
        from app.schemas.ssl import SslCertificateUpdate

        cert = SslCertificate(
            cluster_id=1, name="gm-mtls", sni="mtls.local",
            cert="crt", private_key="key",
            gm=True, sign_cert="sc", sign_key="sk",
            client_ca="ca-pem", client_depth=2, skip_mtls_uri_regex="/health",
        )
        test_db.add(cert)
        await test_db.commit()
        await test_db.refresh(cert)

        update_data = SslCertificateUpdate(gm=False).model_dump(exclude_unset=True)
        for k, v in update_data.items():
            setattr(cert, k, v)
        if "gm" in update_data and not update_data["gm"]:
            cert.sign_cert = None
            cert.sign_key = None
            cert.client_ca = None
            cert.client_depth = None
            cert.skip_mtls_uri_regex = None
        await test_db.commit()
        await test_db.refresh(cert)

        assert cert.client_ca is None
        assert cert.client_depth is None
        assert cert.skip_mtls_uri_regex is None

    async def test_mtls_persists_when_gm_unchanged(self, test_db):
        from app.schemas.ssl import SslCertificateUpdate

        cert = SslCertificate(
            cluster_id=1, name="keep-mtls", sni="keep.local",
            cert="crt", private_key="key",
            gm=True, sign_cert="sc", sign_key="sk",
            client_ca="ca-pem", client_depth=1, skip_mtls_uri_regex="/status",
        )
        test_db.add(cert)
        await test_db.commit()
        await test_db.refresh(cert)

        update_data = SslCertificateUpdate(description="updated").model_dump(exclude_unset=True)
        for k, v in update_data.items():
            setattr(cert, k, v)
        if "gm" in update_data and not update_data["gm"]:
            cert.client_ca = None
        await test_db.commit()
        await test_db.refresh(cert)

        assert cert.client_ca == "ca-pem"
        assert cert.client_depth == 1
        assert cert.skip_mtls_uri_regex == "/status"


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


class TestSslDiffMtlsComparison:
    """Tests for mTLS field comparison in config diff (Task 5.1)."""

    @staticmethod
    def _compare_mtls_field(db_cert, edge_data, field_name, edge_key):
        db_v = getattr(db_cert, field_name, None) or ""
        edge_client = edge_data.get("client", {}) if isinstance(edge_data, dict) else {}
        edge_v = edge_client.get(edge_key, "") or ""
        equal = str(db_v) == str(edge_v)
        return {"name": field_name, "db": str(db_v), "edge": str(edge_v), "status": "equal" if equal else "diff"}

    def _make_fake_cert(self, **kwargs):
        class FakeCert:
            client_ca = ""
            client_depth = None
            skip_mtls_uri_regex = None
        for k, v in kwargs.items():
            setattr(FakeCert, k, v)
        return FakeCert

    def test_mtls_client_ca_equal(self):
        cert = self._make_fake_cert(client_ca="ca-pem")
        edge = {"client": {"ca": "ca-pem", "depth": 2, "skip_mtls_uri_regex": "/health"}}
        result = self._compare_mtls_field(cert, edge, "client_ca", "ca")
        assert result["status"] == "equal"

    def test_mtls_client_ca_diff(self):
        cert = self._make_fake_cert(client_ca="ca-pem-a")
        edge = {"client": {"ca": "ca-pem-b", "depth": 2, "skip_mtls_uri_regex": "/health"}}
        result = self._compare_mtls_field(cert, edge, "client_ca", "ca")
        assert result["status"] == "diff"

    def test_mtls_client_depth_equal(self):
        cert = self._make_fake_cert(client_depth=2)
        edge = {"client": {"ca": "ca-pem", "depth": 2, "skip_mtls_uri_regex": "/health"}}
        result = self._compare_mtls_field(cert, edge, "client_depth", "depth")
        assert result["status"] == "equal"

    def test_mtls_skip_uri_regex_equal(self):
        cert = self._make_fake_cert(skip_mtls_uri_regex="/health")
        edge = {"client": {"ca": "ca-pem", "depth": 2, "skip_mtls_uri_regex": "/health"}}
        result = self._compare_mtls_field(cert, edge, "skip_mtls_uri_regex", "skip_mtls_uri_regex")
        assert result["status"] == "equal"

    def test_mtls_no_client_on_edge(self):
        cert = self._make_fake_cert(client_ca="ca-pem")
        edge = {}
        result = self._compare_mtls_field(cert, edge, "client_ca", "ca")
        assert result["status"] == "diff"
        assert result["db"] == "ca-pem"
        assert result["edge"] == ""


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
            if cert.client_ca:
                client = {"ca": cert.client_ca}
                if cert.client_depth is not None:
                    client["depth"] = cert.client_depth
                if cert.skip_mtls_uri_regex:
                    client["skip_mtls_uri_regex"] = cert.skip_mtls_uri_regex
                config["client"] = client
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
            client_ca = ""
            client_depth = None
            skip_mtls_uri_regex = None

        data = self._publish_data(FakeCert())
        assert data["cert"] == "enc-pem"
        assert data["key"] == "enc-key-pem"
        assert data["certs"] == ["sign-pem"]
        assert data["keys"] == ["sign-key-pem"]
        assert data["gm"] is True

    def test_gm_mtls_publish_includes_client_object(self):
        """When gm=true and client_ca is set, publish data should include client object."""
        class FakeCert:
            cert = "enc-pem"
            private_key = "enc-key-pem"
            cert_type = "server"
            sni = "mtls.local"
            gm = True
            sign_cert = "sign-pem"
            sign_key = "sign-key-pem"
            client_ca = "mtls-ca-pem"
            client_depth = 2
            skip_mtls_uri_regex = "/health"

        data = self._publish_data(FakeCert())
        assert data["client"]["ca"] == "mtls-ca-pem"
        assert data["client"]["depth"] == 2
        assert data["client"]["skip_mtls_uri_regex"] == "/health"

    def test_gm_mtls_no_client_object_when_ca_empty(self):
        """When gm=true but client_ca is empty, no client object in publish data."""
        class FakeCert:
            cert = "enc-pem"
            private_key = "enc-key-pem"
            cert_type = "server"
            sni = "gm.local"
            gm = True
            sign_cert = "sign-pem"
            sign_key = "sign-key-pem"
            client_ca = ""
            client_depth = None
            skip_mtls_uri_regex = None

        data = self._publish_data(FakeCert())
        assert "client" not in data

    def test_non_gm_mtls_no_client_object(self):
        """When gm=false, no client object even if client_ca is set."""
        class FakeCert:
            cert = "crt"
            private_key = "key"
            cert_type = "server"
            sni = "test.local"
            gm = False
            sign_cert = ""
            sign_key = ""
            client_ca = "mtls-ca"
            client_depth = 1
            skip_mtls_uri_regex = "/status"

        data = self._publish_data(FakeCert())
        assert "client" not in data

    def test_normal_publish_no_gm_fields(self):
        class FakeCert:
            cert = "crt"
            private_key = "key"
            cert_type = "server"
            sni = "test.local"
            gm = False
            sign_cert = ""
            sign_key = ""
            client_ca = ""
            client_depth = None
            skip_mtls_uri_regex = None

        data = self._publish_data(FakeCert())
        assert "certs" not in data
        assert "keys" not in data
        assert "gm" not in data
