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
        assert "available" in result  # True if any openssl binary found

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
        assert "default_md" in cnf

    def test_default_hash_is_sm3(self):
        from app.services.cert_generator import generate_openssl_cnf
        cnf = generate_openssl_cnf(common_name="test.com")
        assert "default_md = sm3" in cnf

    def test_hash_alg_param_sm3(self):
        from app.services.cert_generator import generate_openssl_cnf
        cnf = generate_openssl_cnf(common_name="test.com", hash_alg="sm3")
        assert "default_md = sm3" in cnf

    def test_hash_alg_param_sha256(self):
        from app.services.cert_generator import generate_openssl_cnf
        cnf = generate_openssl_cnf(common_name="test.com", hash_alg="sha256")
        assert "default_md = sha256" in cnf


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


# ===== generate_csr with hash_alg =====

class TestGenerateCsrWithHashAlg:
    def test_csr_with_rsa_sha256(self):
        from app.services.cert_generator import (
            generate_rsa_keypair, generate_csr, detect_openssl,
        )
        openssl = detect_openssl()
        if not openssl["path"]:
            pytest.skip("No openssl available")
        key = generate_rsa_keypair(openssl["path"])
        csr = generate_csr(
            openssl_path=openssl["path"],
            key_pem=key,
            common_name="rsa.test.com",
            dns_sans=[], ip_sans=[],
            flavor=openssl["flavor"],
            hash_alg="sha256",
        )
        assert "-----BEGIN CERTIFICATE REQUEST-----" in csr

    def test_csr_with_sm2_default_sm3(self):
        from app.services.cert_generator import (
            generate_sm2_keypair, generate_csr, detect_openssl,
        )
        openssl = detect_openssl()
        if not openssl["sm2_supported"]:
            pytest.skip("No SM2-capable openssl available")
        key = generate_sm2_keypair(openssl["path"])
        csr = generate_csr(
            openssl_path=openssl["path"],
            key_pem=key,
            common_name="sm2.test.com",
            dns_sans=[], ip_sans=[],
            flavor=openssl["flavor"],
        )
        assert "-----BEGIN CERTIFICATE REQUEST-----" in csr


# ===== self_sign_certificate with hash_alg =====

class TestSelfSignWithHashAlg:
    def test_self_sign_rsa_sha256(self):
        from app.services.cert_generator import (
            generate_rsa_keypair, generate_csr,
            self_sign_certificate, detect_cert_algorithm, detect_openssl,
        )
        openssl = detect_openssl()
        if not openssl["path"]:
            pytest.skip("No openssl available")
        key = generate_rsa_keypair(openssl["path"])
        csr = generate_csr(
            openssl["path"], key, "rsa.test.com", [], [],
            openssl["flavor"], hash_alg="sha256",
        )
        cert = self_sign_certificate(
            openssl["path"], csr, key, 365,
            openssl["flavor"], hash_alg="sha256",
        )
        assert "-----BEGIN CERTIFICATE-----" in cert
        algo = detect_cert_algorithm(cert)
        assert algo == "rsa"


# ===== generate_standard_certificate() =====

class TestGenerateStandardCertificate:
    def test_function_exists(self):
        from app.services.cert_generator import generate_standard_certificate
        assert callable(generate_standard_certificate)

    def test_rsa_returns_single_cert(self):
        from app.services.cert_generator import (
            generate_standard_certificate, detect_openssl,
        )
        openssl = detect_openssl()
        if not openssl["path"]:
            pytest.skip("No openssl available")
        result = generate_standard_certificate(
            openssl_path=openssl["path"],
            common_name="std-rsa.test.com",
            dns_sans=[], ip_sans=[],
            validity_days=365,
            flavor=openssl["flavor"],
            algorithm="rsa",
        )
        assert isinstance(result, dict)
        assert "cert" in result
        assert "key" in result
        assert "-----BEGIN CERTIFICATE-----" in result["cert"]
        assert "PRIVATE KEY" in result["key"]
        assert result.get("sign_cert") is None
        assert result.get("sign_key") is None

    def test_ecc_returns_single_cert(self):
        from app.services.cert_generator import (
            generate_standard_certificate, detect_openssl,
        )
        openssl = detect_openssl()
        if not openssl["path"]:
            pytest.skip("No openssl available")
        result = generate_standard_certificate(
            openssl_path=openssl["path"],
            common_name="std-ecc.test.com",
            dns_sans=[], ip_sans=[],
            validity_days=365,
            flavor=openssl["flavor"],
            algorithm="ecc",
        )
        assert "cert" in result
        assert "key" in result


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


