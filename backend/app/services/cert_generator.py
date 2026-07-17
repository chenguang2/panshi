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
            }

    # No SM2-capable openssl found
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
        }

    return {
        "path": None,
        "version": "",
        "sm2_supported": False,
        "flavor": "unknown",
    }


def generate_openssl_cnf(common_name: str) -> str:
    """Generate a minimal openssl.cnf for SM2 CSR generation.

    Tongsuo's openssl requires a config file because its compiled-in
    default path does not exist on the target system.
    """
    return f"""[ req ]
distinguished_name = req_distinguished_name
string_mask = utf8only
default_md = sm3
prompt = no

[ req_distinguished_name ]
commonName = {common_name}
"""


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


def _sigopt_args(flavor: str) -> list[str]:
    """Return extra args for SM2 signing based on openssl flavor.
    
    Tongsuo/BabaSSL requires -sigopt for SM2 ID,
    standard OpenSSL 3.x uses a built-in default.
    """
    if flavor == "tongsuo":
        return ["-sigopt", "sm2_id:1234567812345678"]
    return []


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
) -> str:
    """Generate a CSR using the given SM2 private key."""
    with tempfile.TemporaryDirectory(prefix="panshi_csr_") as tmpdir:
        tmp = Path(tmpdir)
        key_file = tmp / "key.pem"
        csr_file = tmp / "request.csr"
        cnf_file = tmp / "openssl.cnf"

        key_file.write_text(key_pem)
        cnf_file.write_text(generate_openssl_cnf(common_name))

        cmd = [
            "req", "-new",
            "-key", str(key_file),
            "-out", str(csr_file),
            "-sm3",
            "-subj", f"/CN={common_name}",
            "-config", str(cnf_file),
            "-nodes",
        ]
        san = _build_san_args(dns_sans, ip_sans)
        if san:
            cmd.extend(["-addext", f"subjectAltName={san}"])
        cmd.extend(_sigopt_args(flavor))

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
) -> str:
    """Self-sign a CSR to produce an SM2 certificate."""
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
            "-sm3",
            "-days", str(validity_days),
        ]
        cmd.extend(_sigopt_args(flavor))

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
    """SM2 certificate generation using local openssl.

    Auto-detects the best available openssl binary.
    """

    def __init__(self):
        info = detect_openssl()
        self.openssl_path = info["path"]
        self.flavor = info["flavor"]
        self.sm2_supported = info["sm2_supported"]
        self.version = info["version"]

    def generate_dual_certificates(
        self,
        common_name: str,
        dns_sans: list[str] | None = None,
        ip_sans: list[str] | None = None,
        validity_days: int = 365,
    ) -> dict:
        """Generate SM2 dual certificates using local openssl."""
        if not self.openssl_path:
            raise RuntimeError("No openssl binary available")
        if not self.sm2_supported:
            raise RuntimeError("Openssl does not support SM2 curve")
        return generate_dual_certificates(
            openssl_path=self.openssl_path,
            common_name=common_name,
            dns_sans=dns_sans or [],
            ip_sans=ip_sans or [],
            validity_days=validity_days,
            flavor=self.flavor,
        )


def _find_on_path(name: str) -> str | None:
    """Find an executable on system PATH."""
    path_dirs = os.environ.get("PATH", "").split(os.pathsep)
    for d in path_dirs:
        candidate = Path(d) / name
        if candidate.exists() and os.access(str(candidate), os.X_OK):
            return str(candidate)
    return None
