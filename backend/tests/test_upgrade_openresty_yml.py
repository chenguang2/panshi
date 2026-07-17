"""Tests for upgrade_openresty.yml ansible task."""
import yaml
from pathlib import Path


TASK_PATH = Path(__file__).parent.parent / "ansible" / "roles" / "edge" / "tasks" / "upgrade_openresty.yml"


class TestUpgradeOpenrestyYml:

    def test_file_exists(self):
        """upgrade_openresty.yml should exist."""
        assert TASK_PATH.is_file(), f"File not found: {TASK_PATH}"

    def test_valid_yaml(self):
        """File should be valid YAML."""
        content = TASK_PATH.read_text()
        data = yaml.safe_load(content)
        assert data is not None, "YAML content is None"
        assert isinstance(data, list), "Expected a list of tasks"

    def test_uses_manager_upgrade(self):
        """Task should use 'manager upgrade' command."""
        content = TASK_PATH.read_text()
        assert "manager upgrade" in content, (
            "Expected 'manager upgrade' in the task command"
        )

    def test_uses_edge_target(self):
        """Task should use edge_target variable instead of hardcoded uap-edge."""
        content = TASK_PATH.read_text()
        assert "edge_target" in content, (
            "Expected 'edge_target' variable in task (no hardcoded uap-edge)"
        )

    def test_no_hardcoded_uap_edge(self):
        """Task should NOT hardcode 'uap-edge' as the dir name."""
        content = TASK_PATH.read_text()
        # The only allowed occurrence is in comments or as example values
        # but NOT in the shell command as the directory name
        assert "}}uap-edge" not in content, (
            "Found hardcoded 'uap-edge' appended directly after variable"
        )

    def test_has_upgrade_openresty_tag(self):
        """Task should have the upgrade_openresty tag."""
        content = TASK_PATH.read_text()
        assert "upgrade_openresty" in content, (
            "Expected 'upgrade_openresty' tag in task"
        )
