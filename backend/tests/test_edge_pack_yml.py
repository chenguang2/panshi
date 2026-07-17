"""Tests for edge_pack_list/add/rebase ansible tasks."""
import yaml
from pathlib import Path

TASKS_DIR = Path(__file__).parent.parent / "ansible" / "roles" / "edge" / "tasks"


class TestEdgePackListYml:

    TASK_PATH = TASKS_DIR / "edge_pack_list.yml"

    def test_file_exists(self):
        assert self.TASK_PATH.is_file()

    def test_valid_yaml(self):
        content = self.TASK_PATH.read_text()
        data = yaml.safe_load(content)
        assert data is not None
        assert isinstance(data, list)

    def test_uses_pack_list_command(self):
        content = self.TASK_PATH.read_text()
        assert "pack-list" in content

    def test_uses_edge_target(self):
        content = self.TASK_PATH.read_text()
        assert "edge_target" in content

    def test_has_edge_pack_list_tag(self):
        content = self.TASK_PATH.read_text()
        assert "edge_pack_list" in content


class TestEdgePackAddYml:

    TASK_PATH = TASKS_DIR / "edge_pack_add.yml"

    def test_file_exists(self):
        assert self.TASK_PATH.is_file()

    def test_valid_yaml(self):
        content = self.TASK_PATH.read_text()
        data = yaml.safe_load(content)
        assert data is not None
        assert isinstance(data, list)

    def test_has_copy_step(self):
        content = self.TASK_PATH.read_text()
        assert "copy" in content.lower() or "copy:" in content

    def test_has_pack_add_command(self):
        content = self.TASK_PATH.read_text()
        assert "pack-add" in content or "pack_add" in content

    def test_has_edge_pack_add_tag(self):
        content = self.TASK_PATH.read_text()
        assert "edge_pack_add" in content


class TestEdgePackRebaseYml:

    TASK_PATH = TASKS_DIR / "edge_pack_rebase.yml"

    def test_file_exists(self):
        assert self.TASK_PATH.is_file()

    def test_valid_yaml(self):
        content = self.TASK_PATH.read_text()
        data = yaml.safe_load(content)
        assert data is not None
        assert isinstance(data, list)

    def test_has_pack_rebase_command(self):
        content = self.TASK_PATH.read_text()
        assert "pack-rebase" in content

    def test_has_edge_init(self):
        content = self.TASK_PATH.read_text()
        assert "edge init" in content

    def test_has_edge_reload(self):
        content = self.TASK_PATH.read_text()
        assert "edge reload" in content

    def test_has_edge_pack_rebase_tag(self):
        content = self.TASK_PATH.read_text()
        assert "edge_pack_rebase" in content
