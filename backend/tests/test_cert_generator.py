"""Tests for cert_generator service.

TDD: Write failing test -> verify fail -> implement -> verify pass.
"""
import pytest
import subprocess
from pathlib import Path


# ===== 2.1 Module structure =====

class TestCertGeneratorModule:
    """Module-level tests."""

    def test_module_imports(self):
        from app.services import cert_generator
        assert cert_generator is not None

    def test_module_has_detect_openssl(self):
        from app.services.cert_generator import detect_openssl
        assert callable(detect_openssl)


# ===== 2.2 detect_openssl() =====

class TestDetectOpenssl:
    """Tests for openssl detection."""

    def test_returns_dict_with_keys(self):
        from app.services.cert_generator import detect_openssl
        result = detect_openssl()
        assert isinstance(result, dict)
        assert "path" in result
        assert "version" in result
        assert "sm2_supported" in result
        assert "flavor" in result  # "tongsuo" | "standard"

    def test_finds_some_openssl(self):
        from app.services.cert_generator import detect_openssl
        result = detect_openssl()
        # The system should have at least one openssl available
        assert result["path"] is not None, "No openssl found in PATH or bundled"


# ===== 2.3 generate_openssl_cnf() =====

class TestGenerateOpensslCnf:
    """Tests for openssl.cnf generation."""

    def test_returns_string(self):
        from app.services.cert_generator import generate_openssl_cnf
        cnf = generate_openssl_cnf(common_name="test.panshi.com")
        assert isinstance(cnf, str)
        assert len(cnf) > 0

    def test_contains_common_name(self):
        from app.services.cert_generator import generate_openssl_cnf
        cnf = generate_openssl_cnf(common_name="my.test.com")
        assert "my.test.com" in cnf

    def test_has_required_sections(self):
        from app.services.cert_generator import generate_openssl_cnf
        cnf = generate_openssl_cnf(common_name="test.com")
        assert "[ req ]" in cnf
        assert "distinguished_name" in cnf
        assert "default_md = sm3" in cnf


# ===== 2.4 generate_sm2_keypair() =====

class TestGenerateSm2Keypair:
    """Tests for SM2 key pair generation."""

    def test_returns_pem_private_key(self):
        from app.services.cert_generator import generate_sm2_keypair, detect_openssl
        openssl = detect_openssl()
        if not openssl["sm2_supported"]:
            pytest.skip("No SM2-capable openssl available")

        pem = generate_sm2_keypair(openssl["path"])
        assert isinstance(pem, str)
        assert "-----BEGIN PRIVATE KEY-----" in pem
        assert "-----END PRIVATE KEY-----" in pem

# ===== 2.5 generate_csr() =====

class TestGenerateCsr:
    """Tests for CSR generation."""

    def test_returns_pem(self):
        from app.services.cert_generator import (
            generate_sm2_keypair, generate_csr, detect_openssl,
        )
        openssl = detect_openssl()
        if not openssl["sm2_supported"]:
            pytest.skip("No SM2-capable openssl available")

        key_pem = generate_sm2_keypair(openssl["path"])
        csr = generate_csr(
            openssl_path=openssl["path"],
            key_pem=key_pem,
            common_name="test.panshi.com",
            dns_sans=["test.panshi.com"],
            ip_sans=[],
            flavor=openssl["flavor"],
        )
        assert isinstance(csr, str)
        assert "-----BEGIN CERTIFICATE REQUEST-----" in csr
        assert "-----END CERTIFICATE REQUEST-----" in csr

    def test_csr_has_correct_cn(self):
        from app.services.cert_generator import (
            generate_sm2_keypair, generate_csr, detect_openssl,
            _run_openssl,
        )
        openssl = detect_openssl()
        if not openssl["sm2_supported"]:
            pytest.skip("No SM2-capable openssl available")

        key_pem = generate_sm2_keypair(openssl["path"])
        csr = generate_csr(
            openssl_path=openssl["path"],
            key_pem=key_pem,
            common_name="mycert.test.com",
            dns_sans=["mycert.test.com"],
            ip_sans=[],
            flavor=openssl["flavor"],
        )
        # Write CSR to temp file and verify with openssl
        import tempfile
        from pathlib import Path
        with tempfile.TemporaryDirectory() as d:
            csr_file = Path(d) / "test.csr"
            csr_file.write_text(csr)
            result = _run_openssl(
                ["req", "-in", str(csr_file), "-noout", "-subject"],
                openssl["path"],
            )
            assert "CN = mycert.test.com" in result.stdout or "CN=mycert.test.com" in result.stdout


