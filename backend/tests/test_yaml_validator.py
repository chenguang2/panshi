"""Tests for YAML validation utility (TDD)."""
import pytest
from app.utils.yaml_validator import validate_yaml


class TestValidateYaml:

    def test_valid_yaml(self):
        valid = """
deploy:
  prefix: edge
  http:
    edge:
      listen:
        - addr: 0.0.0.0:9980
ex_plugins:
  plugin_demo: true
"""
        ok, error = validate_yaml(valid)
        assert ok is True
        assert error is None

    def test_valid_minimal_yaml(self):
        ok, error = validate_yaml("key: value\n")
        assert ok is True
        assert error is None

    def test_invalid_yaml_bad_indent(self):
        invalid = "deploy:\n  prefix: edge\n  http:\n    edge:\n      listen:\n  - addr: 0.0.0.0:9980\n"
        ok, error = validate_yaml(invalid)
        assert ok is False
        assert error is not None

    def test_invalid_yaml_tab_instead_of_space(self):
        invalid = "key:\n  sub:\n\tvalue: x\n"
        ok, error = validate_yaml(invalid)
        assert ok is False
        assert error is not None

    def test_invalid_yaml_garbage(self):
        invalid = "<<<<>>>>\n{{{{::::\n"
        ok, error = validate_yaml(invalid)
        assert ok is False
        assert error is not None

    def test_empty_string(self):
        ok, error = validate_yaml("")
        assert ok is False
        assert error is not None

    def test_valid_complex_edge_env(self):
        """Test with a realistic edge.env-like content."""
        content = """deploy:
  prefix: edge
  worksite: edge_app
  http:
    edge:
      listen:
        - addr: 0.0.0.0:9980
    admin:
      listen:
        - addr: 0.0.0.0:9990
  NOstream:
    edge:
      listen:
        - addr: 0.0.0.0:9970
ex_plugins:
  log_process: false
ex_stream_plugins:
  log_process: false
plugin_attr:
  log_rotate:
    interval: 1h
    rotate: 6
"""
        ok, error = validate_yaml(content)
        assert ok is True
        assert error is None

    def test_error_message_contains_line_number(self):
        invalid = "key: {unclosed: true\n"
        ok, error = validate_yaml(invalid)
        assert ok is False
        assert error is not None
        assert "line" in error.lower() or "column" in error.lower()


# ── validate_edge_env fields ─────────────────────────────────────────

from app.utils.yaml_validator import validate_edge_env


class TestValidateEdgeEnv:

    def test_valid_full_config(self):
        content = """deploy:
  prefix: edge
  http:
    edge:
      listen:
        - addr: 0.0.0.0:9980
    admin:
      listen:
        - addr: 0.0.0.0:9990
"""
        ok, err = validate_edge_env(content)
        assert ok is True
        assert err is None

    def test_missing_deploy(self):
        content = """http:
  edge:
    listen:
      - addr: 0.0.0.0:9980
"""
        ok, err = validate_edge_env(content)
        assert ok is False
        assert "deploy" in err.lower()

    def test_missing_deploy_http(self):
        content = """deploy:
  prefix: edge
"""
        ok, err = validate_edge_env(content)
        assert ok is False
        assert "http" in err.lower()

    def test_missing_edge_listen(self):
        content = """deploy:
  prefix: edge
  http:
    admin:
      listen:
        - addr: 0.0.0.0:9990
"""
        ok, err = validate_edge_env(content)
        assert ok is False
        assert "edge" in err.lower() and "listen" in err.lower()

    def test_missing_admin_listen(self):
        content = """deploy:
  prefix: edge
  http:
    edge:
      listen:
        - addr: 0.0.0.0:9980
"""
        ok, err = validate_edge_env(content)
        assert ok is False
        assert "admin" in err.lower() and "listen" in err.lower()

    def test_empty_listen_should_fail(self):
        content = """deploy:
  prefix: edge
  http:
    edge:
      listen: []
    admin:
      listen:
        - addr: 0.0.0.0:9990
"""
        ok, err = validate_edge_env(content)
        assert ok is False
        assert "listen" in err.lower()


