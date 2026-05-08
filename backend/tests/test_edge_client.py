import pytest
from unittest.mock import MagicMock, patch, mock_open
from app.services.edge_client import EdgeConnectionError, EdgeEncryptionError, EdgeAPIError, EdgeClient


class TestEdgeClientEncryption:
    def setup_method(self):
        pass

    def test_pkcs7_pad(self):
        client = object.__new__(EdgeClient)
        client.BLOCK_SIZE = 16

        data = b"short"
        padded = client._pkcs7_pad(data)

        assert len(padded) % 16 == 0
        assert padded != data

    def test_pkcs7_unpad(self):
        client = object.__new__(EdgeClient)
        client.BLOCK_SIZE = 16

        original = b"original data"
        padded = client._pkcs7_pad(original)
        unpadded = client._pkcs7_unpad(padded)

        assert unpadded == original

    def test_encrypt_returns_base64_string(self):
        client = object.__new__(EdgeClient)
        client.SM4_KEY = b"a16bc20453da220f"
        client.BLOCK_SIZE = 16

        result = client._encrypt(b"test data")

        assert isinstance(result, str)
        assert len(result) > 0

    def test_decrypt_returns_original_bytes(self):
        client = object.__new__(EdgeClient)
        client.SM4_KEY = b"a16bc20453da220f"
        client.BLOCK_SIZE = 16

        original_data = b"test data"
        encrypted = client._encrypt(original_data)
        decrypted = client._decrypt(encrypted)

        assert decrypted == original_data

    def test_encrypt_decrypt_json_data(self):
        client = object.__new__(EdgeClient)
        client.SM4_KEY = b"a16bc20453da220f"
        client.BLOCK_SIZE = 16

        original_data = b'{"key": "value", "number": 123}'
        encrypted = client._encrypt(original_data)
        decrypted = client._decrypt(encrypted)

        assert decrypted == original_data


class TestEdgeClientConvertFormat:
    def test_convert_weighted_roundrobin(self):
        result = EdgeClient.convert_upstream_to_edge_format(
            upstream_id=1,
            name="test-upstream",
            load_balance="weighted_roundrobin",
            targets=[{"target": "127.0.0.1:1980", "weight": 100}]
        )

        assert result["type"] == "roundrobin"
        assert result["name"] == "test-upstream"
        assert result["nodes"] == {"127.0.0.1:1980": 100}

    def test_convert_chash(self):
        result = EdgeClient.convert_upstream_to_edge_format(
            upstream_id=2,
            name="chash-upstream",
            load_balance="chash",
            targets=[{"target": "127.0.0.1:1981", "weight": 50}]
        )

        assert result["type"] == "chash"
        assert result["nodes"] == {"127.0.0.1:1981": 50}

    def test_convert_multiple_targets(self):
        result = EdgeClient.convert_upstream_to_edge_format(
            upstream_id=3,
            name="multi-target",
            load_balance="roundrobin",
            targets=[
                {"target": "127.0.0.1:1980", "weight": 100},
                {"target": "127.0.0.1:1981", "weight": 200}
            ]
        )

        assert result["nodes"] == {"127.0.0.1:1980": 100, "127.0.0.1:1981": 200}


class TestEdgeClientExceptions:
    def test_edge_connection_error(self):
        err = EdgeConnectionError("test message")
        assert str(err) == "test message"

    def test_edge_encryption_error(self):
        err = EdgeEncryptionError("encryption failed")
        assert str(err) == "encryption failed"

    def test_edge_api_error(self):
        err = EdgeAPIError(400, "bad request", {"error": "details"})
        assert err.status_code == 400
        assert err.message == "bad request"
        assert err.response_body == {"error": "details"}


class TestEdgeLogger:
    def test_log_creates_directory(self):
        import os
        import tempfile
        from app.services.edge_logger import EdgeLogger, reset_edge_logger

        with tempfile.TemporaryDirectory() as tmpdir:
            reset_edge_logger()
            logger = EdgeLogger()
            logger.LOG_DIR = os.path.join(tmpdir, "logs", "edge")
            logger.LOG_FILE = os.path.join(logger.LOG_DIR, "upstream.log")
            os.makedirs(logger.LOG_DIR, exist_ok=True)

            logger.log_edge_operation(
                cluster_id=1,
                cluster_name="test-cluster",
                upstream_id=100,
                upstream_name="test-upstream",
                method="POST",
                path="/edge/admin/upstreams",
                request_body={"type": "roundrobin"},
                encrypted_body="abc123",
                response_status=201,
                response_body={"action": "create"},
                status="SUCCESS"
            )

            assert os.path.exists(logger.LOG_FILE)
            with open(logger.LOG_FILE, "r", encoding="utf-8") as f:
                content = f.read()
                assert "test-cluster" in content
                assert "test-upstream" in content
                assert "SUCCESS" in content

    def test_log_error_entry(self):
        import os
        import tempfile
        from app.services.edge_logger import EdgeLogger, reset_edge_logger

        with tempfile.TemporaryDirectory() as tmpdir:
            reset_edge_logger()
            logger = EdgeLogger()
            logger.LOG_DIR = os.path.join(tmpdir, "logs", "edge")
            logger.LOG_FILE = os.path.join(logger.LOG_DIR, "upstream.log")
            os.makedirs(logger.LOG_DIR, exist_ok=True)

            logger.log_edge_operation(
                cluster_id=1,
                cluster_name="test-cluster",
                upstream_id=100,
                upstream_name="test-upstream",
                method="POST",
                path="/edge/admin/upstreams",
                request_body={"type": "roundrobin"},
                encrypted_body=None,
                response_status=None,
                response_body=None,
                status="FAILED",
                error="Connection timeout"
            )

            with open(logger.LOG_FILE, "r", encoding="utf-8") as f:
                content = f.read()
                assert "FAILED" in content
                assert "Connection timeout" in content