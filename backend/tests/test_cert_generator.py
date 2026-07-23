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
        assert "flavor" in result
        assert "available" in result

    def test_finds_some_openssl(self):
        from app.services.cert_generator import detect_openssl
        result = detect_openssl()
        assert result["path"] is not None, "No openssl found in PATH or bundled"

    def test_collects_detect_logs(self):
        from app.services.cert_generator import detect_openssl, CommandResult
        logs: list[CommandResult] = []
        detect_openssl(detect_logs=logs)
        assert len(logs) >= 1
        for log in logs:
            assert isinstance(log, CommandResult)
            assert "openssl" in log.command


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

        pem, logs = generate_sm2_keypair(openssl["path"])
        assert isinstance(pem, str)
        assert "-----BEGIN PRIVATE KEY-----" in pem
        assert "-----END PRIVATE KEY-----" in pem
        assert len(logs) >= 1

# ===== 2.5 generate_csr() =====

class TestGenerateCsr:
    """Tests for CSR generation."""

    def _get_sm2_key(self, openssl_path):
        from app.services.cert_generator import generate_sm2_keypair
        key, _ = generate_sm2_keypair(openssl_path)
        return key

    def test_returns_pem(self):
        from app.services.cert_generator import generate_csr, detect_openssl
        openssl = detect_openssl()
        if not openssl["sm2_supported"]:
            pytest.skip("No SM2-capable openssl available")

        key_pem = self._get_sm2_key(openssl["path"])
        csr, logs = generate_csr(
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
        assert len(logs) >= 1

    def test_csr_has_correct_cn(self):
        from app.services.cert_generator import (
            generate_csr, _run_openssl, detect_openssl,
        )
        openssl = detect_openssl()
        if not openssl["sm2_supported"]:
            pytest.skip("No SM2-capable openssl available")

        key_pem = self._get_sm2_key(openssl["path"])
        csr, _ = generate_csr(
            openssl_path=openssl["path"],
            key_pem=key_pem,
            common_name="mycert.test.com",
            dns_sans=["mycert.test.com"],
            ip_sans=[],
            flavor=openssl["flavor"],
        )
        import tempfile
        from pathlib import Path
        with tempfile.TemporaryDirectory() as d:
            cnf = Path(d) / "null.cnf"
            cnf.write_text("[req]\ndistinguished_name = req_distinguished_name\n[req_distinguished_name]\ncommonName = optional\n")
            csr_file = Path(d) / "test.csr"
            csr_file.write_text(csr)
            result = _run_openssl(
                ["req", "-config", str(cnf), "-in", str(csr_file), "-noout", "-subject"],
                openssl["path"],
            )
            assert "CN = mycert.test.com" in result.stdout or "CN=mycert.test.com" in result.stdout


# ===== 2.6 self_sign_certificate() =====

class TestSelfSignCertificate:
    """Tests for self-signed certificate generation."""

    def _gen_sm2_key_csr(self, openssl_path, flavor, cn="test.panshi.com"):
        from app.services.cert_generator import generate_sm2_keypair, generate_csr
        key, _ = generate_sm2_keypair(openssl_path)
        csr, _ = generate_csr(
            openssl_path, key, cn, [cn], [], flavor,
        )
        return key, csr

    def test_returns_pem_cert(self):
        from app.services.cert_generator import (
            self_sign_certificate, detect_openssl,
        )
        openssl = detect_openssl()
        if not openssl["sm2_supported"]:
            pytest.skip("No SM2-capable openssl available")

        key_pem, csr = self._gen_sm2_key_csr(openssl["path"], openssl["flavor"])
        cert, logs = self_sign_certificate(
            openssl_path=openssl["path"],
            csr_pem=csr,
            key_pem=key_pem,
            validity_days=365,
            flavor=openssl["flavor"],
        )
        assert isinstance(cert, str)
        assert "-----BEGIN CERTIFICATE-----" in cert
        assert "-----END CERTIFICATE-----" in cert
        assert len(logs) >= 1


# ===== generate_csr with hash_alg =====

class TestGenerateCsrWithHashAlg:

    def _get_rsa_key(self, openssl_path):
        from app.services.cert_generator import generate_rsa_keypair
        key, _ = generate_rsa_keypair(openssl_path)
        return key

    def _get_sm2_key(self, openssl_path):
        from app.services.cert_generator import generate_sm2_keypair
        key, _ = generate_sm2_keypair(openssl_path)
        return key

    def test_csr_with_rsa_sha256(self):
        from app.services.cert_generator import generate_csr, detect_openssl
        openssl = detect_openssl()
        if not openssl["path"]:
            pytest.skip("No openssl available")
        key = self._get_rsa_key(openssl["path"])
        csr, _ = generate_csr(
            openssl_path=openssl["path"],
            key_pem=key,
            common_name="rsa.test.com",
            dns_sans=[], ip_sans=[],
            flavor=openssl["flavor"],
            hash_alg="sha256",
        )
        assert "-----BEGIN CERTIFICATE REQUEST-----" in csr

    def test_csr_with_sm2_default_sm3(self):
        from app.services.cert_generator import generate_csr, detect_openssl
        openssl = detect_openssl()
        if not openssl["sm2_supported"]:
            pytest.skip("No SM2-capable openssl available")
        key = self._get_sm2_key(openssl["path"])
        csr, _ = generate_csr(
            openssl_path=openssl["path"],
            key_pem=key,
            common_name="sm2.test.com",
            dns_sans=[], ip_sans=[],
            flavor=openssl["flavor"],
        )
        assert "-----BEGIN CERTIFICATE REQUEST-----" in csr


# ===== self_sign_certificate with hash_alg =====

class TestSelfSignWithHashAlg:

    def _gen_rsa_key_csr(self, openssl_path, flavor):
        from app.services.cert_generator import generate_rsa_keypair, generate_csr
        key, _ = generate_rsa_keypair(openssl_path)
        csr, _ = generate_csr(openssl_path, key, "rsa.test.com", [], [], flavor, hash_alg="sha256")
        return key, csr

    def test_self_sign_rsa_sha256(self):
        from app.services.cert_generator import (
            self_sign_certificate, detect_cert_algorithm, detect_openssl,
        )
        openssl = detect_openssl()
        if not openssl["path"]:
            pytest.skip("No openssl available")
        key, csr = self._gen_rsa_key_csr(openssl["path"], openssl["flavor"])
        cert, _ = self_sign_certificate(
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
        result, logs = generate_standard_certificate(
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
        assert len(logs) >= 1

    def test_ecc_returns_single_cert(self):
        from app.services.cert_generator import (
            generate_standard_certificate, detect_openssl,
        )
        openssl = detect_openssl()
        if not openssl["path"]:
            pytest.skip("No openssl available")
        result, logs = generate_standard_certificate(
            openssl_path=openssl["path"],
            common_name="std-ecc.test.com",
            dns_sans=[], ip_sans=[],
            validity_days=365,
            flavor=openssl["flavor"],
            algorithm="ecc",
        )
        assert "cert" in result
        assert "key" in result
        assert len(logs) >= 1


# ===== 2.7 generate_dual_certificates() =====

class TestGenerateDualCertificates:
    """Tests for dual certificate generation (enc + sign) updated for CA signing."""

    def _setup_ca(self, openssl_path, flavor):
        from app.services.cert_generator import generate_ca_certificate
        return generate_ca_certificate(openssl_path, "DualTestCA", 3650, flavor)

    def test_returns_both_certs(self):
        from app.services.cert_generator import (
            generate_dual_certificates, detect_openssl,
        )
        openssl = detect_openssl()
        if not openssl["sm2_supported"]:
            pytest.skip("No SM2-capable openssl available")

        ca, _ = self._setup_ca(openssl["path"], openssl["flavor"])
        result, logs = generate_dual_certificates(
            openssl_path=openssl["path"],
            common_name="dual.test.com",
            dns_sans=["dual.test.com"],
            ip_sans=[],
            validity_days=365,
            flavor=openssl["flavor"],
            ca_cert_pem=ca["ca_cert"],
            ca_key_pem=ca["ca_key"],
        )
        assert isinstance(result, dict)
        assert "cert" in result
        assert "-----BEGIN CERTIFICATE-----" in result["cert"]
        assert "key" in result
        assert "-----BEGIN PRIVATE KEY-----" in result["key"]
        assert "sign_cert" in result
        assert "-----BEGIN CERTIFICATE-----" in result["sign_cert"]
        assert "sign_key" in result
        assert "-----BEGIN PRIVATE KEY-----" in result["sign_key"]
        assert result["key"] != result["sign_key"]
        assert len(logs) >= 4


# ===== detect_cert_algorithm() =====

class TestDetectCertAlgorithm:
    """Tests for certificate algorithm detection from PEM."""

    def _generate_rsa_cert(self, openssl_path: str) -> str:
        from app.services.cert_generator import _run_openssl
        import tempfile, pathlib
        with tempfile.TemporaryDirectory() as d:
            tmp = pathlib.Path(d)
            cnf = tmp / "null.cnf"
            cnf.write_text("[req]\ndistinguished_name = req_distinguished_name\n[req_distinguished_name]\ncommonName = optional\n")
            key = tmp / "key.pem"
            cert = tmp / "cert.pem"
            _run_openssl(["genrsa", "-out", str(key), "2048"], openssl_path)
            _run_openssl([
                "req", "-config", str(cnf), "-new", "-x509",
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
            cnf = tmp / "null.cnf"
            cnf.write_text("[req]\ndistinguished_name = req_distinguished_name\n[req_distinguished_name]\ncommonName = optional\n")
            key = tmp / "key.pem"
            cert = tmp / "cert.pem"
            _run_openssl(["ecparam", "-genkey", "-name", "prime256v1", "-out", str(key)], openssl_path)
            _run_openssl([
                "req", "-config", str(cnf), "-new", "-x509",
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
        key, _ = generate_sm2_keypair(openssl["path"])
        csr, _ = generate_csr(
            openssl["path"], key, "test.com", [], [], openssl["flavor"],
        )
        cert, _ = self_sign_certificate(
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
        pem, logs = generate_rsa_keypair(openssl["path"])
        assert "-----BEGIN PRIVATE KEY-----" in pem
        assert "-----END PRIVATE KEY-----" in pem
        assert len(logs) >= 1

    def test_key_is_2048_bits(self):
        from app.services.cert_generator import (
            generate_rsa_keypair, _run_openssl, detect_openssl,
        )
        openssl = detect_openssl()
        if not openssl["path"]:
            pytest.skip("No openssl available")
        pem, _ = generate_rsa_keypair(openssl["path"])
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
        pem, logs = generate_ecdsa_keypair(openssl["path"])
        assert "EC PRIVATE KEY" in pem or "PRIVATE KEY" in pem
        assert len(logs) >= 1

    def test_key_is_prime256v1(self):
        from app.services.cert_generator import (
            generate_ecdsa_keypair, _run_openssl, detect_openssl,
        )
        openssl = detect_openssl()
        if not openssl["path"]:
            pytest.skip("No openssl available")
        pem, _ = generate_ecdsa_keypair(openssl["path"])
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

    def _setup_ca(self, openssl_path, flavor):
        from app.services.cert_generator import generate_ca_certificate
        return generate_ca_certificate(openssl_path, "LPCA", 3650, flavor)

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
        ca, _ = self._setup_ca(provider.openssl_path, provider.flavor)
        result, logs = provider.generate_certificate(
            algorithm="sm2",
            common_name="lp-sm2.test.com",
            ca_cert_pem=ca["ca_cert"],
            ca_key_pem=ca["ca_key"],
        )
        assert "cert" in result
        assert "key" in result
        assert "sign_cert" in result
        assert "sign_key" in result
        assert result["key"] != result["sign_key"]
        assert len(logs) >= 1

    def test_sm2_single_cert_removed_returns_dual(self):
        """SM2 single cert path removed: dual_cert=False still generates dual."""
        from app.services.cert_generator import LocalProvider
        provider = LocalProvider()
        if not provider.sm2_supported:
            pytest.skip("No SM2-capable openssl available")
        ca, _ = self._setup_ca(provider.openssl_path, provider.flavor)
        result, logs = provider.generate_certificate(
            algorithm="sm2",
            dual_cert=False,
            common_name="lp-sm2-single.test.com",
            ca_cert_pem=ca["ca_cert"],
            ca_key_pem=ca["ca_key"],
        )
        assert "cert" in result
        assert "key" in result
        assert "sign_cert" in result
        assert "sign_key" in result

    def test_generate_rsa_returns_single(self):
        from app.services.cert_generator import LocalProvider
        provider = LocalProvider()
        if not provider.openssl_path:
            pytest.skip("No openssl available")
        result, logs = provider.generate_certificate(
            algorithm="rsa",
            common_name="lp-rsa.test.com",
        )
        assert "cert" in result
        assert "key" in result
        assert result.get("sign_cert") is None
        assert result.get("sign_key") is None
        assert len(logs) >= 1
        from app.services.cert_generator import detect_cert_algorithm
        assert detect_cert_algorithm(result["cert"]) == "rsa"

    def test_generate_ecc_returns_single(self):
        from app.services.cert_generator import LocalProvider
        provider = LocalProvider()
        if not provider.openssl_path:
            pytest.skip("No openssl available")
        result, logs = provider.generate_certificate(
            algorithm="ecc",
            common_name="lp-ecc.test.com",
        )
        assert "cert" in result
        assert "key" in result
        assert len(logs) >= 1


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
        from app.services.cert_generator import (
            LocalProvider, generate_ca_certificate,
        )
        provider = LocalProvider()
        if not provider.sm2_supported:
            pytest.skip("No SM2-capable openssl available")
        ca, _ = generate_ca_certificate(
            provider.openssl_path, "DualCertCA", 3650, provider.flavor,
        )

        result = provider.generate_dual_certificates(
            common_name="provider.test.com",
            dns_sans=["provider.test.com"],
            ip_sans=[],
            validity_days=365,
            ca_cert_pem=ca["ca_cert"],
            ca_key_pem=ca["ca_key"],
        )
        assert "cert" in result
        assert "key" in result
        assert "sign_cert" in result
        assert "sign_key" in result


# ===== NEW: Enhanced _run_openssl (Task 2.1) =====

class TestRunOpensslEnhanced:
    """Tests for enhanced _run_openssl return type."""

    def test_returns_command_in_result(self):
        from app.services.cert_generator import _run_openssl, detect_openssl
        openssl = detect_openssl()
        if not openssl["path"]:
            pytest.skip("No openssl available")

        result = _run_openssl(["version"], openssl["path"])
        assert hasattr(result, "command")
        assert "openssl" in result.command
        assert "version" in result.command
        assert hasattr(result, "stdout")
        assert hasattr(result, "stderr")
        assert hasattr(result, "returncode")
        assert result.returncode == 0


# ===== NEW: Generator functions return logs (Task 2.2-2.6) =====

class TestGeneratorReturnsLogs:
    """Tests that generator functions return command logs alongside results."""

    def test_generate_sm2_keypair_returns_logs(self):
        from app.services.cert_generator import generate_sm2_keypair, detect_openssl
        openssl = detect_openssl()
        if not openssl["sm2_supported"]:
            pytest.skip("No SM2-capable openssl available")
        key_pem, logs = generate_sm2_keypair(openssl["path"])
        assert isinstance(key_pem, str)
        assert "BEGIN PRIVATE KEY" in key_pem
        assert isinstance(logs, list)
        assert len(logs) >= 1
        log = logs[0]
        assert "ecparam" in log.command or "genkey" in log.command
        assert log.returncode == 0

    def test_generate_rsa_keypair_returns_logs(self):
        from app.services.cert_generator import generate_rsa_keypair, detect_openssl
        openssl = detect_openssl()
        if not openssl["path"]:
            pytest.skip("No openssl available")
        key_pem, logs = generate_rsa_keypair(openssl["path"])
        assert isinstance(key_pem, str)
        assert isinstance(logs, list)
        assert len(logs) >= 1

    def test_generate_ecdsa_keypair_returns_logs(self):
        from app.services.cert_generator import generate_ecdsa_keypair, detect_openssl
        openssl = detect_openssl()
        if not openssl["path"]:
            pytest.skip("No openssl available")
        key_pem, logs = generate_ecdsa_keypair(openssl["path"])
        assert isinstance(key_pem, str)
        assert isinstance(logs, list)
        assert len(logs) >= 1

    def test_generate_csr_returns_logs(self):
        from app.services.cert_generator import (
            generate_sm2_keypair, generate_csr, detect_openssl,
        )
        openssl = detect_openssl()
        if not openssl["sm2_supported"]:
            pytest.skip("No SM2-capable openssl available")
        key_pem, _ = generate_sm2_keypair(openssl["path"])
        csr_pem, logs = generate_csr(
            openssl_path=openssl["path"],
            key_pem=key_pem,
            common_name="test-log.test.com",
            dns_sans=[], ip_sans=[],
            flavor=openssl["flavor"],
        )
        assert isinstance(csr_pem, str)
        assert "BEGIN CERTIFICATE REQUEST" in csr_pem
        assert isinstance(logs, list)
        assert len(logs) >= 1

    def test_self_sign_certificate_returns_logs(self):
        from app.services.cert_generator import (
            generate_sm2_keypair, generate_csr,
            self_sign_certificate, detect_openssl,
        )
        openssl = detect_openssl()
        if not openssl["sm2_supported"]:
            pytest.skip("No SM2-capable openssl available")
        key_pem, _ = generate_sm2_keypair(openssl["path"])
        csr_pem, _ = generate_csr(
            openssl["path"], key_pem, "test-sign.test.com", [], [],
            openssl["flavor"],
        )
        cert_pem, logs = self_sign_certificate(
            openssl["path"], csr_pem, key_pem, 365, openssl["flavor"],
        )
        assert isinstance(cert_pem, str)
        assert "BEGIN CERTIFICATE" in cert_pem
        assert isinstance(logs, list)
        assert len(logs) >= 1

    def test_generate_dual_certificates_returns_logs(self):
        from app.services.cert_generator import (
            generate_dual_certificates, generate_ca_certificate, detect_openssl,
        )
        openssl = detect_openssl()
        if not openssl["sm2_supported"]:
            pytest.skip("No SM2-capable openssl available")
        ca, _ = generate_ca_certificate(openssl["path"], "LogTestCA", 3650, openssl["flavor"])
        result, logs = generate_dual_certificates(
            openssl_path=openssl["path"],
            common_name="test-dual-logs.test.com",
            dns_sans=[], ip_sans=[],
            validity_days=365,
            flavor=openssl["flavor"],
            ca_cert_pem=ca["ca_cert"],
            ca_key_pem=ca["ca_key"],
        )
        assert isinstance(result, dict)
        assert "cert" in result
        assert isinstance(logs, list)
        assert len(logs) >= 2

    def test_generate_standard_certificate_returns_logs(self):
        from app.services.cert_generator import (
            generate_standard_certificate, detect_openssl,
        )
        openssl = detect_openssl()
        if not openssl["path"]:
            pytest.skip("No openssl available")
        result, logs = generate_standard_certificate(
            openssl_path=openssl["path"],
            common_name="test-std-logs.test.com",
            dns_sans=[], ip_sans=[],
            validity_days=365,
            flavor=openssl["flavor"],
            algorithm="rsa",
        )
        assert isinstance(result, dict)
        assert "cert" in result
        assert isinstance(logs, list)
        assert len(logs) >= 1


# ===== NEW: CommandLogEntry Schema (Task 1.1 / 9.1) =====

class TestCommandLogEntry:
    """Tests for CommandLogEntry schema."""

    def test_model_exists(self):
        from app.schemas.ssl import CommandLogEntry
        assert CommandLogEntry is not None

    def test_has_required_fields(self):
        from app.schemas.ssl import CommandLogEntry
        entry = CommandLogEntry(
            step="生成密钥对",
            command="openssl ecparam -genkey -name SM2 -out key.pem",
            exit_code=0,
            stdout="",
            stderr="",
        )
        assert entry.step == "生成密钥对"
        assert entry.command == "openssl ecparam -genkey -name SM2 -out key.pem"
        assert entry.exit_code == 0
        assert entry.stdout == ""
        assert entry.stderr == ""

    def test_default_fields(self):
        from app.schemas.ssl import CommandLogEntry
        entry = CommandLogEntry(
            step="test",
            command="echo hello",
            exit_code=0,
        )
        assert entry.stdout == ""
        assert entry.stderr == ""

    def test_serialized_as_dict(self):
        from app.schemas.ssl import CommandLogEntry
        entry = CommandLogEntry(
            step="test",
            command="echo hello",
            exit_code=0,
            stderr="error msg",
        )
        d = entry.model_dump()
        assert d["step"] == "test"
        assert d["exit_code"] == 0
        assert d["stderr"] == "error msg"


class TestSslCertificateResponseGenerateLog:
    """Tests for generate_log field in SslCertificateResponse."""

    def test_response_has_generate_log(self):
        from app.schemas.ssl import SslCertificateResponse, CommandLogEntry
        field_info = SslCertificateResponse.model_fields.get("generate_log")
        assert field_info is not None, "generate_log field missing from SslCertificateResponse"
        instance = SslCertificateResponse(
            id=1, edge_uuid="uuid", cluster_id=1,
            name="test", sni="test.com", cert="", key="",
        )
        assert instance.generate_log is None


# ===== NEW: Task 1.5 — LocalProvider SM2 always dual cert, requires CA =====

class TestLocalProviderSm2CA:
    """Tests for LocalProvider SM2 path with CA signing."""

    def _setup_ca(self, openssl_path, flavor):
        from app.services.cert_generator import generate_ca_certificate
        return generate_ca_certificate(openssl_path, "ProviderCA", 3650, flavor)

    def test_sm2_always_dual_cert(self):
        from app.services.cert_generator import LocalProvider
        provider = LocalProvider()
        if not provider.sm2_supported:
            pytest.skip("No SM2-capable openssl available")
        ca, _ = self._setup_ca(provider.openssl_path, provider.flavor)
        result, logs = provider.generate_certificate(
            algorithm="sm2",
            common_name="always-dual.test.com",
            ca_cert_pem=ca["ca_cert"],
            ca_key_pem=ca["ca_key"],
        )
        assert "cert" in result
        assert "key" in result
        assert "sign_cert" in result
        assert "sign_key" in result

    def test_sm2_requires_ca_params(self):
        from app.services.cert_generator import LocalProvider
        provider = LocalProvider()
        if not provider.sm2_supported:
            pytest.skip("No SM2-capable openssl available")
        with pytest.raises(TypeError):
            provider.generate_certificate(
                algorithm="sm2",
                common_name="no-ca.test.com",
            )

    def test_sm2_ignores_dual_cert_param(self):
        from app.services.cert_generator import LocalProvider
        provider = LocalProvider()
        if not provider.sm2_supported:
            pytest.skip("No SM2-capable openssl available")
        ca, _ = self._setup_ca(provider.openssl_path, provider.flavor)
        with_ca, _ = provider.generate_certificate(
            algorithm="sm2", common_name="ignored-param.test.com",
            dual_cert=False,
            ca_cert_pem=ca["ca_cert"], ca_key_pem=ca["ca_key"],
        )
        assert "sign_cert" in with_ca
        assert "sign_key" in with_ca


# ===== NEW: Task 1.4 — generate_dual_certificates() with CA =====

class TestGenerateDualCertificatesWithCA:
    """Tests for dual cert generation using CA signing."""

    def _setup_ca(self, openssl_path, flavor):
        from app.services.cert_generator import generate_ca_certificate
        return generate_ca_certificate(openssl_path, "DualCA", 3650, flavor)

    def test_requires_ca_params(self):
        from app.services.cert_generator import generate_dual_certificates
        import inspect
        sig = inspect.signature(generate_dual_certificates)
        assert "ca_cert_pem" in sig.parameters
        assert "ca_key_pem" in sig.parameters

    def test_returns_dual_certs_signed_by_ca(self):
        from app.services.cert_generator import (
            generate_dual_certificates, _run_openssl, detect_openssl,
        )
        openssl = detect_openssl()
        if not openssl["sm2_supported"]:
            pytest.skip("No SM2-capable openssl available")
        ca, _ = self._setup_ca(openssl["path"], openssl["flavor"])
        result, logs = generate_dual_certificates(
            openssl_path=openssl["path"],
            common_name="dual-ca.test.com",
            dns_sans=[],
            ip_sans=[],
            validity_days=365,
            flavor=openssl["flavor"],
            ca_cert_pem=ca["ca_cert"],
            ca_key_pem=ca["ca_key"],
        )
        assert isinstance(result, dict)
        assert "cert" in result
        assert "key" in result
        assert "sign_cert" in result
        assert "sign_key" in result
        assert "-----BEGIN CERTIFICATE-----" in result["cert"]
        assert "-----BEGIN CERTIFICATE-----" in result["sign_cert"]

        import tempfile
        from pathlib import Path
        with tempfile.TemporaryDirectory() as d:
            cert_file = Path(d) / "cert.crt"
            cert_file.write_text(result["cert"])
            r = _run_openssl(
                ["x509", "-in", str(cert_file), "-noout", "-issuer"],
                openssl["path"],
            )
            assert "CN = DualCA" in r.stdout or "CN=DualCA" in r.stdout, (
                f"Expected issuer CN=DualCA, got {r.stdout}"
            )

    def test_self_sign_fallback_removed(self):
        """Calling without ca params should raise TypeError."""
        from app.services.cert_generator import generate_dual_certificates, detect_openssl
        openssl = detect_openssl()
        if not openssl["sm2_supported"]:
            pytest.skip("No SM2-capable openssl available")
        with pytest.raises(TypeError):
            generate_dual_certificates(
                openssl_path=openssl["path"],
                common_name="no-ca.test.com",
                dns_sans=[], ip_sans=[],
                validity_days=365,
                flavor=openssl["flavor"],
            )


# ===== NEW: Task 1.3 — ca_sign_csr() =====

class TestCaSignCsr:
    """Tests for CA-signed CSR generation."""

    def _setup(self, openssl_path, flavor):
        from app.services.cert_generator import (
            generate_ca_certificate, generate_sm2_keypair, generate_csr,
        )
        ca, _ = generate_ca_certificate(openssl_path, "TestCA", 3650, flavor)
        key, _ = generate_sm2_keypair(openssl_path)
        csr, _ = generate_csr(openssl_path, key, "test.panshi.com", [], [], flavor)
        return ca["ca_cert"], ca["ca_key"], csr

    def test_function_exists(self):
        from app.services.cert_generator import ca_sign_csr
        assert callable(ca_sign_csr)

    def test_signs_csr_and_returns_pem(self):
        from app.services.cert_generator import ca_sign_csr, detect_openssl
        openssl = detect_openssl()
        if not openssl["sm2_supported"]:
            pytest.skip("No SM2-capable openssl available")
        ca_cert, ca_key, csr = self._setup(openssl["path"], openssl["flavor"])
        cert, logs = ca_sign_csr(
            openssl_path=openssl["path"],
            csr_pem=csr,
            ca_cert_pem=ca_cert,
            ca_key_pem=ca_key,
            validity_days=365,
            flavor=openssl["flavor"],
            extensions_section="v3_req",
            ext_file_content="""[ v3_req ]\nbasicConstraints = CA:FALSE\nkeyUsage = critical, digitalSignature\n""",
        )
        assert isinstance(cert, str)
        assert "-----BEGIN CERTIFICATE-----" in cert
        assert "-----END CERTIFICATE-----" in cert
        assert isinstance(logs, list)
        assert len(logs) >= 1

    def test_issuer_is_ca_subject(self):
        from app.services.cert_generator import ca_sign_csr, _run_openssl, detect_openssl
        openssl = detect_openssl()
        if not openssl["sm2_supported"]:
            pytest.skip("No SM2-capable openssl available")
        ca_cert, ca_key, csr = self._setup(openssl["path"], openssl["flavor"])
        cert, _ = ca_sign_csr(
            openssl_path=openssl["path"],
            csr_pem=csr,
            ca_cert_pem=ca_cert,
            ca_key_pem=ca_key,
            validity_days=365,
            flavor=openssl["flavor"],
            extensions_section="v3_req",
            ext_file_content="""[ v3_req ]\nbasicConstraints = CA:FALSE\nkeyUsage = critical, digitalSignature\n""",
        )
        import tempfile
        from pathlib import Path
        with tempfile.TemporaryDirectory() as d:
            cert_file = Path(d) / "cert.crt"
            cert_file.write_text(cert)
            r = _run_openssl(
                ["x509", "-in", str(cert_file), "-noout", "-issuer"],
                openssl["path"],
            )
            assert "CN = TestCA" in r.stdout or "CN=TestCA" in r.stdout, (
                f"Expected issuer CN=TestCA, got {r.stdout}"
            )

    def test_validity_truncated_to_ca(self):
        from app.services.cert_generator import (
            ca_sign_csr, get_cert_expiry, detect_openssl,
        )
        openssl = detect_openssl()
        if not openssl["sm2_supported"]:
            pytest.skip("No SM2-capable openssl available")
        ca_cert, ca_key, csr = self._setup(openssl["path"], openssl["flavor"])
        ca_expiry = get_cert_expiry(openssl["path"], ca_cert)

        # Request 100 years - should be truncated to CA expiry
        cert, _ = ca_sign_csr(
            openssl_path=openssl["path"],
            csr_pem=csr,
            ca_cert_pem=ca_cert,
            ca_key_pem=ca_key,
            validity_days=36500,
            flavor=openssl["flavor"],
            extensions_section="v3_req",
            ext_file_content="""[ v3_req ]\nbasicConstraints = CA:FALSE\nkeyUsage = critical, digitalSignature\n""",
        )
        cert_expiry = get_cert_expiry(openssl["path"], cert)
        assert cert_expiry <= ca_expiry, (
            f"Cert expiry {cert_expiry} should not exceed CA expiry {ca_expiry}"
        )

    def test_validity_not_truncated_when_shorter(self):
        from app.services.cert_generator import (
            ca_sign_csr, get_cert_expiry, detect_openssl,
        )
        from datetime import date, timedelta
        openssl = detect_openssl()
        if not openssl["sm2_supported"]:
            pytest.skip("No SM2-capable openssl available")
        ca_cert, ca_key, csr = self._setup(openssl["path"], openssl["flavor"])
        cert, _ = ca_sign_csr(
            openssl_path=openssl["path"],
            csr_pem=csr,
            ca_cert_pem=ca_cert,
            ca_key_pem=ca_key,
            validity_days=1,
            flavor=openssl["flavor"],
            extensions_section="v3_req",
            ext_file_content="""[ v3_req ]\nbasicConstraints = CA:FALSE\nkeyUsage = critical, digitalSignature\n""",
        )
        cert_expiry = get_cert_expiry(openssl["path"], cert)
        expected = date.today() + timedelta(days=1)
        assert cert_expiry == expected, (
            f"Expected {expected}, got {cert_expiry}"
        )


# ===== NEW: Task 1.2 — get_cert_expiry() =====

class TestGetCertExpiry:
    """Tests for certificate expiry date extraction."""

    def test_function_exists(self):
        from app.services.cert_generator import get_cert_expiry
        assert callable(get_cert_expiry)

    def test_returns_date_object(self):
        from app.services.cert_generator import (
            get_cert_expiry, generate_ca_certificate, detect_openssl,
        )
        openssl = detect_openssl()
        if not openssl["path"]:
            pytest.skip("No openssl available")
        ca, _ = generate_ca_certificate(openssl["path"], "Test", 3650, openssl["flavor"])
        from datetime import date
        expiry = get_cert_expiry(openssl["path"], ca["ca_cert"])
        assert isinstance(expiry, date)

    def test_expiry_within_expected_range(self):
        from app.services.cert_generator import (
            get_cert_expiry, generate_ca_certificate, detect_openssl,
        )
        openssl = detect_openssl()
        if not openssl["path"]:
            pytest.skip("No openssl available")
        ca, _ = generate_ca_certificate(openssl["path"], "Test", 3650, openssl["flavor"])
        from datetime import date, timedelta
        expiry = get_cert_expiry(openssl["path"], ca["ca_cert"])
        expected_min = date.today() + timedelta(days=3649)
        expected_max = date.today() + timedelta(days=3651)
        assert expected_min <= expiry <= expected_max, (
            f"Expected ~3650 days from now, got {expiry}"
        )

    def test_expiry_with_short_validity(self):
        from app.services.cert_generator import (
            get_cert_expiry, generate_ca_certificate, detect_openssl,
        )
        openssl = detect_openssl()
        if not openssl["path"]:
            pytest.skip("No openssl available")
        ca, _ = generate_ca_certificate(openssl["path"], "Test", 1, openssl["flavor"])
        from datetime import date, timedelta
        expiry = get_cert_expiry(openssl["path"], ca["ca_cert"])
        expected = date.today() + timedelta(days=1)
        assert expiry == expected, f"Expected {expected}, got {expiry}"


# ===== NEW: Task 1.1 — generate_ca_certificate() =====

class TestGenerateCaCertificate:
    """Tests for CA certificate generation."""

    def test_function_exists(self):
        from app.services.cert_generator import generate_ca_certificate
        assert callable(generate_ca_certificate)

    def test_returns_ca_cert_and_key(self):
        from app.services.cert_generator import generate_ca_certificate, detect_openssl
        openssl = detect_openssl()
        if not openssl["sm2_supported"]:
            pytest.skip("No SM2-capable openssl available")

        result, logs = generate_ca_certificate(
            openssl_path=openssl["path"],
            common_name="Test Root CA",
            validity_days=3650,
            flavor=openssl["flavor"],
        )
        assert isinstance(result, dict)
        assert "ca_cert" in result
        assert "ca_key" in result
        assert "-----BEGIN CERTIFICATE-----" in result["ca_cert"]
        assert "-----END CERTIFICATE-----" in result["ca_cert"]
        assert "-----BEGIN PRIVATE KEY-----" in result["ca_key"]
        assert "-----END PRIVATE KEY-----" in result["ca_key"]
        assert isinstance(logs, list)
        assert len(logs) >= 1

    def test_ca_cert_has_ca_true_extension(self):
        from app.services.cert_generator import (
            generate_ca_certificate, _run_openssl, detect_openssl,
        )
        openssl = detect_openssl()
        if not openssl["sm2_supported"]:
            pytest.skip("No SM2-capable openssl available")

        result, _ = generate_ca_certificate(
            openssl_path=openssl["path"],
            common_name="CA Ext Test",
            validity_days=3650,
            flavor=openssl["flavor"],
        )
        import tempfile
        from pathlib import Path
        with tempfile.TemporaryDirectory() as d:
            cert_file = Path(d) / "ca.crt"
            cert_file.write_text(result["ca_cert"])
            r = _run_openssl(["x509", "-in", str(cert_file), "-text", "-noout"], openssl["path"])
            output = r.stdout
            assert "CA:TRUE" in output, f"Expected CA:TRUE in output, got: {output[:500]}"
            assert "Certificate Sign" in output, "Expected Certificate Sign in Key Usage"
            assert "CRL Sign" in output, "Expected CRL Sign in Key Usage"

    def test_ca_cert_has_correct_subject(self):
        from app.services.cert_generator import (
            generate_ca_certificate, _run_openssl, detect_openssl,
        )
        openssl = detect_openssl()
        if not openssl["sm2_supported"]:
            pytest.skip("No SM2-capable openssl available")

        result, _ = generate_ca_certificate(
            openssl_path=openssl["path"],
            common_name="MyCustomCA",
            validity_days=3650,
            flavor=openssl["flavor"],
        )
        import tempfile
        from pathlib import Path
        with tempfile.TemporaryDirectory() as d:
            cert_file = Path(d) / "ca.crt"
            cert_file.write_text(result["ca_cert"])
            r = _run_openssl(
                ["x509", "-in", str(cert_file), "-noout", "-subject"],
                openssl["path"],
            )
            assert "CN = MyCustomCA" in r.stdout or "CN=MyCustomCA" in r.stdout

    def test_algorithm_rsa_returns_ca_cert(self):
        from app.services.cert_generator import generate_ca_certificate, detect_openssl
        openssl = detect_openssl()
        if not openssl["available"]:
            pytest.skip("No openssl available")

        result, logs = generate_ca_certificate(
            openssl_path=openssl["path"],
            common_name="RSA Test CA",
            validity_days=365,
            flavor=openssl["flavor"],
            algorithm="rsa",
        )
        assert "ca_cert" in result
        assert "ca_key" in result
        assert "-----BEGIN PRIVATE KEY-----" in result["ca_key"]
        assert isinstance(logs, list)

    def test_algorithm_ecc_returns_ca_cert(self):
        from app.services.cert_generator import generate_ca_certificate, detect_openssl
        openssl = detect_openssl()
        if not openssl["available"]:
            pytest.skip("No openssl available")

        result, logs = generate_ca_certificate(
            openssl_path=openssl["path"],
            common_name="ECC Test CA",
            validity_days=365,
            flavor=openssl["flavor"],
            algorithm="ecc",
        )
        assert "ca_cert" in result
        assert "ca_key" in result
        assert "-----BEGIN EC PRIVATE KEY-----" in result["ca_key"]
        assert isinstance(logs, list)

    def test_algorithm_default_is_sm2(self):
        from app.services.cert_generator import generate_ca_certificate, detect_openssl
        openssl = detect_openssl()
        if not openssl["available"]:
            pytest.skip("No openssl available")

        result, _ = generate_ca_certificate(
            openssl_path=openssl["path"],
            common_name="Default Test CA",
            validity_days=365,
            flavor=openssl["flavor"],
        )
        assert "ca_key" in result
