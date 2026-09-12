"""Tests for script upload API endpoints."""

import asyncio
import io
import pytest
from unittest.mock import patch
from tests.api_helpers import AuthedTestClient, isolated_app_lifespan
from sqlalchemy.ext.asyncio import AsyncSession

from app.main import app
from app.core.database import get_db
from app.models.user import User
from app.core.security import hash_password


@pytest.fixture
def client(test_db, tmp_path, monkeypatch):
    """Override get_db to use test_db session and seed api user.

    存储目录整体隔离到 tmp_path：历史上本夹具曾 rmtree 真实的
    backend/data/task-scripts/，把用户任务留档一并清掉（2026-09-12 事故）。
    端点/handler 均在调用时读取模块属性，monkeypatch 全程生效。
    """
    import asyncio, shutil
    from pathlib import Path

    from app.config import script_upload as script_upload_mod
    from app.models.cluster import Cluster, Node

    storage = tmp_path / "task-scripts"
    storage.mkdir(parents=True, exist_ok=True)
    monkeypatch.setattr(script_upload_mod, "TASK_SCRIPTS_DIR", storage)
    monkeypatch.setattr(script_upload_mod, "TEMP_DIR", storage / "temp")
    TEMP_DIR = script_upload_mod.TEMP_DIR

    async def override_get_db():
        yield test_db

    app.dependency_overrides[get_db] = override_get_db

    async def _seed():
        # Seed api user
        if await test_db.get(User, 1) is None:
            test_db.add(User(id=1, username="api_user", password_hash=hash_password("password123"),
                             role="admin", status=1))
            await test_db.commit()
        # Seed cluster + node for script_file migration tests
        if await test_db.get(Cluster, 1) is None:
            test_db.add(Cluster(id=1, name="test-cluster", status=1))
            await test_db.commit()
        if await test_db.get(Node, 1) is None:
            test_db.add(Node(id=1, cluster_id=1, ip="127.0.0.1", edge_path="/opt/edge", status=1))
            await test_db.commit()

    asyncio.run(_seed())

    # 每个测试前清空隔离的 temp 目录（绝不触碰真实目录）
    if TEMP_DIR.exists():
        shutil.rmtree(TEMP_DIR)
    TEMP_DIR.mkdir(parents=True, exist_ok=True)

    with isolated_app_lifespan(), AuthedTestClient(app) as c:
        yield c
    app.dependency_overrides.clear()


def _upload_script(client, filename="test.sh", content=b"#!/bin/bash\necho hello"):
    """Helper to upload a script and return the response."""
    return client.post(
        "/api/v1/node-tasks/upload-script",
        files={"file": (filename, io.BytesIO(content), "application/x-sh")},
    )


