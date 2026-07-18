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
    """Tests for SslCertificateGenerateRequest schema."""

    def test_required_fields(self):
        from app.schemas.ssl import SslCertificateGenerateRequest

        req = SslCertificateGenerateRequest(
            name="test-cert",
            common_name="test.com",
            mode="local",
        )
        assert req.name == "test-cert"
        assert req.common_name == "test.com"
        assert req.mode == "local"
        assert req.validity_days == 365  # default
        assert req.dual_cert is True  # default

    def test_remote_requires_node_id(self):
        from app.schemas.ssl import SslCertificateGenerateRequest
        from pydantic import ValidationError

        with pytest.raises(ValidationError):
            SslCertificateGenerateRequest(
                name="test",
                common_name="test.com",
                mode="remote",
                # missing node_id
            )

    def test_local_does_not_require_node_id(self):
        from app.schemas.ssl import SslCertificateGenerateRequest

        req = SslCertificateGenerateRequest(
            name="test",
            common_name="test.com",
            mode="local",
        )
        assert req.node_id is None

    def test_invalid_mode_rejected(self):
        from app.schemas.ssl import SslCertificateGenerateRequest
        from pydantic import ValidationError

        with pytest.raises(ValidationError):
            SslCertificateGenerateRequest(
                name="test",
                common_name="test.com",
                mode="invalid",
            )

    def test_sans_optional(self):
        from app.schemas.ssl import SslCertificateGenerateRequest

        req = SslCertificateGenerateRequest(
            name="test",
            common_name="test.com",
            mode="local",
            dns_sans=["a.com", "b.com"],
            ip_sans=["10.0.0.1"],
        )
        assert req.dns_sans == ["a.com", "b.com"]
        assert req.ip_sans == ["10.0.0.1"]


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
