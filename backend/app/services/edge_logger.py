import os
import base64
from datetime import datetime
from typing import Any


class EdgeLogger:
    LOG_DIR = "logs/edge"
    UPSTREAM_LOG_FILE = "logs/edge/upstream.log"
    ROUTE_LOG_FILE = "logs/edge/route.log"

    def __init__(self):
        os.makedirs(self.LOG_DIR, exist_ok=True)

    def _try_decrypt(self, data: str, sm4_key: bytes) -> str | None:
        try:
            from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes
            from cryptography.hazmat.backends import default_backend

            BLOCK_SIZE = 16
            standard = data.replace('-', '+').replace('_', '/')
            padding = (4 - len(standard) % 4) % 4
            padded = standard + '=' * padding
            encrypted = base64.b64decode(padded)
            cipher = Cipher(algorithms.SM4(sm4_key), modes.ECB(), backend=default_backend())
            decryptor = cipher.decryptor()
            decrypted = decryptor.update(encrypted) + decryptor.finalize()
            padding_length = decrypted[-1]
            if padding_length > BLOCK_SIZE or padding_length == 0:
                return None
            return decrypted[:-padding_length].decode('utf-8')
        except Exception:
            return None

    def _write_log(self, log_file: str, log_entry: list[str]) -> None:
        with open(log_file, "a", encoding="utf-8") as f:
            f.write("\n".join(log_entry) + "\n")

    def log_edge_operation(
        self,
        cluster_id: int,
        cluster_name: str,
        upstream_id: int,
        upstream_name: str,
        method: str,
        path: str,
        request_body: dict[str, Any] | None,
        encrypted_body: str | None,
        response_status: int | None,
        response_body: dict[str, Any] | None,
        status: str,
        error: str | None = None
    ) -> None:
        import os as os_module

        timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        sm4_key = os_module.getenv('EDGE_SM4_KEY', 'a16bc20453da220f').encode()

        log_entry = [
            f"[{timestamp}]",
            f"Cluster:{cluster_name} (ID:{cluster_id})",
            f"Upstream:{upstream_name} (ID:{upstream_id})",
            f"Request: {method} {path}",
        ]

        if request_body:
            log_entry.append(f"Request Body: {request_body}")
        if encrypted_body:
            log_entry.append(f"Encrypted: {encrypted_body}")
        if response_status:
            log_entry.append(f"Response: {response_status}")

        if response_body:
            if 'raw_response' in response_body:
                decrypted = self._try_decrypt(response_body['raw_response'], sm4_key)
                if decrypted:
                    log_entry.append(f"Response Body (decrypted): {decrypted}")
                else:
                    log_entry.append(f"Response Body: (encrypted, decryption failed)")
            else:
                log_entry.append(f"Response Body: {response_body}")

        if error:
            log_entry.append(f"Error: {error}")

        log_entry.append(f"Status: {status}")
        log_entry.append("---")

        self._write_log(self.UPSTREAM_LOG_FILE, log_entry)

    def log_route_operation(
        self,
        cluster_id: int,
        cluster_name: str,
        route_id: int,
        route_name: str,
        method: str,
        path: str,
        request_body: dict[str, Any] | None,
        encrypted_body: str | None,
        response_status: int | None,
        response_body: dict[str, Any] | None,
        status: str,
        error: str | None = None
    ) -> None:
        import os as os_module

        timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        sm4_key = os_module.getenv('EDGE_SM4_KEY', 'a16bc20453da220f').encode()

        log_entry = [
            f"[{timestamp}]",
            f"Cluster:{cluster_name} (ID:{cluster_id})",
            f"Route:{route_name} (ID:{route_id})",
            f"Request: {method} {path}",
        ]

        if request_body:
            log_entry.append(f"Request Body: {request_body}")
        if encrypted_body:
            log_entry.append(f"Encrypted: {encrypted_body}")
        if response_status:
            log_entry.append(f"Response: {response_status}")

        if response_body:
            if 'raw_response' in response_body:
                decrypted = self._try_decrypt(response_body['raw_response'], sm4_key)
                if decrypted:
                    log_entry.append(f"Response Body (decrypted): {decrypted}")
                else:
                    log_entry.append(f"Response Body: (encrypted, decryption failed)")
            else:
                log_entry.append(f"Response Body: {response_body}")

        if error:
            log_entry.append(f"Error: {error}")

        log_entry.append(f"Status: {status}")
        log_entry.append("---")

        self._write_log(self.ROUTE_LOG_FILE, log_entry)


_edge_logger: EdgeLogger | None = None


def get_edge_logger() -> EdgeLogger:
    global _edge_logger
    if _edge_logger is None:
        _edge_logger = EdgeLogger()
    return _edge_logger


def reset_edge_logger() -> None:
    global _edge_logger
    _edge_logger = None