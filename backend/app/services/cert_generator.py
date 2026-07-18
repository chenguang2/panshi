"""SM2 certificate generation service.

Supports local generation (bundled Tongsuo or system openssl)
and remote generation (SSH to cluster nodes).
"""
import os
import re
import subprocess
import tempfile
from pathlib import Path

# Project root relative to this file (backend/app/services/ -> project root)
_PROJECT_ROOT = Path(__file__).resolve().parents[3]
_BUNDLED_OPENSSL = _PROJECT_ROOT / "backend" / "bin" / "openssl"


def _run_openssl(cmd: list[str], openssl_path: str) -> subprocess.CompletedProcess:
    """Run an openssl command and return the result."""
    full_cmd = [openssl_path] + cmd
    return subprocess.run(
        full_cmd,
        capture_output=True,
        text=True,
        timeout=30,
    )


def _check_sm2_support(openssl_path: str) -> bool:
    """Check if the given openssl binary supports SM2 curve."""
    try:
        result = _run_openssl(["ecparam", "-list_curves"], openssl_path)
        return "SM2" in result.stdout
    except (subprocess.TimeoutExpired, FileNotFoundError, OSError):
        return False


def _detect_flavor(openssl_path: str) -> str:
    """Detect openssl flavor: 'tongsuo', 'standard', or 'unknown'."""
    try:
        result = _run_openssl(["version"], openssl_path)
        version_output = result.stdout.lower()
        if "tongsuo" in version_output:
            return "tongsuo"
        if "babassl" in version_output:
            return "tongsuo"  # BabaSSL is Tongsuo-based
        if "openssl" in version_output:
            return "standard"
        return "unknown"
    except (subprocess.TimeoutExpired, FileNotFoundError, OSError):
        return "unknown"


def detect_openssl() -> dict:
    """Detect available openssl binary.

    Priority: bundled Tongsuo -> system PATH.

    Returns:
        dict with keys:
        - path: str | None  (full path to openssl binary)
        - version: str      (version string, empty if not found)
        - sm2_supported: bool
        - flavor: str       ("tongsuo" | "standard" | "unknown")
        - available: bool   (True if any openssl binary was found)
    """
    candidates = []

    # 1. Bundled Tongsuo
    if _BUNDLED_OPENSSL.exists() and os.access(str(_BUNDLED_OPENSSL), os.X_OK):
        candidates.append(str(_BUNDLED_OPENSSL))

    # 2. System PATH
    system_openssl = _find_on_path("openssl")
    if system_openssl:
        candidates.append(system_openssl)

    for candidate in candidates:
        sm2 = _check_sm2_support(candidate)
        flavor = _detect_flavor(candidate)
        try:
            result = _run_openssl(["version"], candidate)
            version = result.stdout.strip()
        except (subprocess.TimeoutExpired, FileNotFoundError, OSError):
            version = ""
        if sm2:
            return {
                "path": candidate,
                "version": version,
                "sm2_supported": sm2,
                "flavor": flavor,
                "available": True,
            }

    # No SM2-capable openssl found, but may have plain openssl
    if candidates:
        last = candidates[0]
        flavor = _detect_flavor(last)
        try:
            result = _run_openssl(["version"], last)
            version = result.stdout.strip()
        except (subprocess.TimeoutExpired, FileNotFoundError, OSError):
            version = ""
        return {
            "path": last,
            "version": version,
            "sm2_supported": False,
            "flavor": flavor,
            "available": True,
        }

    return {
        "path": None,
        "version": "",
        "sm2_supported": False,
        "flavor": "unknown",
        "available": False,
    }


def generate_openssl_cnf(common_name: str, hash_alg: str = "sm3") -> str:
    """Generate a minimal openssl.cnf for CSR generation."""
    return f"""[ req ]
distinguished_name = req_distinguished_name
string_mask = utf8only
default_md = {hash_alg}
prompt = no

[ req_distinguished_name ]
commonName = {common_name}
"""


def generate_rsa_keypair(openssl_path: str) -> str:
    """Generate an RSA 2048-bit key pair and return the private key PEM."""
    with tempfile.TemporaryDirectory(prefix="panshi_rsa_") as tmpdir:
        key_file = Path(tmpdir) / "rsa.key"
        result = _run_openssl(
            ["genrsa", "-out", str(key_file), "2048"],
            openssl_path,
        )
        if result.returncode != 0:
            raise RuntimeError(
                f"RSA key generation failed: {result.stderr.strip()}"
            )
        return key_file.read_text()


def generate_ecdsa_keypair(openssl_path: str) -> str:
    """Generate an ECDSA P-256 key pair and return the private key PEM."""
    with tempfile.TemporaryDirectory(prefix="panshi_ecc_") as tmpdir:
        key_file = Path(tmpdir) / "ecc.key"
        result = _run_openssl(
            ["ecparam", "-genkey", "-name", "prime256v1", "-out", str(key_file)],
            openssl_path,
        )
        if result.returncode != 0:
            raise RuntimeError(
                f"ECDSA key generation failed: {result.stderr.strip()}"
            )
        return key_file.read_text()