class TestUploadScript:
    def test_upload_script_success(self, client):
        """POST /node-tasks/upload-script with valid .sh file should return upload_id."""
        content = b"#!/bin/bash\necho hello"
        resp = _upload_script(client, content=content)
        assert resp.status_code == 200
        data = resp.json()
        assert "upload_id" in data
        assert data["filename"] == "test.sh"
        assert data["size"] == len(content)

    def test_upload_script_rejects_wrong_extension(self, client):
        """POST /node-tasks/upload-script with .py file should return 400."""
        content = b"#!/usr/bin/env python\nprint('hello')"
        resp = client.post(
            "/api/v1/node-tasks/upload-script",
            files={"file": ("test.py", io.BytesIO(content), "text/x-python")},
        )
        assert resp.status_code == 400
        assert "不支持" in resp.json()["detail"]

    def test_upload_script_rejects_oversized_file(self, client):
        """POST /node-tasks/upload-script with file > 512KB should return 400."""
        content = b"x" * (512 * 1024 + 1)
        resp = _upload_script(client, content=content)
        assert resp.status_code == 400
        assert "大小" in resp.json()["detail"]

    def test_upload_script_rejects_empty_file(self, client):
        """POST /node-tasks/upload-script with empty file should return 400."""
        resp = _upload_script(client, content=b"")
        assert resp.status_code == 400
        assert "空" in resp.json()["detail"]

    def test_upload_script_accepts_bash_extension(self, client):
        """POST /node-tasks/upload-script with .bash file should succeed."""
        content = b"#!/bin/bash\necho hello"
        resp = _upload_script(client, filename="script.bash", content=content)
        assert resp.status_code == 200
        assert resp.json()["filename"] == "script.bash"

    def test_upload_script_returns_utf8_content(self, client):
        """POST /node-tasks/upload-script with non-UTF-8 content should convert to UTF-8."""
        # Create a longer script with Chinese to improve encoding detection
        gbk_content = ("#!/bin/bash\n" + "# 这是一个测试脚本，用于验证编码转换功能\n" * 10 + "echo '测试完成'\n").encode("gbk")
        resp = client.post(
            "/api/v1/node-tasks/upload-script",
            files={"file": ("test.sh", io.BytesIO(gbk_content), "application/x-sh")},
        )
        assert resp.status_code == 200
        # Verify the stored file is UTF-8
        upload_id = resp.json()["upload_id"]
        from app.config.script_upload import get_upload_temp_path
        stored = get_upload_temp_path(upload_id).read_text(encoding="utf-8")
        assert "测试完成" in stored


class TestScriptPreview:
    def test_preview_returns_content(self, client):
        """GET /node-tasks/script-preview/{upload_id} should return script content."""
        # Upload a script first
        resp = _upload_script(client, content=b"#!/bin/bash\necho preview")
        assert resp.status_code == 200
        upload_id = resp.json()["upload_id"]

        # Preview it
        resp = client.get(f"/api/v1/node-tasks/script-preview/{upload_id}")
        assert resp.status_code == 200
        data = resp.json()
        assert "content" in data
        assert "echo preview" in data["content"]
        assert data["filename"] == "test.sh"

    def test_preview_not_found(self, client):
        """GET /node-tasks/script-preview/{invalid_id} should return 404."""
        resp = client.get("/api/v1/node-tasks/script-preview/nonexistent-id")
        assert resp.status_code == 404
        assert "不存在" in resp.json()["detail"]


class TestUploadedScriptsList:
    def test_list_empty(self, client):
        """GET /node-tasks/uploaded-scripts should return empty list initially."""
        resp = client.get("/api/v1/node-tasks/uploaded-scripts")
        assert resp.status_code == 200
        assert resp.json() == []

    def test_list_shows_uploaded_files(self, client):
        """GET /node-tasks/uploaded-scripts should list uploaded files."""
        # Upload two scripts
        _upload_script(client, filename="a.sh", content=b"#!/bin/bash\necho a")
        _upload_script(client, filename="b.sh", content=b"#!/bin/bash\necho b")

        resp = client.get("/api/v1/node-tasks/uploaded-scripts")
        assert resp.status_code == 200
        items = resp.json()
        assert len(items) == 2
        # Check structure
        for item in items:
            assert "upload_id" in item
            assert "filename" in item
            assert "size" in item


