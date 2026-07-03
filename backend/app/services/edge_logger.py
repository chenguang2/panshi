import os
import base64
from datetime import datetime
from typing import Any


class EdgeLogger:
    LOG_DIR = "logs/edge"

    RESOURCE_LOG_CONFIG: dict[str, dict[str, Any]] = {
        "upstream": {"file": "logs/edge/upstream.log", "label": "Upstream:{name} (ID:{id})"},
        "route": {"file": "logs/edge/route.log", "label": "Route:{name} (ID:{id})"},
        "plugin_config": {"file": "logs/edge/plugin_config.log", "label": "PluginConfig:{name} (ID:{id})"},
        "global_rule": {"file": "logs/edge/global_rule.log", "label": "GlobalRule:{name} (ID:{id})"},
        "plugin_metadata": {"file": "logs/edge/plugin_metadata.log", "label": "PluginMetadata:{name}"},
        "stream_proxy": {"file": "logs/edge/stream_proxy.log", "label": "StreamProxy:{name} (ID:{id})"},
    }

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
        os.makedirs(os.path.dirname(log_file), exist_ok=True)
        with open(log_file, "a", encoding="utf-8-sig") as f:
            f.write("\n".join(log_entry) + "\n")

    def log_operation(
        self,
        resource_type: str,
        cluster_id: int,
        cluster_name: str,
        resource_label: str,
        method: str,
        path: str,
        request_body: dict[str, Any] | None = None,
        encrypted_body: str | None = None,
        response_status: int | None = None,
        response_body: dict[str, Any] | None = None,
        status: str = "",
        error: str | None = None,
    ) -> None:
        import os as os_module

        timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        sm4_key = os_module.getenv('EDGE_SM4_KEY', 'a16bc20453da220f').encode()
        # Allow instance-level attribute override (used in tests)
        attr_name = f"{resource_type.upper()}_LOG_FILE"
        log_file = (
            getattr(self, attr_name, None)
            or getattr(self, "LOG_FILE", None)
            or self.RESOURCE_LOG_CONFIG.get(resource_type, {}).get("file", "logs/edge/upstream.log")
        )

        log_entry = [
            f"[{timestamp}]",
            f"Cluster:{cluster_name} (ID:{cluster_id})",
            resource_label,
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

        self._write_log(log_file, log_entry)

    def log_edge_operation(self, cluster_id, cluster_name, upstream_id, upstream_name, method, path, request_body=None, encrypted_body=None, response_status=None, response_body=None, status="", error=None):
        self.log_operation("upstream", cluster_id, cluster_name, f"Upstream:{upstream_name} (ID:{upstream_id})", method, path, request_body, encrypted_body, response_status, response_body, status, error)

    def log_route_operation(self, cluster_id, cluster_name, route_id, route_name, method, path, request_body=None, encrypted_body=None, response_status=None, response_body=None, status="", error=None):
        self.log_operation("route", cluster_id, cluster_name, f"Route:{route_name} (ID:{route_id})", method, path, request_body, encrypted_body, response_status, response_body, status, error)

    def log_plugin_config_operation(self, cluster_id, cluster_name, config_id, config_name, method, path, request_body=None, encrypted_body=None, response_status=None, response_body=None, status="", error=None):
        self.log_operation("plugin_config", cluster_id, cluster_name, f"PluginConfig:{config_name} (ID:{config_id})", method, path, request_body, encrypted_body, response_status, response_body, status, error)

    def log_global_rule_operation(self, cluster_id, cluster_name, rule_id, rule_name, method, path, request_body=None, encrypted_body=None, response_status=None, response_body=None, status="", error=None):
        self.log_operation("global_rule", cluster_id, cluster_name, f"GlobalRule:{rule_name} (ID:{rule_id})", method, path, request_body, encrypted_body, response_status, response_body, status, error)

    def log_plugin_metadata_operation(self, cluster_id, cluster_name, plugin_name, method, path, request_body=None, encrypted_body=None, response_status=None, response_body=None, status="", error=None):
        self.log_operation("plugin_metadata", cluster_id, cluster_name, f"PluginMetadata:{plugin_name}", method, path, request_body, encrypted_body, response_status, response_body, status, error)

    def log_publish_result(
        self,
        resource_type: str,
        cluster_id: int,
        cluster_name: str,
        resource_id: int | None,
        resource_name: str,
        method: str,
        path: str,
        request_body: dict[str, Any] | None = None,
        encrypted_body: str | None = None,
        response_status: int | None = None,
        response_body: dict[str, Any] | None = None,
        error: Exception | None = None,
    ) -> None:
        """Shared log callback passed to edge_sync.publish_to_nodes().

        Handles both success and error logging in one place,
        replacing 5 identical log_publish closures.
        """
        type_label = resource_type.replace("_", " ").title().replace(" ", "")
        resource_label = (
            f"{type_label}:{resource_name} (ID:{resource_id})"
            if resource_id is not None
            else f"{type_label}:{resource_name}"
        )
        if error:
            self.log_operation(
                resource_type, cluster_id, cluster_name,
                resource_label,
                method, path,
                request_body=request_body, encrypted_body=None,
                response_status=getattr(error, 'status_code', None),
                response_body=getattr(error, 'response_body', None),
                status="FAILED", error=str(error))
        else:
            self.log_operation(
                resource_type, cluster_id, cluster_name,
                resource_label,
                method, path,
                request_body=request_body, encrypted_body=encrypted_body,
                response_status=response_status, response_body=response_body,
                status="SUCCESS")


_edge_logger: EdgeLogger | None = None


def get_edge_logger() -> EdgeLogger:
    global _edge_logger
    if _edge_logger is None:
        _edge_logger = EdgeLogger()
    return _edge_logger


def reset_edge_logger() -> None:
    global _edge_logger
    _edge_logger = None