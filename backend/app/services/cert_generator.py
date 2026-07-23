"""SM2 certificate generation service.

Supports local generation (bundled Tongsuo or system openssl)
and remote generation (SSH to cluster nodes).
"""
import json
import logging
import os
import re
import subprocess
import tempfile
from datetime import date, datetime
from dataclasses import dataclass
from pathlib import Path
from typing import Any

# Project root relative to this file (backend/app/services/ -> project root)
_PROJECT_ROOT = Path(__file__).resolve().parents[3]
_BUNDLED_OPENSSL = _PROJECT_ROOT / "backend" / "bin" / "openssl"


@dataclass
class CommandResult:
    """Enhanced result from an openssl command execution."""
    command: str
    returncode: int
    stdout: str
    stderr: str


_cert_logger: logging.Logger | None = None


def _get_cert_logger() -> logging.Logger:
    global _cert_logger
    if _cert_logger is None:
        _cert_logger = logging.getLogger("cert_generate")
        _cert_logger.setLevel(logging.INFO)
        _cert_logger.propagate = False
        log_dir = Path(__file__).resolve().parent.parent.parent / "logs"
        log_dir.mkdir(exist_ok=True)
        handler = logging.FileHandler(
            str(log_dir / "cert_generate.log"), mode="a", encoding="utf-8",
        )
        handler.setFormatter(logging.Formatter("%(message)s"))
        _cert_logger.handlers.clear()
        _cert_logger.addHandler(handler)
    return _cert_logger


def log_cert_commands(cluster_id: int, cluster_name: str, cert_name: str, logs: list[CommandResult]) -> None:
    logger = _get_cert_logger()
    for entry in logs:
        record: dict[str, Any] = {
            "time": __import__("datetime").datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
            "cluster_id": cluster_id,
            "cluster_name": cluster_name,
            "cert_name": cert_name,
            "command": entry.command,
            "exit_code": entry.returncode,
            "stderr": entry.stderr[-500:] if entry.stderr else "",
        }
        logger.info(json.dumps(record, ensure_ascii=False))


def _run_openssl(cmd: list[str], openssl_path: str) -> CommandResult:
    """Run an openssl command and return the result with command info."""
    full_cmd = [openssl_path] + cmd
    result = subprocess.run(
        full_cmd,
        capture_output=True,
        text=True,
        timeout=30,
    )
    return CommandResult(
        command=" ".join(str(a) for a in full_cmd),
        returncode=result.returncode,
        stdout=result.stdout,
        stderr=result.stderr,
    )


def _check_sm2_support(openssl_path: str, logs: list[CommandResult]) -> bool:
    """Check if the given openssl binary supports SM2 curve."""
    try:
        result = _run_openssl(["ecparam", "-list_curves"], openssl_path)
        logs.append(result)
        return "SM2" in result.stdout
    except (subprocess.TimeoutExpired, FileNotFoundError, OSError):
        return False


def _detect_flavor(openssl_path: str, logs: list[CommandResult]) -> tuple[str, str]:
    """Detect openssl flavor. Returns (flavor, version_string)."""
    try:
        result = _run_openssl(["version"], openssl_path)
        logs.append(result)
        version_output = result.stdout.lower()
        raw_version = result.stdout.strip()
        if "tongsuo" in version_output:
            return "tongsuo", raw_version
        if "babassl" in version_output:
            return "tongsuo", raw_version
        if "openssl" in version_output:
            return "standard", raw_version
        return "unknown", raw_version
    except (subprocess.TimeoutExpired, FileNotFoundError, OSError):
        return "unknown", ""