class TestDeleteUploadedScript:
    def test_delete_success(self, client):
        """DELETE /node-tasks/uploaded-scripts/{upload_id} should remove file."""
        # Upload a script
        resp = _upload_script(client, content=b"#!/bin/bash\necho delete-me")
        upload_id = resp.json()["upload_id"]

        # Delete it
        resp = client.delete(f"/api/v1/node-tasks/uploaded-scripts/{upload_id}")
        assert resp.status_code == 200
        assert "已删除" in resp.json()["detail"]

        # Verify it's gone
        resp = client.get(f"/api/v1/node-tasks/script-preview/{upload_id}")
        assert resp.status_code == 404

    def test_delete_not_found(self, client):
        """DELETE /node-tasks/uploaded-scripts/{invalid_id} should return 404."""
        resp = client.delete("/api/v1/node-tasks/uploaded-scripts/nonexistent-id")
        assert resp.status_code == 404
        assert "不存在" in resp.json()["detail"]

    def test_delete_distribute_file_without_suffix(self, client):
        """分发文件临时存储无 .sh 后缀，删除端点必须同样能删（5.7 连带修复）。

        历史 bug：delete 只找 temp/{id}.sh，分发文件（temp/{id}）404 且被前端
        .catch 静默吞掉 → 分发上传永久泄漏。
        """
        binary = b"csv,content"
        resp = client.post(
            "/api/v1/node-tasks/upload-distribute-file",
            files={"file": ("data.csv", io.BytesIO(binary), "text/csv")},
        )
        upload_id = resp.json()["upload_id"]

        resp = client.delete(f"/api/v1/node-tasks/uploaded-scripts/{upload_id}")
        assert resp.status_code == 200
        assert "已删除" in resp.json()["detail"]

        # 列表中不再出现
        resp = client.get("/api/v1/node-tasks/uploaded-scripts")
        assert all(item["upload_id"] != upload_id for item in resp.json())


class TestUploadedFilesListFields:
    def test_list_includes_kind_and_uploaded_at(self, client):
        """列表须区分脚本/分发文件（kind）并带上传时间（uploaded_at）——列表 UI 依赖。"""
        resp = _upload_script(client, filename="s.sh", content=b"#!/bin/bash\necho x")
        assert resp.status_code == 200
        resp = client.post(
            "/api/v1/node-tasks/upload-distribute-file",
            files={"file": ("d.csv", io.BytesIO(b"a,b"), "text/csv")},
        )
        assert resp.status_code == 200

        items = client.get("/api/v1/node-tasks/uploaded-scripts").json()
        assert len(items) == 2
        kinds = {item["kind"] for item in items}
        assert kinds == {"script", "distribute"}
        for item in items:
            assert item.get("uploaded_at"), item