def generate_sm2_keypair(openssl_path: str) -> str:
    """Generate an SM2 key pair and return the private key PEM."""
    with tempfile.TemporaryDirectory(prefix="panshi_sm2_") as tmpdir:
        key_file = Path(tmpdir) / "sm2.key"
        result = _run_openssl(
            ["ecparam", "-genkey", "-name", "SM2", "-out", str(key_file)],
            openssl_path,
        )
        if result.returncode != 0:
            raise RuntimeError(
                f"SM2 key generation failed: {result.stderr.strip()}"
            )
        return key_file.read_text()


def _sigopt_args(flavor: str, hash_alg: str = "sm3") -> list[str]:
    if flavor == "tongsuo" and hash_alg == "sm3":
        return ["-sigopt", "sm2_id:1234567812345678"]
    return []


def _digest_flag(hash_alg: str) -> list[str]:
    if hash_alg == "sm3":
        return ["-sm3"]
    return [f"-{hash_alg}"]


def _build_san_args(dns_sans: list[str], ip_sans: list[str]) -> str:
    """Build subjectAltName string from domain and IP lists."""
    parts = []
    for d in dns_sans:
        parts.append(f"DNS:{d}")
    for ip in ip_sans:
        parts.append(f"IP:{ip}")
    return ",".join(parts)


def generate_csr(
    openssl_path: str,
    key_pem: str,
    common_name: str,
    dns_sans: list[str],
    ip_sans: list[str],
    flavor: str,
    hash_alg: str = "sm3",
) -> str:
    """Generate a CSR using the given private key."""
    with tempfile.TemporaryDirectory(prefix="panshi_csr_") as tmpdir:
        tmp = Path(tmpdir)
        key_file = tmp / "key.pem"
        csr_file = tmp / "request.csr"
        cnf_file = tmp / "openssl.cnf"

        key_file.write_text(key_pem)
        cnf_file.write_text(generate_openssl_cnf(common_name, hash_alg=hash_alg))

        cmd = [
            "req", "-new",
            "-key", str(key_file),
            "-out", str(csr_file),
            "-subj", f"/CN={common_name}",
            "-config", str(cnf_file),
            "-nodes",
        ]
        cmd.extend(_digest_flag(hash_alg))
        san = _build_san_args(dns_sans, ip_sans)
        if san:
            cmd.extend(["-addext", f"subjectAltName={san}"])
        cmd.extend(_sigopt_args(flavor, hash_alg))

        result = _run_openssl(cmd, openssl_path)
        if result.returncode != 0:
            raise RuntimeError(f"CSR generation failed: {result.stderr.strip()}")

        return csr_file.read_text()


def self_sign_certificate(
    openssl_path: str,
    csr_pem: str,
    key_pem: str,
    validity_days: int,
    flavor: str,
    hash_alg: str = "sm3",
) -> str:
    """Self-sign a CSR to produce a certificate."""
    with tempfile.TemporaryDirectory(prefix="panshi_cert_") as tmpdir:
        tmp = Path(tmpdir)
        csr_file = tmp / "request.csr"
        key_file = tmp / "key.pem"
        cert_file = tmp / "cert.crt"

        csr_file.write_text(csr_pem)
        key_file.write_text(key_pem)

        cmd = [
            "x509", "-req",
            "-in", str(csr_file),
            "-signkey", str(key_file),
            "-out", str(cert_file),
            "-days", str(validity_days),
        ]
        cmd.extend(_digest_flag(hash_alg))
        cmd.extend(_sigopt_args(flavor, hash_alg))

        result = _run_openssl(cmd, openssl_path)
        if result.returncode != 0:
            raise RuntimeError(
                f"Certificate self-sign failed: {result.stderr.strip()}"
            )

        return cert_file.read_text()


def generate_dual_certificates(
    openssl_path: str,
    common_name: str,
    dns_sans: list[str],
    ip_sans: list[str],
    validity_days: int,
    flavor: str,
) -> dict:
    """Generate SM2 dual certificates (encryption + signing).

    Returns dict with keys: cert, key, sign_cert, sign_key.
    Both certs share the same CN/SAN but use different key pairs.
    """
    # Encryption key pair
    enc_key = generate_sm2_keypair(openssl_path)
    enc_csr = generate_csr(
        openssl_path, enc_key,
        common_name, dns_sans, ip_sans, flavor,
    )
    enc_cert = self_sign_certificate(
        openssl_path, enc_csr, enc_key,
        validity_days, flavor,
    )

    # Signing key pair
    sign_key = generate_sm2_keypair(openssl_path)
    sign_csr = generate_csr(
        openssl_path, sign_key,
        common_name, dns_sans, ip_sans, flavor,
    )
    sign_cert = self_sign_certificate(
        openssl_path, sign_csr, sign_key,
        validity_days, flavor,
    )

    return {
        "cert": enc_cert,
        "key": enc_key,
        "sign_cert": sign_cert,
        "sign_key": sign_key,
    }