def detect_openssl(detect_logs: list[CommandResult] | None = None) -> dict:
    """Detect the bundled Tongsuo openssl binary.

    Only uses backend/bin/openssl (bundled Tongsuo). Does NOT fall back to
    system PATH openssl — see _BUNDLED_OPENSSL_FIX for setup instructions.

    Args:
        detect_logs: optional list to append detection command results to.

    Returns:
        dict with keys:
        - path: str | None  (full path to openssl binary)
        - version: str      (version string, empty if not found)
        - sm2_supported: bool
        - flavor: str       ("tongsuo" | "standard" | "unknown")
        - available: bool   (True if bundled openssl was found)
    """
    logs = detect_logs if detect_logs is not None else []

    if _BUNDLED_OPENSSL.exists() and os.access(str(_BUNDLED_OPENSSL), os.X_OK):
        candidate = str(_BUNDLED_OPENSSL)
        sm2 = _check_sm2_support(candidate, logs)
        flavor, version = _detect_flavor(candidate, logs)
        return {
            "path": candidate,
            "version": version,
            "sm2_supported": sm2,
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


def generate_openssl_cnf(
    common_name: str,
    hash_alg: str = "sm3",
    country: str = "CN",
    state: str = "Beijing",
    locality: str = "Beijing",
    org: str = "EMBRACE",
    ou: str = "EDGE",
) -> str:
    """Generate openssl.cnf for CSR generation with full distinguished name."""
    return f"""[ req ]
distinguished_name = req_distinguished_name
string_mask = utf8only
default_md = {hash_alg}
prompt = no

[ req_distinguished_name ]
countryName = {country}
stateOrProvinceName = {state}
localityName = {locality}
0.organizationName = {org}
organizationalUnitName = {ou}
commonName = {common_name}
"""


def generate_rsa_keypair(openssl_path: str) -> tuple[str, list[CommandResult]]:
    """Generate an RSA 2048-bit key pair. Returns (private_key_pem, logs)."""
    with tempfile.TemporaryDirectory(prefix="panshi_rsa_") as tmpdir:
        key_file = Path(tmpdir) / "rsa.key"
        result = _run_openssl(
            ["genrsa", "-out", str(key_file), "2048"],
            openssl_path,
        )
        if result.returncode != 0:
            raise RuntimeError(f"RSA key generation failed: {result.stderr.strip()}")
        return key_file.read_text(), [result]


def generate_ecdsa_keypair(openssl_path: str) -> tuple[str, list[CommandResult]]:
    """Generate an ECDSA P-256 key pair. Returns (private_key_pem, logs)."""
    with tempfile.TemporaryDirectory(prefix="panshi_ecc_") as tmpdir:
        key_file = Path(tmpdir) / "ecc.key"
        result = _run_openssl(
            ["ecparam", "-genkey", "-name", "prime256v1", "-out", str(key_file)],
            openssl_path,
        )
        if result.returncode != 0:
            raise RuntimeError(f"ECDSA key generation failed: {result.stderr.strip()}")
        return key_file.read_text(), [result]


def generate_sm2_keypair(openssl_path: str) -> tuple[str, list[CommandResult]]:
    """Generate an SM2 key pair. Returns (private_key_pem, logs)."""
    with tempfile.TemporaryDirectory(prefix="panshi_sm2_") as tmpdir:
        key_file = Path(tmpdir) / "sm2.key"
        result = _run_openssl(
            ["ecparam", "-genkey", "-name", "SM2", "-out", str(key_file)],
            openssl_path,
        )
        if result.returncode != 0:
            raise RuntimeError(f"SM2 key generation failed: {result.stderr.strip()}")
        return key_file.read_text(), [result]


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
    country: str = "CN",
    state: str = "Beijing",
    locality: str = "Beijing",
    org: str = "EMBRACE",
    ou: str = "EDGE",
) -> tuple[str, list[CommandResult]]:
    """Generate a CSR using the given private key. Returns (csr_pem, logs)."""
    with tempfile.TemporaryDirectory(prefix="panshi_csr_") as tmpdir:
        tmp = Path(tmpdir)
        key_file = tmp / "key.pem"
        csr_file = tmp / "request.csr"
        cnf_file = tmp / "openssl.cnf"

        key_file.write_text(key_pem)
        cnf_file.write_text(generate_openssl_cnf(
            common_name, hash_alg=hash_alg,
            country=country, state=state, locality=locality,
            org=org, ou=ou,
        ))

        cmd = [
            "req", "-new",
            "-key", str(key_file),
            "-out", str(csr_file),
            "-subj", f"/C={country}/ST={state}/L={locality}/O={org}/OU={ou}/CN={common_name}",
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

        return csr_file.read_text(), [result]


def self_sign_certificate(
    openssl_path: str,
    csr_pem: str,
    key_pem: str,
    validity_days: int,
    flavor: str,
    hash_alg: str = "sm3",
    ext_file_content: str | None = None,
    extensions_section: str = "v3_req",
) -> tuple[str, list[CommandResult]]:
    """Self-sign a CSR to produce a certificate. Returns (cert_pem, logs)."""
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
        if ext_file_content:
            ext_file = tmp / "ext.cnf"
            ext_file.write_text(ext_file_content)
            cmd.extend(["-extfile", str(ext_file), "-extensions", extensions_section])
        cmd.extend(_digest_flag(hash_alg))
        cmd.extend(_sigopt_args(flavor, hash_alg))

        result = _run_openssl(cmd, openssl_path)
        if result.returncode != 0:
            raise RuntimeError(
                f"Certificate self-sign failed: {result.stderr.strip()}"
            )

        return cert_file.read_text(), [result]


def generate_dual_certificates(
    openssl_path: str,
    common_name: str,
    dns_sans: list[str],
    ip_sans: list[str],
    validity_days: int,
    flavor: str,
    ca_cert_pem: str,
    ca_key_pem: str,
    org: str = "EMBRACE",
    ou: str = "EDGE",
) -> tuple[dict, list[CommandResult]]:
    """Generate SM2 dual certificates (encryption + signing), signed by a CA.

    Returns (result_dict, logs) where result_dict has keys:
    cert, key, sign_cert, sign_key.
    """
    logs: list[CommandResult] = []

    san_str = _build_san_args(dns_sans, ip_sans)

    enc_ext_lines = [
        "[ v3_req ]",
        "basicConstraints = CA:FALSE",
        "keyUsage = keyAgreement, keyEncipherment, dataEncipherment",
        "extendedKeyUsage = serverAuth, clientAuth",
    ]
    if san_str:
        enc_ext_lines.append(f"subjectAltName = {san_str}")
    enc_ext = "\n".join(enc_ext_lines) + "\n"

    sign_ext_lines = [
        "[ v3_req ]",
        "basicConstraints = CA:FALSE",
        "keyUsage = nonRepudiation, digitalSignature",
        "extendedKeyUsage = serverAuth, clientAuth",
    ]
    if san_str:
        sign_ext_lines.append(f"subjectAltName = {san_str}")
    sign_ext = "\n".join(sign_ext_lines) + "\n"

    # Encryption key pair
    enc_key, key_logs = generate_sm2_keypair(openssl_path)
    logs.extend(key_logs)
    enc_csr, csr_logs = generate_csr(
        openssl_path, enc_key,
        common_name, dns_sans, ip_sans, flavor,
        org=org, ou=ou,
    )
    logs.extend(csr_logs)
    enc_cert, cert_logs = ca_sign_csr(
        openssl_path, enc_csr, ca_cert_pem, ca_key_pem,
        validity_days, flavor,
        extensions_section="v3_req",
        ext_file_content=enc_ext,
    )
    logs.extend(cert_logs)

    # Signing key pair
    sign_key, key_logs2 = generate_sm2_keypair(openssl_path)
    logs.extend(key_logs2)
    sign_csr, csr_logs2 = generate_csr(
        openssl_path, sign_key,
        common_name, dns_sans, ip_sans, flavor,
        org=org, ou=ou,
    )
    logs.extend(csr_logs2)
    sign_cert, cert_logs2 = ca_sign_csr(
        openssl_path, sign_csr, ca_cert_pem, ca_key_pem,
        validity_days, flavor,
        extensions_section="v3_req",
        ext_file_content=sign_ext,
    )
    logs.extend(cert_logs2)

    return {
        "cert": enc_cert,
        "key": enc_key,
        "sign_cert": sign_cert,
        "sign_key": sign_key,
    }, logs


def generate_ca_certificate(
    openssl_path: str,
    common_name: str,
    validity_days: int,
    flavor: str,
    algorithm: str = "sm2",
    org: str = "EMBRACE",
    ou: str = "EDGE",
) -> tuple[dict, list[CommandResult]]:
    """Generate a self-signed CA root certificate.

    Supports sm2, rsa, and ecc algorithms.

    Returns (result_dict, logs) where result_dict has keys: ca_cert, ca_key.
    """
    logs: list[CommandResult] = []

    hash_alg = "sm3" if algorithm == "sm2" else "sha256"

    if algorithm == "sm2":
        ca_key, key_logs = generate_sm2_keypair(openssl_path)
    elif algorithm == "rsa":
        ca_key, key_logs = generate_rsa_keypair(openssl_path)
    elif algorithm == "ecc":
        ca_key, key_logs = generate_ecdsa_keypair(openssl_path)
    else:
        raise ValueError(f"Unsupported algorithm: {algorithm}")
    logs.extend(key_logs)

    # Generate CSR
    ca_csr, csr_logs = generate_csr(
        openssl_path, ca_key,
        common_name, [], [], flavor,
        hash_alg=hash_alg,
        org=org, ou=ou,
    )
    logs.extend(csr_logs)

    # Self-sign with CA extensions
    with tempfile.TemporaryDirectory(prefix="panshi_ca_") as tmpdir:
        tmp = Path(tmpdir)
        csr_file = tmp / "ca.csr"
        key_file = tmp / "ca.key"
        cert_file = tmp / "ca.crt"
        ext_file = tmp / "ca_ext.cnf"

        csr_file.write_text(ca_csr)
        key_file.write_text(ca_key)

        ext_content = """[ v3_ca ]
subjectKeyIdentifier = hash
authorityKeyIdentifier = keyid:always,issuer
basicConstraints = critical, CA:true
keyUsage = critical, digitalSignature, cRLSign, keyCertSign
"""
        ext_file.write_text(ext_content)

        cmd = [
            "x509", "-req",
            "-in", str(csr_file),
            "-signkey", str(key_file),
            "-out", str(cert_file),
            "-days", str(validity_days),
            "-extfile", str(ext_file),
            "-extensions", "v3_ca",
        ]
        cmd.extend(_digest_flag(hash_alg))
        cmd.extend(_sigopt_args(flavor, hash_alg))

        result = _run_openssl(cmd, openssl_path)
        logs.append(result)
        if result.returncode != 0:
            raise RuntimeError(f"CA certificate self-sign failed: {result.stderr.strip()}")

        ca_cert_pem = cert_file.read_text()

    return {"ca_cert": ca_cert_pem, "ca_key": ca_key}, logs


def ca_sign_csr(
    openssl_path: str,
    csr_pem: str,
    ca_cert_pem: str,
    ca_key_pem: str,
    validity_days: int,
    flavor: str,
    extensions_section: str,
    ext_file_content: str,
    hash_alg: str = "sm3",
) -> tuple[str, list[CommandResult]]:
    """Sign a CSR using a CA certificate.

    Auto-truncates validity_days to not exceed the CA certificate's expiry.

    Returns (cert_pem, logs).
    """
    logs: list[CommandResult] = []

    # Truncate validity to not exceed CA
    ca_expiry = get_cert_expiry(openssl_path, ca_cert_pem)
    from datetime import date
    remaining = (ca_expiry - date.today()).days
    actual_days = min(validity_days, remaining)

    with tempfile.TemporaryDirectory(prefix="panshi_ca_sign_") as tmpdir:
        tmp = Path(tmpdir)
        csr_file = tmp / "request.csr"
        ca_cert_file = tmp / "ca.pem"
        ca_key_file = tmp / "ca.key"
        cert_file = tmp / "cert.crt"
        ext_file = tmp / "ext.cnf"

        csr_file.write_text(csr_pem)
        ca_cert_file.write_text(ca_cert_pem)
        ca_key_file.write_text(ca_key_pem)
        ext_file.write_text(ext_file_content)

        cmd = [
            "x509", "-req",
            "-in", str(csr_file),
            "-CA", str(ca_cert_file),
            "-CAkey", str(ca_key_file),
            "-CAcreateserial",
            "-out", str(cert_file),
            "-days", str(actual_days),
            "-extfile", str(ext_file),
            "-extensions", extensions_section,
        ]
        cmd.extend(_digest_flag(hash_alg))
        cmd.extend(_sigopt_args(flavor, hash_alg))

        result = _run_openssl(cmd, openssl_path)
        logs.append(result)
        if result.returncode != 0:
            raise RuntimeError(f"CA signing failed: {result.stderr.strip()}")

        return cert_file.read_text(), logs


def get_cert_expiry(openssl_path: str, cert_pem: str) -> date:
    """Parse a PEM certificate and return its notAfter date."""
    with tempfile.TemporaryDirectory(prefix="panshi_expiry_") as tmpdir:
        cert_file = Path(tmpdir) / "cert.pem"
        cert_file.write_text(cert_pem)

        result = _run_openssl(
            ["x509", "-in", str(cert_file), "-enddate", "-noout"],
            openssl_path,
        )
        if result.returncode != 0:
            raise ValueError(f"Failed to parse certificate: {result.stderr.strip()}")

        # Output format: notAfter=Jul 20 12:00:00 2036 GMT
        line = result.stdout.strip()
        if "notAfter=" not in line:
            raise ValueError(f"Unexpected openssl output: {line}")
        date_str = line.split("notAfter=", 1)[1].strip()

        return datetime.strptime(date_str, "%b %d %H:%M:%S %Y %Z").date()


def generate_standard_certificate(
    openssl_path: str,
    common_name: str,
    dns_sans: list[str],
    ip_sans: list[str],
    validity_days: int,
    flavor: str,
    algorithm: str = "rsa",
    ca_cert_pem: str | None = None,
    ca_key_pem: str | None = None,
    org: str = "EMBRACE",
    ou: str = "EDGE",
) -> tuple[dict, list[CommandResult]]:
    """Generate a single standard certificate (RSA or ECDSA).

    If ca_cert_pem and ca_key_pem are provided, signs with the CA
    instead of self-signing. Returns (result_dict, logs) with keys: cert, key.
    """
    if algorithm == "rsa":
        key_pem, key_logs = generate_rsa_keypair(openssl_path)
    else:
        key_pem, key_logs = generate_ecdsa_keypair(openssl_path)

    csr_pem, csr_logs = generate_csr(
        openssl_path, key_pem,
        common_name, dns_sans, ip_sans, flavor,
        hash_alg="sha256",
        org=org, ou=ou,
    )
    san_str = _build_san_args(dns_sans, ip_sans)
    ext_lines = [
        "[ v3_req ]",
        "basicConstraints = CA:FALSE",
        "keyUsage = nonRepudiation, digitalSignature, keyEncipherment",
        "extendedKeyUsage = serverAuth, clientAuth",
    ]
    if san_str:
        ext_lines.append(f"subjectAltName = {san_str}")
    ext_content = "\n".join(ext_lines) + "\n"

    if ca_cert_pem and ca_key_pem:
        cert_pem, cert_logs = ca_sign_csr(
            openssl_path, csr_pem,
            ca_cert_pem, ca_key_pem,
            validity_days, flavor,
            extensions_section="v3_req",
            ext_file_content=ext_content,
            hash_alg="sha256",
        )
    else:
        cert_pem, cert_logs = self_sign_certificate(
            openssl_path, csr_pem, key_pem,
            validity_days, flavor,
            hash_alg="sha256",
            ext_file_content=ext_content,
        )

    return {"cert": cert_pem, "key": key_pem}, key_logs + csr_logs + cert_logs


class LocalProvider:
    """Certificate generation using local openssl.

    Auto-detects the best available openssl binary.
    Supports SM2, RSA, and ECDSA algorithms.
    """

    def __init__(self, detect_logs: list[CommandResult] | None = None):
        info = detect_openssl(detect_logs=detect_logs)
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
        ca_cert_pem: str | None = None,
        ca_key_pem: str | None = None,
        org: str = "EMBRACE",
        ou: str = "EDGE",
    ) -> tuple[dict, list[CommandResult]]:
        """Generate a certificate. Returns (cert_dict, logs).

        For SM2: generates dual certs (enc+sign) always, requires CA params.
        For RSA/ECC: generates single cert, CA-signed if CA params given.
        """
        if not self.openssl_path:
            raise RuntimeError("No openssl binary available")

        if algorithm == "sm2":
            if not self.sm2_supported:
                raise RuntimeError("Openssl does not support SM2 curve")
            result, logs = generate_dual_certificates(
                openssl_path=self.openssl_path,
                common_name=common_name,
                dns_sans=dns_sans or [],
                ip_sans=ip_sans or [],
                validity_days=validity_days,
                flavor=self.flavor,
                ca_cert_pem=ca_cert_pem,
                ca_key_pem=ca_key_pem,
                org=org, ou=ou,
            )
            return result, logs
        else:
            result, logs = generate_standard_certificate(
                openssl_path=self.openssl_path,
                common_name=common_name,
                dns_sans=dns_sans or [],
                ip_sans=ip_sans or [],
                validity_days=validity_days,
                flavor=self.flavor,
                algorithm=algorithm,
                ca_cert_pem=ca_cert_pem,
                ca_key_pem=ca_key_pem,
                org=org, ou=ou,
            )
            return result, logs

    def generate_dual_certificates(
        self,
        common_name: str,
        dns_sans: list[str] | None = None,
        ip_sans: list[str] | None = None,
        validity_days: int = 365,
        ca_cert_pem: str | None = None,
        ca_key_pem: str | None = None,
    ) -> dict:
        result, logs = self.generate_certificate(
            algorithm="sm2",
            common_name=common_name,
            dns_sans=dns_sans, ip_sans=ip_sans,
            validity_days=validity_days,
            ca_cert_pem=ca_cert_pem,
            ca_key_pem=ca_key_pem,
        )
        return result


def detect_cert_algorithm(cert_pem: str) -> str:
    """Detect certificate algorithm from PEM content.

    Returns 'rsa', 'ecc', or 'sm2' based on the Signature Algorithm field.
    """
    openssl_info = detect_openssl()
    if not openssl_info["path"]:
        return ""

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


BUNDLED_OPENSSL_FIX = (
    f"请执行以下命令将 Tongsuo 复制到 {_BUNDLED_OPENSSL}：\n"
    f"mkdir -p {_BUNDLED_OPENSSL.parent}\n"
    f"cp product/linux/tongsuo/bin/openssl {_BUNDLED_OPENSSL}\n"
    f"chmod +x {_BUNDLED_OPENSSL}"
)