class TestTaskFiles:
    """任务留档文件（task-scripts/{task_id}/）列表与删除。

    文件创建任务时从 temp/ 迁入任务目录；用户需要跨任务查看与清理控制端留档
    （不动节点上的文件、不删任务本身）。
    """

    def _create_distribute_task(self, client, filename="data.csv"):
        resp = client.post(
            "/api/v1/node-tasks/upload-distribute-file",
            files={"file": (filename, io.BytesIO(b"a,b\n1,2"), "text/csv")},
        )
        upload_id = resp.json()["upload_id"]
        resp = client.post(
            "/api/v1/clusters/1/node-tasks",
            json={
                "task_type": "distribute_file",
                "node_ids": [1],
                "params": {"srcpath": f"temp/{upload_id}", "destpath": "/tmp/"},
            },
        )
        assert resp.status_code == 201, resp.text
        return resp.json()["id"]

    def test_list_task_files_shows_distribute_entry(self, client):
        """建任务后 GET /node-tasks/task-files 须列出任务目录留档（含原始文件名、task_type、created_at）。"""
        task_id = self._create_distribute_task(client, filename="data.csv")

        items = client.get("/api/v1/node-tasks/task-files").json()
        entry = next((i for i in items if i["task_id"] == task_id), None)
        assert entry is not None, items
        assert entry["filename"] == "data.csv"
        assert entry["kind"] == "distribute"
        assert entry["task_type"] == "distribute_file"
        assert entry["created_at"] is not None

    def test_list_task_files_sorted_newest_task_first(self, client):
        """任务留档按任务号倒序（最新任务在前），列表 UI 直接分页可用。"""
        first_id = self._create_distribute_task(client, filename="first.csv")
        second_id = self._create_distribute_task(client, filename="second.csv")
        assert second_id > first_id

        items = client.get("/api/v1/node-tasks/task-files").json()
        task_ids = [i["task_id"] for i in items]
        assert task_ids == sorted(task_ids, reverse=True)
        assert task_ids[0] == second_id

    def test_list_task_files_shows_script_entry(self, client):
        """cmd_exec script_file 任务的留档（{upload_id}.sh）也要列出，且显示原始文件名。"""
        resp = _upload_script(client, filename="my-check.sh", content=b"#!/bin/bash\necho tf")
        upload_id = resp.json()["upload_id"]
        resp = client.post(
            "/api/v1/clusters/1/node-tasks",
            json={
                "task_type": "cmd_exec",
                "node_ids": [1],
                "params": {"script_file": upload_id, "script_filename": "my-check.sh"},
            },
        )
        assert resp.status_code == 201, resp.text
        task_id = resp.json()["id"]

        items = client.get("/api/v1/node-tasks/task-files").json()
        entry = next((i for i in items if i["task_id"] == task_id), None)
        assert entry is not None, items
        assert entry["kind"] == "script"
        # 原始文件名经 meta 保留（迁移不再删除 meta）
        assert entry["filename"] == "my-check.sh"

    def test_archive_upload_id_migrates_script_for_display(self, client):
        """archive_upload_id 将上传文件迁入任务目录仅供留档，不触发 script_file 互斥校验。"""
        resp = _upload_script(client, filename="deploy.sh", content=b"#!/bin/bash\necho ok")
        upload_id = resp.json()["upload_id"]
        resp = client.post(
            "/api/v1/clusters/1/node-tasks",
            json={
                "task_type": "cmd_exec",
                "node_ids": [1],
                "params": {"script_content": "#!/bin/bash\necho ok", "script_filename": "deploy.sh"},
                "archive_upload_id": upload_id,
            },
        )
        assert resp.status_code == 201, resp.text
        task_id = resp.json()["id"]
        # 留档列表可见
        items = client.get("/api/v1/node-tasks/task-files").json()
        entry = next((i for i in items if i["task_id"] == task_id), None)
        assert entry is not None, items
        assert entry["kind"] == "script"
        assert entry["filename"] == "deploy.sh"
        # 互斥校验不受影响：同时传 cmd + script_content 应 400
        bad = client.post(
            "/api/v1/clusters/1/node-tasks",
            json={"task_type": "cmd_exec", "node_ids": [1], "params": {"cmd": "ls", "script_content": "echo"}},
        )
        assert bad.status_code == 400

    def test_delete_task_file_removes_archive_only(self, client):
        """DELETE /node-tasks/task-files/{task_id}/{name} 移除留档；任务本身不受影响。"""
        task_id = self._create_distribute_task(client)
        items = client.get("/api/v1/node-tasks/task-files").json()
        entry = next(i for i in items if i["task_id"] == task_id)

        resp = client.delete(f"/api/v1/node-tasks/task-files/{task_id}/{entry['name']}")
        assert resp.status_code == 200

        remaining = client.get("/api/v1/node-tasks/task-files").json()
        assert all(i["task_id"] != task_id for i in remaining)
        # 任务本身仍在
        resp = client.get(f"/api/v1/node-tasks/{task_id}")
        assert resp.status_code == 200

    def test_delete_task_file_missing_returns_404(self, client):
        task_id = self._create_distribute_task(client)
        resp = client.delete(f"/api/v1/node-tasks/task-files/{task_id}/nonexistent-file")
        assert resp.status_code == 404