class LocalProvider:
    """Certificate generation using local openssl.

    Auto-detects the best available openssl binary.
    Supports SM2, RSA, and ECDSA algorithms.
    """

    def __init__(self):
        info = detect_openssl()
        self.openssl_path = info["path"]
        self.flavor = info["flavor"]
        self.sm2_supported = info["sm2_supported"]
        self.version = info["version"]
        self.available = info["available"]

    def generate_certificate(
        self,
        algorithm: str = "sm2",
        common_name: str = "",
        dns_sans: list[str] | None = None,
        ip_sans: list[str] | None = None,
        validity_days: int = 365,
        dual_cert: bool = True,
    ) -> dict:
        if not self.openssl_path:
            raise RuntimeError("No openssl binary available")

        if algorithm == "sm2":
            if not self.sm2_supported:
                raise RuntimeError("Openssl does not support SM2 curve")
            if dual_cert:
                return generate_dual_certificates(
                    openssl_path=self.openssl_path,
                    common_name=common_name,
                    dns_sans=dns_sans or [],
                    ip_sans=ip_sans or [],
                    validity_days=validity_days,
                    flavor=self.flavor,
                )
            else:
                key_pem = generate_sm2_keypair(self.openssl_path)
                csr_pem = generate_csr(
                    self.openssl_path, key_pem,
                    common_name, dns_sans or [], ip_sans or [],
                    self.flavor, hash_alg="sm3",
                )
                cert_pem = self_sign_certificate(
                    self.openssl_path, csr_pem, key_pem,
                    validity_days, self.flavor, hash_alg="sm3",
                )
                return {"cert": cert_pem, "key": key_pem}
        else:
            return generate_standard_certificate(
                openssl_path=self.openssl_path,
                common_name=common_name,
                dns_sans=dns_sans or [],
                ip_sans=ip_sans or [],
                validity_days=validity_days,
                flavor=self.flavor,
                algorithm=algorithm,
            )

    def generate_dual_certificates(
        self,
        common_name: str,
        dns_sans: list[str] | None = None,
        ip_sans: list[str] | None = None,
        validity_days: int = 365,
    ) -> dict:
        return self.generate_certificate(
            algorithm="sm2", dual_cert=True,
            common_name=common_name,
            dns_sans=dns_sans, ip_sans=ip_sans,
            validity_days=validity_days,
        )

def generate_standard_certificate(
    openssl_path: str,
    common_name: str,
    dns_sans: list[str],
    ip_sans: list[str],
    validity_days: int,
    flavor: str,
    algorithm: str = "rsa",
) -> dict:
    """Generate a single standard certificate (RSA or ECDSA).

    Returns dict with keys: cert, key (sign_cert and sign_key are None).
    """
    if algorithm == "rsa":
        key_pem = generate_rsa_keypair(openssl_path)
    else:
        key_pem = generate_ecdsa_keypair(openssl_path)

    csr_pem = generate_csr(
        openssl_path, key_pem,
        common_name, dns_sans, ip_sans, flavor,
        hash_alg="sha256",
    )
    cert_pem = self_sign_certificate(
        openssl_path, csr_pem, key_pem,
        validity_days, flavor,
        hash_alg="sha256",
    )
    return {"cert": cert_pem, "key": key_pem}


def detect_cert_algorithm(cert_pem: str) -> str:
    """Detect certificate algorithm from PEM content.

    Returns 'rsa', 'ecc', or 'sm2' based on the Signature Algorithm field.
    """
    openssl_info = detect_openssl()
    if not openssl_info["path"]:
        return ""

    import tempfile
    from pathlib import Path
    with tempfile.TemporaryDirectory(prefix="panshi_detect_") as tmpdir:
        cert_file = Path(tmpdir) / "cert.pem"
        cert_file.write_text(cert_pem)
        result = _run_openssl(
            ["x509", "-in", str(cert_file), "-text", "-noout"],
            openssl_info["path"],
        )
        output = result.stdout

        if "sm2-with-SM3" in output or "SM2-with-SM3" in output:
            return "sm2"
        if "ecdsa-with-SHA256" in output or "ecdsa-with-SHA384" in output:
            return "ecc"
        if "sha256WithRSAEncryption" in output or "sha384WithRSAEncryption" in output or "sha512WithRSAEncryption" in output:
            return "rsa"

        return ""


def _find_on_path(name: str) -> str | None:
    """Find an executable on system PATH."""
    path_dirs = os.environ.get("PATH", "").split(os.pathsep)
    for d in path_dirs:
        candidate = Path(d) / name
        if candidate.exists() and os.access(str(candidate), os.X_OK):
            return str(candidate)
    return None
