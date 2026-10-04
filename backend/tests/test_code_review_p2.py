"""P2 批次（架构加固）：M28 索引 / 导出任务收敛 / 守卫下沉 / 中继头下沉。

对应 docs/refactoring/code-review-2026-10-04.md 第八节架构改进建议 1/5。
"""

import os
import re
import stat
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parents[2]


# ── P2-⑤：M28 版本表复合索引 ─────────────────────────────────────────


class TestM28ConfigVersionIndex:
    def test_model_declares_composite_index(self):
        """ps_config_version 必须 (cluster_id, resource_type, resource_id) 复合索引。

        M28：每次发布插一行、列表页全部 GROUP BY 聚合，无索引会随增长退化为
        顺序扫描——全库增长最快的表。
        """
        from app.models.cluster import ConfigVersion

        found = any(
            [c.name for c in idx.columns] == ["cluster_id", "resource_type", "resource_id"]
            for idx in ConfigVersion.__table__.indexes
        )
        assert found, "模型层缺复合索引（M28）"

    def test_migrate_wires_ensure_index(self):
        """存量库经 _ensure_index 补建（create_all 不会 ALTER 已有表）。"""
        src = (REPO_ROOT / "backend/app/core/migrate.py").read_text(encoding="utf-8")
        assert '_ensure_index(engine, "ps_config_version"' in src, "存量库补建索引未接线（M28）"


# ── P2-⑤：_export_tasks 容量收敛 ─────────────────────────────────────


class TestExportTasksRetention:
    def test_remember_export_task_caps_size(self):
        """导出任务 dict 只增不减 → 统一容量截断（P2-⑤，防 5 万行 CSV 常驻内存）。"""
        from app.api.v1 import system

        system._export_tasks.clear()
        for i in range(130):
            system._remember_export_task(f"task-{i}", {"status": "ready", "content": f"c{i}"})
        try:
            assert len(system._export_tasks) == 100
            assert "task-0" not in system._export_tasks, "最旧的应被淘汰"
            assert "task-129" in system._export_tasks, "最新的必须保留"
        finally:
            system._export_tasks.clear()


# ── P2-①：假成功守卫下沉 run_playbook 唯一出口 ───────────────────────


class TestFalseSuccessGuardSink:
    def test_sink_present_in_run_playbook(self):
        src = (REPO_ROOT / "backend/app/services/ansible_service.py").read_text(encoding="utf-8")
        start = src.index("async def run_playbook")
        end = src.index("async def nginx_cmd", start)
        body = src[start:end]
        assert "_ansible_false_success_error(" in body, (
            "假成功守卫必须下沉到 run_playbook 唯一出口（P2①：新调用方自动免疫，#21② 根治版）"
        )

    def test_guard_lives_in_ansible_service(self):
        from app.services import ansible_service

        assert callable(ansible_service._ansible_false_success_error)

    @pytest.mark.asyncio
    async def test_run_playbook_flips_false_success(self, monkeypatch):
        """rc=0 但 no hosts matched → 出口统一翻转为失败（行为级）。"""
        from app.services import ansible_service
        from app.services.ansible_service import AnsibleRunnerService

        monkeypatch.setattr(ansible_service, "_prune_artifacts_safe", lambda: None)

        class FakeConfig:
            command = ["ansible-playbook", "edge_nginx_status.yml"]

        class FakeResult:
            rc = 0
            status = "successful"
            stdout = "PLAY [all] ...\nskipping: no hosts matched\nPLAY RECAP ..."
            stderr = ""
            config = FakeConfig()
            events = []

        def fake_run(**kwargs):
            return FakeResult()

        import ansible_runner

        monkeypatch.setattr(ansible_runner, "run", fake_run)
        svc = AnsibleRunnerService(private_data_dir="/tmp")
        res = await svc.run_playbook("10.1.1.99", "edge_nginx_status", {})
        assert res["rc"] == -1, "假成功必须翻转 rc"
        assert res["status"] == "failed"
        assert "不在 Ansible 主机清单中" in res["stderr"]


