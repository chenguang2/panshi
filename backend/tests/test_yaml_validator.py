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