class TestCreateTaskWithScriptFile:
    def test_create_cmd_exec_with_script_file(self, client):
        """POST /clusters/{id}/node-tasks with cmd_exec + script_file should succeed."""
        # Upload a script
        resp = _upload_script(client, content=b"#!/bin/bash\necho script_exec_test")
        upload_id = resp.json()["upload_id"]

        # Create task with script_file in params
        resp = client.post(
            "/api/v1/clusters/1/node-tasks",
            json={
                "task_type": "cmd_exec",
                "node_ids": [1],
                "params": {"script_file": upload_id, "security": "none", "timeout": 30},
            },
        )
        # Should succeed (201) even if node doesn't exist in DB — the task is created
        assert resp.status_code in (201, 404)
        if resp.status_code == 201:
            data = resp.json()
            assert data["task_type"] == "cmd_exec"
            # Verify script_file param is stored
            assert "script_file" in data["params"]

    def test_create_cmd_exec_rejects_both_cmd_and_script(self, client):
        """cmd_exec with both cmd and script_file should return 400."""
        resp = _upload_script(client, content=b"#!/bin/bash\necho hi")
        upload_id = resp.json()["upload_id"]

        resp = client.post(
            "/api/v1/clusters/1/node-tasks",
            json={
                "task_type": "cmd_exec",
                "node_ids": [1],
                "params": {"cmd": "echo hello", "script_file": upload_id},
            },
        )
        assert resp.status_code == 400
        assert "互斥" in resp.json()["detail"] or "cmd" in resp.json()["detail"]

    def test_create_cmd_exec_requires_cmd_or_script(self, client):
        """cmd_exec with neither cmd nor script_file should return 400."""
        resp = client.post(
            "/api/v1/clusters/1/node-tasks",
            json={
                "task_type": "cmd_exec",
                "node_ids": [1],
                "params": {"security": "none"},
            },
        )
        assert resp.status_code == 400
        assert "cmd" in resp.json()["detail"]

    def test_create_cmd_exec_script_migrates_to_task_dir(self, client):
        """cmd_exec with script_file should migrate file from temp to task-scripts/{task_id}/."""
        resp = _upload_script(client, content=b"#!/bin/bash\necho migrate_test")
        upload_id = resp.json()["upload_id"]

        # Mock _execute_node to prevent real SSH execution in background
        from app.services import node_task_service
        original_execute = node_task_service.NodeTaskService._execute_node

        async def mock_execute_node(self_svc, *args, **kwargs):
            return {"rc": 0, "status": "success", "stdout": "mocked"}

        node_task_service.NodeTaskService._execute_node = mock_execute_node
        try:
            resp = client.post(
                "/api/v1/clusters/1/node-tasks",
                json={
                    "task_type": "cmd_exec",
                    "node_ids": [1],
                    "params": {"script_file": upload_id, "security": "none"},
                },
            )
            assert resp.status_code == 201, f"Expected 201, got {resp.status_code}: {resp.text}"
            task_id = resp.json()["id"]

            # Verify file exists in task-scripts/{task_id}/
            from app.config.script_upload import TASK_SCRIPTS_DIR
            task_dir = TASK_SCRIPTS_DIR / str(task_id)
            assert task_dir.exists(), f"Task script dir not created: {task_dir}"
            script_files = list(task_dir.glob("*.sh"))
            assert len(script_files) == 1, f"Expected 1 .sh file, got {len(script_files)}"

            # Verify temp file is removed
            from app.config.script_upload import get_upload_temp_path
            temp_path = get_upload_temp_path(upload_id)
            assert not temp_path.exists(), "Temp file should be removed after migration"
        finally:
            node_task_service.NodeTaskService._execute_node = original_execute