# ── listen 条目端口合法性（edge-env-port-validation）──────────────────

REALISTIC_V32_SAMPLE = """deploy:
  prefix: edge
  worksite: edge_app
  http:
    edge:
      listen:
        - addr: 0.0.0.0:16610
        - addr: 0.0.0.0:50000
          ssl: true
        - addr: 0.0.0.0:55000
          ssl: true
        #- addr: 0.0.0.0:9943
    admin:
      listen:
        - addr: 0.0.0.0:16620
  NOstream:
    edge:
      listen:
        - addr: unix:conf/edge_stream_monitor.sock
ex_plugins:
  log_process: false
"""


def _content_with_edge_port(port_line: str) -> str:
    return f"""deploy:
  prefix: edge
  http:
    edge:
      listen:
        - addr: {port_line}
    admin:
      listen:
        - addr: 0.0.0.0:16620
"""


class TestListenPortValidation:
    """listen 条目端口须为 1-65535 整数；unix: 与无 addr 键条目跳过。"""

    @pytest.mark.parametrize(
        "addr",
        [
            "0.0.0.0:99999",  # 2026-10-22 实测事故向量
            "0.0.0.0:0",
            "0.0.0.0:-1",
            "0.0.0.0:abc",
            '"0.0.0.0:"',  # YAML 裸写为语法错误，经引号落到端口层
            "0.0.0.0",  # 无端口
        ],
    )
    def test_invalid_port_rejected(self, addr):
        ok, err = validate_edge_env(_content_with_edge_port(addr))
        assert ok is False
        assert err is not None
        assert "deploy → http → edge → listen" in err
        assert "第 1 项" in err
        assert "1-65535" in err
        assert addr.strip('"') in err

    @pytest.mark.parametrize("port", ["1", "65535", "8080"])
    def test_valid_port_boundaries_pass(self, port):
        ok, err = validate_edge_env(_content_with_edge_port(f"0.0.0.0:{port}"))
        assert ok is True, err
        assert err is None

    def test_admin_listen_port_also_validated(self):
        content = """deploy:
  prefix: edge
  http:
    edge:
      listen:
        - addr: 0.0.0.0:16610
    admin:
      listen:
        - addr: 0.0.0.0:99999
"""
        ok, err = validate_edge_env(content)
        assert ok is False
        assert "deploy → http → admin → listen" in err

    def test_second_item_index_reported(self):
        content = """deploy:
  prefix: edge
  http:
    edge:
      listen:
        - addr: 0.0.0.0:16610
        - addr: 0.0.0.0:70000
    admin:
      listen:
        - addr: 0.0.0.0:16620
"""
        ok, err = validate_edge_env(content)
        assert ok is False
        assert "第 2 项" in err

    def test_unix_addr_skipped(self):
        content = """deploy:
  prefix: edge
  http:
    edge:
      listen:
        - addr: unix:conf/edge_stream_monitor.sock
    admin:
      listen:
        - addr: 0.0.0.0:16620
"""
        ok, err = validate_edge_env(content)
        assert ok is True, err

    def test_plain_string_entry_validated(self):
        content = """deploy:
  prefix: edge
  http:
    edge:
      listen:
        - 0.0.0.0:99999
    admin:
      listen:
        - addr: 0.0.0.0:16620
"""
        ok, err = validate_edge_env(content)
        assert ok is False
        assert "0.0.0.0:99999" in err

    def test_dict_without_addr_skipped(self):
        content = """deploy:
  prefix: edge
  http:
    edge:
      listen:
        - ssl: true
        - addr: 0.0.0.0:16610
    admin:
      listen:
        - addr: 0.0.0.0:16620
"""
        ok, err = validate_edge_env(content)
        assert ok is True, err

    def test_realistic_v32_content_passes(self):
        """护栏：实机真实结构（ssl 条目/注释条目/unix 块）不得误伤。"""
        ok, err = validate_edge_env(REALISTIC_V32_SAMPLE)
        assert ok is True, err