# ── P2-①：中继头/403 转译下沉 EdgeClient 底层 ────────────────────────


class TestRelayHeaderSink:
    def test_relay_header_single_site(self):
        src = (REPO_ROOT / "backend/app/services/edge_client.py").read_text(encoding="utf-8")
        assert src.count('headers["X-Edge-Target"]') == 1, (
            "X-Edge-Target 只允许在 _relay_aware_headers 唯一赋值点出现（P2①：新 raw_* 方法不可再漏）"
        )
        assert src.count("_relay_aware_headers(") >= 4, "def + request/raw_put/raw_delete 三调用点"

    def test_403_translation_single_site(self):
        src = (REPO_ROOT / "backend/app/services/edge_client.py").read_text(encoding="utf-8")
        assert src.count("_check_relay_whitelist_403(") >= 4, "def + 三调用点"
        assert src.count("目标不在该局网关白名单") <= 1, "白名单提示文案只允许一个出处"


# ── P2-⑥：网关凭据崩溃自愈 ───────────────────────────────────────────


class TestRelayCredCrashSweep:
    def test_injected_lines_are_tagged_and_restored_clean(self, tmp_path, monkeypatch):
        """注入行必须打标，正常还原后标记与凭据都不得残留。"""
        from app.services import relay_push, relay_sshd

        gw = tmp_path / "gateways"
        gw.write_text("gateways_aoh:\n  hosts:\n    192.168.0.13:\n", encoding="utf-8")
        monkeypatch.setattr(relay_push, "_GATEWAYS_INVENTORY", str(gw))

        assert relay_sshd.inject_gateway_creds("192.168.0.13", "root", "secret123")
        tagged = gw.read_text(encoding="utf-8")
        assert "panshi-injected" in tagged, "注入行必须打标（P2⑥：崩溃清扫依据）"
        assert "secret123" in tagged

        relay_sshd.restore_gateway_creds("192.168.0.13")
        restored = gw.read_text(encoding="utf-8")
        assert "panshi-injected" not in restored, "正常还原后不得残留标记"
        assert "secret123" not in restored, "凭据必须清除"

    def test_sweep_removes_only_tagged(self, tmp_path, monkeypatch):
        """崩溃清扫：只移除打标行，未打标原生行保留，写回收权 0600。"""
        from app.services import relay_push, relay_sshd

        gw = tmp_path / "gateways"
        gw.write_text(
            "gateways_aoh:\n"
            "  hosts:\n"
            "    192.168.0.13:\n"
            "      ansible_user: root  # panshi-injected\n"
            "      ansible_ssh_pass: leaked123  # panshi-injected\n"
            "    192.168.0.20:\n"
            "      ansible_user: jboss\n",
            encoding="utf-8",
        )
        monkeypatch.setattr(relay_push, "_GATEWAYS_INVENTORY", str(gw))

        removed = relay_sshd.sweep_injected_creds()
        assert removed == 2
        out = gw.read_text(encoding="utf-8")
        assert "leaked123" not in out
        assert "panshi-injected" not in out
        assert "ansible_user: jboss" in out, "未打标原生行必须保留"
        assert stat.S_IMODE(os.stat(gw).st_mode) == 0o600, "清扫后须收权 0600"

    def test_lifespan_wires_sweep(self):
        src = (REPO_ROOT / "backend/app/main.py").read_text(encoding="utf-8")
        assert "sweep_injected_creds" in src, "启动时必须清扫崩溃残留凭据（P2⑥）"


# ── P2-③：T4 CWD 路径锚定 ───────────────────────────────────────────