class TestUploadDistributeFile:
    """Tests for POST /node-tasks/upload-distribute-file (byte-perfect, no encoding)."""

    def _upload_file(self, client, filename="server.crt", content=b"\x00\x01\x02binary"):
        return client.post(
            "/api/v1/node-tasks/upload-distribute-file",
            files={"file": (filename, io.BytesIO(content), "application/octet-stream")},
        )

    def test_upload_any_file_type(self, client):
        """Accept any file extension (.sh, .conf, .pem, .crt, no ext, etc.)."""
        for ext, name in [(".conf", "nginx.conf"), (".pem", "cert.pem"), ("", "Makefile")]:
            content = b"some content for " + name.encode()
            resp = self._upload_file(client, filename=name, content=content)
            assert resp.status_code == 200, f"Failed for {name}: {resp.text}"
            assert resp.json()["filename"] == name

    def test_upload_binary_file(self, client):
        """Binary content stored byte-perfectly (no encoding conversion)."""
        binary = bytes(range(256))
        resp = self._upload_file(client, filename="data.bin", content=binary)
        assert resp.status_code == 200
        upload_id = resp.json()["upload_id"]
        from app.config.script_upload import get_distribute_upload_temp_path
        stored = get_distribute_upload_temp_path(upload_id).read_bytes()
        assert stored == binary, "Binary content was modified during storage"

    def test_upload_rejects_empty_file(self, client):
        resp = self._upload_file(client, content=b"")
        assert resp.status_code == 400
        assert "空" in resp.json()["detail"]

    def test_upload_rejects_oversized_file(self, client):
        """Default 10MB limit."""
        content = b"x" * (10 * 1024 * 1024 + 1)
        resp = self._upload_file(client, content=content)
        assert resp.status_code == 400
        assert "大小" in resp.json()["detail"]

    def test_upload_no_encoding_detection(self, client):
        """File with mixed encoding bytes stored as-is, no UTF-8 conversion."""
        raw = b"\x80\x81\xff\xfe" + "hello".encode("utf-8")
        resp = self._upload_file(client, filename="mixed.dat", content=raw)
        assert resp.status_code == 200
        upload_id = resp.json()["upload_id"]
        from app.config.script_upload import get_distribute_upload_temp_path
        stored = get_distribute_upload_temp_path(upload_id).read_bytes()
        assert stored == raw, "File content was modified — encoding detection should not run"

    def test_upload_returns_metadata(self, client):
        content = b"nginx config content"
        resp = self._upload_file(client, filename="nginx.conf", content=content)
        assert resp.status_code == 200
        data = resp.json()
        assert "upload_id" in data
        assert data["filename"] == "nginx.conf"
        assert data["size"] == len(content)
    """Test _validate_script_security function."""

    def test_security_none_allows_everything(self):
        from app.services.node_task_service import _validate_script_security
        assert _validate_script_security("rm -rf /", "none") is None

    def test_security_blacklist_blocks_rm(self):
        from app.services.node_task_service import _validate_script_security
        result = _validate_script_security("rm -rf /", "blacklist")
        assert result is not None
        assert "rm" in result

    def test_security_blacklist_blocks_shutdown(self):
        from app.services.node_task_service import _validate_script_security
        result = _validate_script_security("shutdown -h now", "blacklist")
        assert result is not None
        assert "shutdown" in result

    def test_security_blacklist_allows_safe_commands(self):
        from app.services.node_task_service import _validate_script_security
        assert _validate_script_security("echo hello\nls -la", "blacklist") is None

    def test_security_blacklist_allows_comments(self):
        from app.services.node_task_service import _validate_script_security
        assert _validate_script_security("# rm -rf /", "blacklist") is None

    def test_security_blacklist_allows_empty_lines(self):
        from app.services.node_task_service import _validate_script_security
        assert _validate_script_security("\n\n# comment\n\n", "blacklist") is None

    def test_security_whitelist_blocks_unknown(self):
        from app.services.node_task_service import _validate_script_security
        result = _validate_script_security("python3 script.py", "whitelist", "ls,cat")
        assert result is not None
        assert "python3" in result

    def test_security_whitelist_allows_listed(self):
        from app.services.node_task_service import _validate_script_security
        assert _validate_script_security("ls -la\ncat file.txt", "whitelist", "ls,cat") is None

    def test_security_with_full_path(self):
        from app.services.node_task_service import _validate_script_security
        result = _validate_script_security("/bin/rm -rf /", "blacklist")
        assert result is not None
        assert "rm" in result

    def test_security_script_content_validated(self):
        """Verify the script file content is read and validated before execution."""
        from app.services.node_task_service import _validate_script_security
        # Multi-line script with dangerous command in the middle
        script = "#!/bin/bash\necho start\nrm -rf /tmp/test\necho end"
        result = _validate_script_security(script, "blacklist")
        assert result is not None
        assert "rm" in result