# ===== 2.6 self_sign_certificate() =====

class TestSelfSignCertificate:
    """Tests for self-signed certificate generation."""

    def test_returns_pem_cert(self):
        from app.services.cert_generator import (
            generate_sm2_keypair, generate_csr,
            self_sign_certificate, detect_openssl,
        )
        openssl = detect_openssl()
        if not openssl["sm2_supported"]:
            pytest.skip("No SM2-capable openssl available")

        key_pem = generate_sm2_keypair(openssl["path"])
        csr = generate_csr(
            openssl_path=openssl["path"],
            key_pem=key_pem,
            common_name="test.panshi.com",
            dns_sans=["test.panshi.com"],
            ip_sans=[],
            flavor=openssl["flavor"],
        )
        cert = self_sign_certificate(
            openssl_path=openssl["path"],
            csr_pem=csr,
            key_pem=key_pem,
            validity_days=365,
            flavor=openssl["flavor"],
        )
        assert isinstance(cert, str)
        assert "-----BEGIN CERTIFICATE-----" in cert
        assert "-----END CERTIFICATE-----" in cert


# ===== 2.7 generate_dual_certificates() =====

class TestGenerateDualCertificates:
    """Tests for dual certificate generation (enc + sign)."""

    def test_returns_both_certs(self):
        from app.services.cert_generator import (
            generate_dual_certificates, detect_openssl,
        )
        openssl = detect_openssl()
        if not openssl["sm2_supported"]:
            pytest.skip("No SM2-capable openssl available")

        result = generate_dual_certificates(
            openssl_path=openssl["path"],
            common_name="dual.test.com",
            dns_sans=["dual.test.com"],
            ip_sans=[],
            validity_days=365,
            flavor=openssl["flavor"],
        )
        assert isinstance(result, dict)
        # Encryption cert
        assert "cert" in result
        assert "-----BEGIN CERTIFICATE-----" in result["cert"]
        assert "key" in result
        assert "-----BEGIN PRIVATE KEY-----" in result["key"]
        # Signing cert
        assert "sign_cert" in result
        assert "-----BEGIN CERTIFICATE-----" in result["sign_cert"]
        assert "sign_key" in result
        assert "-----BEGIN PRIVATE KEY-----" in result["sign_key"]
        # Certs are different (different key pairs)
        assert result["key"] != result["sign_key"]


# ===== 2.10 Provider Interface =====

class TestLocalProvider:
    """Tests for LocalProvider."""

    def test_provider_has_generate_dual(self):
        from app.services.cert_generator import LocalProvider
        provider = LocalProvider()
        assert hasattr(provider, "generate_dual_certificates")
        assert callable(provider.generate_dual_certificates)

    def test_provider_detects_openssl(self):
        from app.services.cert_generator import LocalProvider
        provider = LocalProvider()
        assert provider.openssl_path is not None
        assert provider.flavor in ("tongsuo", "standard")

    def test_provider_generates_dual_certs(self):
        from app.services.cert_generator import LocalProvider
        provider = LocalProvider()
        if not provider.sm2_supported:
            pytest.skip("No SM2-capable openssl available")

        result = provider.generate_dual_certificates(
            common_name="provider.test.com",
            dns_sans=["provider.test.com"],
            ip_sans=[],
            validity_days=365,
        )
        assert "cert" in result
        assert "key" in result
        assert "sign_cert" in result
        assert "sign_key" in result