class TestT4PathAnchoring:
    def test_features_path_absolute(self):
        from app.core import features

        assert Path(features._FEATURES_PATH).is_absolute(), "features.yaml 须 backend 根锚定（M6）"

    def test_db_switch_flag_absolute(self):
        from app.services import db_switch_service

        assert Path(db_switch_service.RESTART_FLAG_PATH).is_absolute(), ".restart.flag 须锚定（建议 32）"

    def test_edge_logger_paths_absolute(self):
        from app.services import edge_logger

        assert Path(edge_logger.EdgeLogger.LOG_DIR).is_absolute(), "LOG_DIR 须锚定（建议 18）"
        assert Path(edge_logger._resolve_log_path("logs/edge/upstream.log")).is_absolute()

    def test_database_backup_dir_anchored(self):
        src = (REPO_ROOT / "backend/app/api/v1/database.py").read_text(encoding="utf-8")
        assert 'Path("./data' not in src, "迁移备份目录须 __file__ 锚定（建议 33）"

    def test_no_cwd_relative_data_paths(self):
        """守卫：backend/app 不得再出现 "./data、"./logs 起头的相对路径字面量。

        豁免：行内显式标注 ``cwd-relative-by-design`` 的存储态路径
        （db_config.DEFAULT_SQLITE_STORED_PATH——存相对保可移植，解析期锚定）。
        """
        pattern = re.compile(r'"\./(data|logs)/')
        hits = []
        for py in (REPO_ROOT / "backend/app").rglob("*.py"):
            for i, line in enumerate(py.read_text(encoding="utf-8").splitlines(), 1):
                if "cwd-relative-by-design" in line:
                    continue
                if pattern.search(line):
                    hits.append(f"{py.relative_to(REPO_ROOT)}:{i}: {line.strip()}")
        assert not hits, f"CWD 相对路径残留: {hits}"


# ── P2-②：密钥单源收官 ──────────────────────────────────────────────


class TestGenLinuxSecretPackaging:
    def test_script_carries_jwt_secret(self):
        src = (REPO_ROOT / "product/linux/gen-linux.sh").read_text(encoding="utf-8")
        assert ".jwt_secret" in src, (
            "打包须同步 .jwt_secret——否则目标机密钥重生成、db_config 里已加密的连接密码全部不可解（建议 34）"
        )

    def test_deployment_templates_no_placeholder_secrets(self):
        for p in (REPO_ROOT / "deployment").glob("*"):
            if p.is_file():
                txt = p.read_text(encoding="utf-8", errors="ignore")
                assert "your-production-secret-key" not in txt, f"{p.name} 残留占位密钥（S1 收官）"


# ── P2-④：事件循环纯度守卫 ──────────────────────────────────────────


class TestEventLoopPurity:
    def test_no_bare_blocking_calls_in_async(self):
        """async def 体内不得裸调已知阻塞方法（S2/S3 防复发守卫）。

        黑名单制：只拦已知同步阻塞符号（fetch_edge_data / _verify_reachable /
        _do_test_sync），to_thread/run_in_executor 包装的调用放行。
        async 薄包装（如 _do_test）不算阻塞符号。
        """
        blocking = ("fetch_edge_data", "_verify_reachable", "_do_test_sync")
        violations = []
        for py in (REPO_ROOT / "backend/app").rglob("*.py"):
            lines = py.read_text(encoding="utf-8").splitlines()
            current_async = False
            cur_indent = 0
            for ln_no, line in enumerate(lines, 1):
                m = re.match(r"^(\s*)(async\s+)?def\s+\w+", line)
                if m:
                    current_async = m.group(2) is not None
                    cur_indent = len(m.group(1))
                    continue
                if not current_async or not line.strip():
                    continue
                if not line.startswith(" " * (cur_indent + 1)):
                    continue
                if "to_thread" in line or "run_in_executor" in line:
                    continue
                for sym in blocking:
                    if f".{sym}(" in line or re.search(rf"(?<![\w.]){sym}\(", line):
                        violations.append(f"{py.relative_to(REPO_ROOT)}:{ln_no}: {line.strip()}")
        assert not violations, f"async 内裸调阻塞方法: {violations}"