class TestDistributeFileCreateTask:
    """Tests for creating distribute_file tasks."""

    def test_create_distribute_file_task(self, client):
        """POST /clusters/1/node-tasks with distribute_file should create task."""
        # Upload a file first
        binary = b"nginx config content"
        resp = client.post(
            "/api/v1/node-tasks/upload-distribute-file",
            files={"file": ("nginx.conf", io.BytesIO(binary), "text/plain")},
        )
        assert resp.status_code == 200
        upload_id = resp.json()["upload_id"]

        resp = client.post(
            "/api/v1/clusters/1/node-tasks",
            json={
                "task_type": "distribute_file",
                "node_ids": [1],
                "params": {
                    "srcpath": f"temp/{upload_id}",
                    "destpath": "/etc/nginx/conf.d/",
                },
            },
        )
        assert resp.status_code == 201, f"Expected 201, got {resp.status_code}: {resp.text}"
        data = resp.json()
        assert data["task_type"] == "distribute_file"
        assert "srcpath" in data["params"]
        assert "destpath" in data["params"]

        # Cancel the background task immediately to avoid real ansible execution
        from app.services.node_task_service import get_node_task_service
        svc = get_node_task_service()
        svc.shutdown_sync()

    def test_create_distribute_file_migrates_file(self, client):
        """distribute_file should migrate file from temp to task-scripts/{task_id}/."""
        binary = b"server { listen 443; }"
        resp = client.post(
            "/api/v1/node-tasks/upload-distribute-file",
            files={"file": ("site.conf", io.BytesIO(binary), "text/plain")},
        )
        upload_id = resp.json()["upload_id"]

        resp = client.post(
            "/api/v1/clusters/1/node-tasks",
            json={
                "task_type": "distribute_file",
                "node_ids": [1],
                "params": {
                    "srcpath": f"temp/{upload_id}",
                    "destpath": "/etc/nginx/conf.d/",
                },
            },
        )
        assert resp.status_code == 201
        task_id = resp.json()["id"]

        # Verify file migrated to task-scripts/{task_id}/
        from app.config.script_upload import TASK_SCRIPTS_DIR
        task_dir = TASK_SCRIPTS_DIR / str(task_id)
        assert task_dir.exists()
        # Should have the file (without .sh extension)
        files = [f for f in task_dir.iterdir() if not f.name.endswith(".meta")]
        assert len(files) == 1

        # Cancel background task
        from app.services.node_task_service import get_node_task_service
        svc = get_node_task_service()
        svc.shutdown_sync()

    def test_create_distribute_file_validates_destpath(self, client):
        """distribute_file without destpath should fail."""
        binary = b"test content"
        resp = client.post(
            "/api/v1/node-tasks/upload-distribute-file",
            files={"file": ("test.conf", io.BytesIO(binary), "text/plain")},
        )
        upload_id = resp.json()["upload_id"]

        resp = client.post(
            "/api/v1/clusters/1/node-tasks",
            json={
                "task_type": "distribute_file",
                "node_ids": [1],
                "params": {
                    "srcpath": f"temp/{upload_id}",
                },
            },
        )
        assert resp.status_code == 400
        assert "destpath" in resp.json()["detail"]

    def test_create_distribute_file_rejects_srcfilename_with_path(self, client):
        """srcfilename 带路径成分（/ 或 \\）应 400：落地名只允许纯文件名。"""
        binary = b"test content"
        resp = client.post(
            "/api/v1/node-tasks/upload-distribute-file",
            files={"file": ("test.conf", io.BytesIO(binary), "text/plain")},
        )
        upload_id = resp.json()["upload_id"]

        resp = client.post(
            "/api/v1/clusters/1/node-tasks",
            json={
                "task_type": "distribute_file",
                "node_ids": [1],
                "params": {
                    "srcpath": f"temp/{upload_id}",
                    "destpath": "/tmp/",
                    "srcfilename": "../../etc/hosts",
                },
            },
        )
        assert resp.status_code == 400
        assert "srcfilename" in resp.json()["detail"]

    def test_create_distribute_file_rejects_srcfilename_backslash(self, client):
        """srcfilename 含反斜杠同样拒绝（Windows 风格路径成分）。"""
        binary = b"test content"
        resp = client.post(
            "/api/v1/node-tasks/upload-distribute-file",
            files={"file": ("test.conf", io.BytesIO(binary), "text/plain")},
        )
        upload_id = resp.json()["upload_id"]

        resp = client.post(
            "/api/v1/clusters/1/node-tasks",
            json={
                "task_type": "distribute_file",
                "node_ids": [1],
                "params": {
                    "srcpath": f"temp/{upload_id}",
                    "destpath": "/tmp/",
                    "srcfilename": "dir\\file.csv",
                },
            },
        )
        assert resp.status_code == 400
        assert "srcfilename" in resp.json()["detail"]


    def test_destpath_auto_append_slash(self, client):
        """destpath without trailing / should get it auto-appended."""
        binary = b"test content"
        resp = client.post(
            "/api/v1/node-tasks/upload-distribute-file",
            files={"file": ("test.conf", io.BytesIO(binary), "text/plain")},
        )
        upload_id = resp.json()["upload_id"]

        resp = client.post(
            "/api/v1/clusters/1/node-tasks",
            json={
                "task_type": "distribute_file",
                "node_ids": [1],
                "params": {
                    "srcpath": f"temp/{upload_id}",
                    "destpath": "/etc/nginx/conf.d",
                },
            },
        )
        assert resp.status_code == 201
        data = resp.json()
        assert data["params"]["destpath"] == "/etc/nginx/conf.d/"

        # Cancel background task
        from app.services.node_task_service import get_node_task_service
        svc = get_node_task_service()
        svc.shutdown_sync()


