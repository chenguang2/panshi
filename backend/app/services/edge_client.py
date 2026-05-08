"""
Edge Server Client Module

Provides encrypted communication with edge servers for upstream synchronization.
"""

import base64
import json
import os
from typing import Any, TYPE_CHECKING

from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes
from cryptography.hazmat.backends import default_backend

if TYPE_CHECKING:
    from sqlalchemy.orm import Session


class EdgeConnectionError(Exception):
    """Raised when connection to edge server fails."""
    pass


class EdgeEncryptionError(Exception):
    """Raised when SM4 encryption or decryption fails."""
    pass


class EdgeAPIError(Exception):
    """Raised when edge API returns an error response."""

    def __init__(self, status_code: int, message: str, response_body: dict | None = None):
        self.status_code = status_code
        self.message = message
        self.response_body = response_body
        super().__init__(f"Edge API error {status_code}: {message}")


class EdgeClient:
    SM4_KEY = os.getenv("EDGE_SM4_KEY", "a16bc20453da220f").encode()
    BLOCK_SIZE = 16

    def __init__(self, cluster_id: int, db: "Session", node_ip: str | None = None, node_port: int | None = None):
        self.cluster_id = cluster_id
        self.db = db

        if node_ip and node_port:
            self.edge_url = f"http://{node_ip}:{node_port}"
        else:
            self._resolve_edge_url()

        self._resolve_api_key()

    def _resolve_edge_url(self) -> None:
        from app.models.cluster import Node

        node = (
            self.db.query(Node)
            .filter(Node.cluster_id == self.cluster_id, Node.status == 1)
            .first()
        )
        if not node:
            raise EdgeConnectionError(f"No active node found for cluster {self.cluster_id}")

        self.edge_url = f"http://{node.ip}:{node.management_port}"

    def _resolve_api_key(self) -> None:
        """Resolve API key from environment variable."""
        api_key = os.getenv("EDGE_ADMIN_KEY", "f9357106bff442f89d4de7169c37c61e")
        self.api_key = api_key

    def _pkcs7_pad(self, data: bytes) -> bytes:
        """Apply PKCS7 padding to data."""
        padding_length = self.BLOCK_SIZE - (len(data) % self.BLOCK_SIZE)
        return data + bytes([padding_length] * padding_length)

    def _pkcs7_unpad(self, data: bytes) -> bytes:
        """Remove PKCS7 padding from data."""
        if not data:
            raise EdgeEncryptionError("Empty data after decryption")
        padding_length = data[-1]
        if padding_length > self.BLOCK_SIZE or padding_length == 0:
            raise EdgeEncryptionError(f"Invalid PKCS7 padding length: {padding_length}")
        return data[:-padding_length]

    def _encrypt(self, data: bytes) -> str:
        """
        Encrypt data using SM4 ECB mode with PKCS7 padding.

        Args:
            data: Raw bytes to encrypt

        Returns:
            Base64 encoded encrypted string
        """
        try:
            padded_data = self._pkcs7_pad(data)
            cipher = Cipher(
                algorithms.SM4(self.SM4_KEY),
                modes.ECB(),
                backend=default_backend()
            )
            encryptor = cipher.encryptor()
            encrypted = encryptor.update(padded_data) + encryptor.finalize()
            return base64.b64encode(encrypted).decode()
        except Exception as e:
            raise EdgeEncryptionError(f"Encryption failed: {e}") from e

    def _decrypt(self, data: str) -> bytes:
        """
        Decrypt data using SM4 ECB mode with PKCS7 unpadding.

        Args:
            data: Base64 encoded encrypted string

        Returns:
            Decrypted raw bytes
        """
        try:
            encrypted = base64.b64decode(data)
            cipher = Cipher(
                algorithms.SM4(self.SM4_KEY),
                modes.ECB(),
                backend=default_backend()
            )
            decryptor = cipher.decryptor()
            decrypted = decryptor.update(encrypted) + decryptor.finalize()
            return self._pkcs7_unpad(decrypted)
        except Exception as e:
            raise EdgeEncryptionError(f"Decryption failed: {e}") from e

    def _request(
        self,
        method: str,
        path: str,
        body: dict | None = None
    ) -> dict[str, Any]:
        """
        Make an encrypted request to the edge server.

        Args:
            method: HTTP method (GET, POST, PUT, PATCH, DELETE)
            path: API path (e.g., /edge/admin/upstreams)
            body: Request body dict (will be encrypted and sent as JSON string)

        Returns:
            Decrypted response dictionary
        """
        import httpx

        headers = {
            "X-API-KEY": self.api_key,
            "Content-Type": "application/json"
        }

        url = f"{self.edge_url}{path}"

        try:
            if method == "GET":
                response = httpx.get(url, headers=headers, timeout=30.0, trust_env=False)
            elif method == "POST":
                encrypted_body = self._encrypt(json.dumps(body).encode())
                response = httpx.post(url, headers=headers, content=encrypted_body, timeout=30.0, trust_env=False)
            elif method == "PUT":
                encrypted_body = self._encrypt(json.dumps(body).encode())
                response = httpx.put(url, headers=headers, content=encrypted_body, timeout=30.0, trust_env=False)
            elif method == "PATCH":
                encrypted_body = self._encrypt(json.dumps(body).encode())
                response = httpx.patch(url, headers=headers, content=encrypted_body, timeout=30.0, trust_env=False)
            elif method == "DELETE":
                response = httpx.delete(url, headers=headers, timeout=30.0, trust_env=False)
            else:
                raise ValueError(f"Unsupported HTTP method: {method}")
        except httpx.TimeoutException as e:
            raise EdgeConnectionError(f"Request to {url} timed out: {e}") from e
        except httpx.ConnectError as e:
            raise EdgeConnectionError(f"Failed to connect to {url}: {e}") from e

        if response.status_code not in (200, 201, 204):
            try:
                error_data = json.loads(response.text)
                raise EdgeAPIError(
                    response.status_code,
                    error_data.get("error_msg", "Unknown error"),
                    error_data
                )
            except json.JSONDecodeError:
                try:
                    error_body = self._decrypt(response.text)
                    error_data = json.loads(error_body)
                    raise EdgeAPIError(
                        response.status_code,
                        error_data.get("error_msg", "Unknown error"),
                        error_data
                    )
                except EdgeEncryptionError:
                    raise EdgeAPIError(response.status_code, response.text)

        if response.status_code == 204 or not response.text:
            return {}

        try:
            decrypted = self._decrypt(response.text)
            return json.loads(decrypted)
        except EdgeEncryptionError:
            return {"raw_response": response.text}

    # Upstream API methods

    def get_upstream(self, upstream_id: str) -> dict[str, Any]:
        """Get a single upstream by ID."""
        return self._request("GET", f"/edge/admin/upstreams/{upstream_id}")

    def list_upstreams(self) -> dict[str, Any]:
        """List all upstreams."""
        return self._request("GET", "/edge/admin/upstreams")

    def create_upstream(self, data: dict[str, Any]) -> dict[str, Any]:
        """Create a new upstream."""
        return self._request("POST", "/edge/admin/upstreams", data)

    def update_upstream(self, upstream_id: str, data: dict[str, Any]) -> dict[str, Any]:
        """Update an existing upstream by ID."""
        return self._request("PUT", f"/edge/admin/upstreams/{upstream_id}", data)

    def delete_upstream(self, upstream_id: str) -> dict[str, Any]:
        """Delete an upstream by ID."""
        return self._request("DELETE", f"/edge/admin/upstreams/{upstream_id}")

    def patch_upstream(
        self,
        upstream_id: str,
        data: dict[str, Any],
        path: str | None = None
    ) -> dict[str, Any]:
        """
        Partially update an upstream.

        Args:
            upstream_id: The upstream ID
            data: Partial update data
            path: Optional sub-path for targeted updates
        """
        if path:
            return self._request("PATCH", f"/edge/admin/upstreams/{upstream_id}/{path}", data)
        return self._request("PATCH", f"/edge/admin/upstreams/{upstream_id}", data)

    @staticmethod
    def convert_upstream_to_edge_format(
        upstream_id: int,
        name: str,
        load_balance: str,
        targets: list[dict]
    ) -> dict[str, Any]:
        type_mapping = {
            "weighted_roundrobin": "roundrobin",
            "chash": "chash",
            "ewma": "ewma",
            "least_conn": "least_conn",
            "roundrobin": "roundrobin",
        }
        upstream_type = type_mapping.get(load_balance, "roundrobin")

        edge_nodes = {}
        for t in targets:
            edge_nodes[t["target"]] = t.get("weight", 1)

        return {
            "type": upstream_type,
            "name": name,
            "nodes": edge_nodes,
        }