# ===== detect_cert_algorithm() =====

class TestDetectCertAlgorithm:
    """Tests for certificate algorithm detection from PEM."""

    def _generate_rsa_cert(self, openssl_path: str) -> str:
        from app.services.cert_generator import _run_openssl
        import tempfile, pathlib
        with tempfile.TemporaryDirectory() as d:
            tmp = pathlib.Path(d)
            key = tmp / "key.pem"
            cert = tmp / "cert.pem"
            _run_openssl(["genrsa", "-out", str(key), "2048"], openssl_path)
            _run_openssl([
                "req", "-new", "-x509",
                "-key", str(key), "-out", str(cert),
                "-days", "365",
                "-subj", "/CN=test.com",
                "-sha256",
            ], openssl_path)
            return cert.read_text()

    def _generate_ecc_cert(self, openssl_path: str) -> str:
        from app.services.cert_generator import _run_openssl
        import tempfile, pathlib
        with tempfile.TemporaryDirectory() as d:
            tmp = pathlib.Path(d)
            key = tmp / "key.pem"
            cert = tmp / "cert.pem"
            _run_openssl(["ecparam", "-genkey", "-name", "prime256v1", "-out", str(key)], openssl_path)
            _run_openssl([
                "req", "-new", "-x509",
                "-key", str(key), "-out", str(cert),
                "-days", "365",
                "-subj", "/CN=test.com",
                "-sha256",
            ], openssl_path)
            return cert.read_text()

    def _get_openssl(self):
        from app.services.cert_generator import detect_openssl
        return detect_openssl()

    def test_function_exists(self):
        from app.services.cert_generator import detect_cert_algorithm
        assert callable(detect_cert_algorithm)

    def test_detects_rsa(self):
        from app.services.cert_generator import detect_cert_algorithm
        info = self._get_openssl()
        if not info["path"]:
            pytest.skip("No openssl available")
        cert_pem = self._generate_rsa_cert(info["path"])
        algo = detect_cert_algorithm(cert_pem)
        assert algo == "rsa", f"Expected rsa, got {algo}"

    def test_detects_ecc(self):
        from app.services.cert_generator import detect_cert_algorithm
        info = self._get_openssl()
        if not info["path"]:
            pytest.skip("No openssl available")
        cert_pem = self._generate_ecc_cert(info["path"])
        algo = detect_cert_algorithm(cert_pem)
        assert algo == "ecc", f"Expected ecc, got {algo}"

    def test_detects_sm2(self):
        from app.services.cert_generator import (
            detect_cert_algorithm, generate_sm2_keypair,
            generate_csr, self_sign_certificate, detect_openssl,
        )
        openssl = detect_openssl()
        if not openssl["sm2_supported"]:
            pytest.skip("No SM2-capable openssl available")
        key = generate_sm2_keypair(openssl["path"])
        csr = generate_csr(
            openssl["path"], key, "test.com", [], [], openssl["flavor"],
        )
        cert = self_sign_certificate(
            openssl["path"], csr, key, 365, openssl["flavor"],
        )
        algo = detect_cert_algorithm(cert)
        assert algo == "sm2", f"Expected sm2, got {algo}"


# ===== generate_rsa_keypair() =====

class TestGenerateRsaKeypair:
    def test_function_exists(self):
        from app.services.cert_generator import generate_rsa_keypair
        assert callable(generate_rsa_keypair)

    def test_returns_pem_private_key(self):
        from app.services.cert_generator import generate_rsa_keypair, detect_openssl
        openssl = detect_openssl()
        if not openssl["path"]:
            pytest.skip("No openssl available")
        pem = generate_rsa_keypair(openssl["path"])
        assert "-----BEGIN PRIVATE KEY-----" in pem
        assert "-----END PRIVATE KEY-----" in pem

    def test_key_is_2048_bits(self):
        from app.services.cert_generator import (
            generate_rsa_keypair, _run_openssl, detect_openssl,
        )
        openssl = detect_openssl()
        if not openssl["path"]:
            pytest.skip("No openssl available")
        pem = generate_rsa_keypair(openssl["path"])
        import tempfile, pathlib
        with tempfile.TemporaryDirectory() as d:
            tmp = pathlib.Path(d)
            key_file = tmp / "key.pem"
            key_file.write_text(pem)
            result = _run_openssl(
                ["rsa", "-in", str(key_file), "-text", "-noout"],
                openssl["path"],
            )
            assert "2048 bit" in result.stdout