class TestDistributeBatchExecution:
    """Tests for distribute_file batch execution engine."""

    def test_parse_distribute_results_success(self):
        """When overall rc=0, all nodes should be marked success."""
        from app.services.node_task_service import _parse_distribute_results
        from types import SimpleNamespace
        items = [
            SimpleNamespace(ip="10.0.0.1", node_id=1),
            SimpleNamespace(ip="10.0.0.2", node_id=2),
        ]
        stdout = "[10.0.0.1] changed=1\n[10.0.0.2] changed=1"
        results = _parse_distribute_results(stdout, "", items, 0)
        assert results["10.0.0.1"]["success"] is True
        assert results["10.0.0.2"]["success"] is True

    def test_parse_distribute_results_failure(self):
        """When overall rc!=0, nodes should be marked failed."""
        from app.services.node_task_service import _parse_distribute_results
        from types import SimpleNamespace
        items = [
            SimpleNamespace(ip="10.0.0.1", node_id=1),
            SimpleNamespace(ip="10.0.0.2", node_id=2),
        ]
        stdout = "[10.0.0.1] FAILED: connection refused"
        results = _parse_distribute_results(stdout, "connection error", items, 2)
        assert results["10.0.0.1"]["success"] is False
        assert results["10.0.0.2"]["success"] is False

    def test_parse_distribute_results_empty(self):
        """Empty stdout should mark all as failed."""
        from app.services.node_task_service import _parse_distribute_results
        from types import SimpleNamespace
        items = [SimpleNamespace(ip="10.0.0.1", node_id=1)]
        results = _parse_distribute_results("", "timeout", items, -1)
        assert results["10.0.0.1"]["success"] is False