# ===== generate_ecdsa_keypair() =====

class TestGenerateEcdsaKeypair:
    def test_function_exists(self):
        from app.services.cert_generator import generate_ecdsa_keypair
        assert callable(generate_ecdsa_keypair)

    def test_returns_pem_private_key(self):
        from app.services.cert_generator import generate_ecdsa_keypair, detect_openssl
        openssl = detect_openssl()
        if not openssl["path"]:
            pytest.skip("No openssl available")
        pem = generate_ecdsa_keypair(openssl["path"])
        assert "EC PRIVATE KEY" in pem or "PRIVATE KEY" in pem

    def test_key_is_prime256v1(self):
        from app.services.cert_generator import (
            generate_ecdsa_keypair, _run_openssl, detect_openssl,
        )
        openssl = detect_openssl()
        if not openssl["path"]:
            pytest.skip("No openssl available")
        pem = generate_ecdsa_keypair(openssl["path"])
        import tempfile, pathlib
        with tempfile.TemporaryDirectory() as d:
            tmp = pathlib.Path(d)
            key_file = tmp / "key.pem"
            key_file.write_text(pem)
            result = _run_openssl(
                ["ec", "-in", str(key_file), "-text", "-noout"],
                openssl["path"],
            )
            assert "prime256v1" in result.stdout


# ===== LocalProvider with algorithm =====

class TestLocalProviderAlgorithm:
    def test_provider_has_generate_method(self):
        from app.services.cert_generator import LocalProvider
        provider = LocalProvider()
        assert hasattr(provider, "generate_certificate")
        assert callable(provider.generate_certificate)

    def test_generate_sm2_returns_dual(self):
        from app.services.cert_generator import LocalProvider
        provider = LocalProvider()
        if not provider.sm2_supported:
            pytest.skip("No SM2-capable openssl available")
        result = provider.generate_certificate(
            algorithm="sm2",
            common_name="lp-sm2.test.com",
        )
        assert "cert" in result
        assert "key" in result
        assert "sign_cert" in result
        assert "sign_key" in result
        # SM2 dual cert should have different keys
        assert result["key"] != result["sign_key"]

    def test_generate_sm2_single_no_sign(self):
        from app.services.cert_generator import LocalProvider
        provider = LocalProvider()
        if not provider.sm2_supported:
            pytest.skip("No SM2-capable openssl available")
        result = provider.generate_certificate(
            algorithm="sm2",
            dual_cert=False,
            common_name="lp-sm2-single.test.com",
        )
        assert "cert" in result
        assert "key" in result
        assert result.get("sign_cert") is None
        assert result.get("sign_key") is None

    def test_generate_rsa_returns_single(self):
        from app.services.cert_generator import LocalProvider
        provider = LocalProvider()
        if not provider.openssl_path:
            pytest.skip("No openssl available")
        result = provider.generate_certificate(
            algorithm="rsa",
            common_name="lp-rsa.test.com",
        )
        assert "cert" in result
        assert "key" in result
        assert result.get("sign_cert") is None
        assert result.get("sign_key") is None
        from app.services.cert_generator import detect_cert_algorithm
        assert detect_cert_algorithm(result["cert"]) == "rsa"

    def test_generate_ecc_returns_single(self):
        from app.services.cert_generator import LocalProvider
        provider = LocalProvider()
        if not provider.openssl_path:
            pytest.skip("No openssl available")
        result = provider.generate_certificate(
            algorithm="ecc",
            common_name="lp-ecc.test.com",
        )
        assert "cert" in result
        assert "key" in result


# ===== 2.10 Provider Interface (original) =====

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
