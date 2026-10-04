"""五维代码审查（code-review-2026-10-04）P1-A 批次回归测试。

M5 Fernet 密钥单源：db_config._fernet 必须引用 security.JWT_SECRET_KEY 解析结果，
    不得自带公开占位常量兜底（该密钥兼 JWT 签名与数据库密码加密双角色，公开
    常量加密 = 无加密）；存量密文在 ensure_config 启动期自动迁移到新钥。
M9 raw_delete 中继头：静态资源删除经中继网关时必须携带 X-Edge-Target，且
    403 白名单拒绝须转译为友好文案（与 raw_put 对齐）。
M1 SSE 前置 commit：edge.env 部署 / OpenResty 安装 / 自启动配置三处 SSE 端点
    在交出 StreamingResponse 前必须 db.commit() 落审计骨架并释放写锁（#29 范式，
    防流内 ansible 期间并发写假 401）。
"""

import base64
import hashlib
import json
import os
import re
import stat
import time
from pathlib import Path

import pytest
from cryptography.fernet import Fernet, InvalidToken

REPO_ROOT = Path(__file__).resolve().parents[2]

_PUBLIC_LEGACY = "your-super-secret-key-change-in-production"


def _derive_fernet(secret: str) -> Fernet:
    """镜像 db_config._fernet 的确定性派生（sha256 → urlsafe b64）。"""
    digest = hashlib.sha256(secret.encode("utf-8")).digest()
    return Fernet(base64.urlsafe_b64encode(digest))


# ── M5: Fernet 密钥单源 ───────────────────────────────────────────────


class TestM5FernetSingleSource:
    def test_fernet_derives_from_security_resolved_key(self, monkeypatch):
        """_fernet 派生源必须是 security.JWT_SECRET_KEY（env 显式值优先时两者一致）。"""
        from app.core import db_config, security

        monkeypatch.delenv("JWT_SECRET_KEY", raising=False)
        monkeypatch.setattr(security, "JWT_SECRET_KEY", "unit-test-key-p1")
        token = db_config._fernet().encrypt(b"secret")
        assert _derive_fernet("unit-test-key-p1").decrypt(token) == b"secret"

    def test_public_constant_fallback_removed(self, monkeypatch):
        """公开占位常量兜底必须移除：resolved 密钥加密后公开常量解不开。"""
        from app.core import db_config, security

        monkeypatch.delenv("JWT_SECRET_KEY", raising=False)
        monkeypatch.setattr(security, "JWT_SECRET_KEY", "resolved-key-xyz")
        token = db_config._fernet().encrypt(b"pw")
        with pytest.raises(InvalidToken):
            _derive_fernet(_PUBLIC_LEGACY).decrypt(token)

    def test_ensure_config_migrates_legacy_passwords(self, tmp_path, monkeypatch):
        """存量公开常量密文在 ensure_config 启动期自动迁移到 security 派生新钥。"""
        from app.core import db_config, security

        monkeypatch.delenv("JWT_SECRET_KEY", raising=False)
        monkeypatch.setattr(security, "JWT_SECRET_KEY", "new-era-key")

        legacy_token = _derive_fernet(_PUBLIC_LEGACY).encrypt(b"real-pw").decode("utf-8")
        conn = db_config.ConnectionConfig(
            id="pg1", type="postgres", name="生产 PG",
            host="10.0.0.9", database="panshi", username="panshi",
            password_enc=legacy_token,
        )
        cfg_path = tmp_path / "db_config.json"
        db_config.save_config(db_config.DbConfig(active="pg1", connections=[conn]), path=str(cfg_path))

        cfg = db_config.ensure_config(str(cfg_path))

        assert cfg.connections[0].get_password() == "real-pw", "迁移后新钥可解出原密码"
        saved = json.loads(cfg_path.read_text(encoding="utf-8"))
        enc_fields = [
            c["password_enc"] if isinstance(c, dict) else c.password_enc
            for c in saved["connections"]
        ]
        assert enc_fields[0] != legacy_token, "落盘密文须换新钥"
        with pytest.raises(InvalidToken):
            _derive_fernet(_PUBLIC_LEGACY).decrypt(enc_fields[0].encode("utf-8"))


# ── M9: raw_delete 中继头 ─────────────────────────────────────────────


class _FakeResp:
    def __init__(self, status_code: int, text: str):
        self.status_code = status_code
        self.text = text


class TestM9RawDeleteRelay:
    def _make_client(self):
        from app.services.edge_client import EdgeClient

        client = EdgeClient(cluster_id=1, node_ip="10.1.1.1", node_port=9080)
        client.relay_target = "10.1.1.1:9080"  # 模拟中继激活（跳过注册表依赖）
        return client

    def test_raw_delete_sends_edge_target_header(self, monkeypatch):
        captured: dict = {}

        def fake_delete(url, headers=None, timeout=None, trust_env=None):
            captured["url"] = url
            captured["headers"] = headers or {}
            return _FakeResp(204, "")

        monkeypatch.setattr("httpx.delete", fake_delete)
        self._make_client().raw_delete("/edge/admin/static_resources/app")
        assert captured["headers"].get("X-Edge-Target") == "10.1.1.1:9080", (
            "经中继删除静态资源必须携带 X-Edge-Target（与 raw_put 对齐），否则打到网关默认 vhost 404"
        )

    def test_raw_delete_403_translates_whitelist_hint(self, monkeypatch):
        from app.services.edge_client import EdgeAPIError

        monkeypatch.setattr(
            "httpx.delete",
            lambda url, headers=None, timeout=None, trust_env=None: _FakeResp(403, "<html>Forbidden</html>"),
        )
        with pytest.raises(EdgeAPIError) as ei:
            self._make_client().raw_delete("/edge/admin/static_resources/app")
        assert "白名单" in ei.value.message, "403 白名单拒绝须转译友好文案（与 raw_put 对齐）"


# ── M1: SSE 前置 commit ───────────────────────────────────────────────


class TestM1SseCommitBeforeStream:
    @pytest.mark.parametrize(
        "rel_path,anchor",
        [
            ("backend/app/api/v1/cluster_edge_env.py", "async def deploy_stream"),
            ("backend/app/api/v1/cluster_install.py", "async def install_openresty_stream"),
            ("backend/app/api/v1/edge_autostart.py", "async def event_stream"),
        ],
        ids=["edge_env_deploy", "install_openresty", "autostart_setup"],
    )
    def test_commit_before_streaming_response(self, rel_path, anchor):
        """SSE 端点交出流前必须 db.commit()（审计骨架落库 + 写锁释放）。

        只认端点层（4 空格缩进）的 commit：生成器体内的 commit（更深缩进）
        在长 IO 之后才执行，解不了写锁（autostart 历史形态即如此）。
        """
        src = (REPO_ROOT / rel_path).read_text(encoding="utf-8")
        start = src.index(anchor)
        end = src.index("return StreamingResponse", start)
        window = src[start:end]
        assert re.search(r"^    await db\.commit\(\)", window, re.MULTILINE), (
            f"{rel_path}: 流交出前缺端点层 db.commit()（#29：流内 ansible 期间不得持写锁）"
        )


# ── M21: SSHPASS 子进程级注入 ─────────────────────────────────────────


class TestM21SshpassScoping:
    def test_build_ssh_cmd_no_longer_pollutes_global_env(self, monkeypatch):
        """命令构造不得写全局 os.environ：父进程环境外溢会传给之后所有子进程。"""
        from app.services.ansible_service import _build_ssh_cmd

        monkeypatch.delenv("SSHPASS", raising=False)
        _build_ssh_cmd("10.0.0.1", "jboss", "ls -la", password="secret123")
        assert "SSHPASS" not in os.environ, "命令构造不得再写全局 os.environ（M21）"

    @pytest.mark.asyncio
    async def test_password_round_threads_env_extra(self, monkeypatch):
        """密码回退腿必须把 SSHPASS 经 env_extra 传给子进程（不落全局）。"""
        from app.services import ansible_service

        calls: list = []

        async def fake_run(cmd, env_extra=None):
            calls.append(env_extra)
            if len(calls) == 1:
                return 255, "", "Permission denied (publickey)."
            return 0, "ok", ""

        monkeypatch.setattr(ansible_service, "_run_subprocess", fake_run)
        rc, _, _ = await ansible_service._run_ssh_with_fallback(
            "10.0.0.1", "jboss", "ls", password="pw123"
        )
        assert rc == 0
        assert calls[0] is None, "免密腿不应携带 SSHPASS"
        assert calls[1] == {"SSHPASS": "pw123"}, "密码腿必须经子进程级 env 注入"

    @pytest.mark.asyncio
    async def test_password_round_stream_threads_env_extra(self, monkeypatch):
        """流式腿同款：密码回退经 env_extra 传 SSHPASS。"""
        from app.services import ansible_service

        calls: list = []

        async def fake_stream(cmd, on_line=None, env_extra=None):
            calls.append(env_extra)
            if len(calls) == 1:
                return 255, "", "Permission denied (publickey)."
            return 0, "ok", ""

        monkeypatch.setattr(ansible_service, "_run_subprocess_stream", fake_stream)
        rc, _, _ = await ansible_service._run_ssh_with_fallback(
            "10.0.0.1", "jboss", "ls", password="pw456", on_line=lambda ev: None
        )
        assert rc == 0
        assert calls[1] == {"SSHPASS": "pw456"}

    def test_cluster_install_stream_ssh_carries_env(self):
        """cluster_install 自有流式执行器的密码回退腿同样必须传子进程级 SSHPASS。"""
        src = (REPO_ROOT / "backend/app/api/v1/cluster_install.py").read_text(encoding="utf-8")
        assert re.search(r'_stream_ssh\(cmd_parts, \{"SSHPASS": ssh_password', src), (
            "cluster_install 密码回退腿必须经 env 参数注入 SSHPASS（M21）"
        )


# ── M22: ansible artifacts 保留策略 ───────────────────────────────────


class TestM22ArtifactsRetention:
    def test_cleanup_keeps_newest(self, tmp_path):
        """按 mtime 倒序保留最新 keep 份 run 目录，其余删除。"""
        from app.services import ansible_service

        art = tmp_path / "artifacts"
        art.mkdir()
        now = time.time()
        for i, age in enumerate([500, 400, 300, 200, 100]):
            d = art / f"run-{i}"
            d.mkdir()
            (d / "cmd").write_text("x", encoding="utf-8")
            os.utime(d, (now - age, now - age))
        removed = ansible_service.cleanup_artifacts(keep=2, artifacts_dir=art)
        assert removed == 3
        assert sorted(p.name for p in art.iterdir()) == ["run-3", "run-4"]

    def test_run_playbook_wires_prune(self):
        """清理必须接线：服务构造（启动）+ 每次 run_playbook 收尾。"""
        src = (REPO_ROOT / "backend/app/services/ansible_service.py").read_text(encoding="utf-8")
        assert src.count("_prune_artifacts_safe()") >= 3, (
            "启动 + 每次运行后都应触发 artifacts 清理（M22）"
        )


# ── M23: gateways 清单收权 0600 ───────────────────────────────────────


class TestM23GatewaysPerms:
    def test_ensure_gateways_perms(self, tmp_path):
        """网关清单含 SSH 凭据，落盘后必须 0600（与 host 清单同款）。"""
        from app.services import relay_push

        f = tmp_path / "gateways"
        f.write_text("[gateways_aoh]\n192.168.0.13\n", encoding="utf-8")
        os.chmod(f, 0o644)
        relay_push.ensure_gateways_perms(str(f))
        assert stat.S_IMODE(os.stat(f).st_mode) == 0o600

    def test_missing_file_is_noop(self, tmp_path):
        from app.services import relay_push

        relay_push.ensure_gateways_perms(str(tmp_path / "absent"))  # 不抛即过

    def test_relay_sshd_writes_chmod_guarded(self):
        """relay_sshd 注入/还原两处写回后都必须收权。"""
        src = (REPO_ROOT / "backend/app/services/relay_sshd.py").read_text(encoding="utf-8")
        assert src.count("ensure_gateways_perms()") >= 2, (
            "注入与还原两处写后都必须调用 ensure_gateways_perms()（M23）"
        )


# ── M27: migrate PRAGMA 事务时序 ──────────────────────────────────────


class TestM27MigratePragma:
    def test_fix_sqlite_table_survives_referencing_rows(self, tmp_path):
        """_fix_sqlite_table 重建表时不得级联清空引用表（M27）。

        历史 bug：PRAGMA foreign_keys=OFF 在隐式事务内执行是 no-op（前置的
        sqlite_master SELECT 已开事务），DROP TABLE 以 FK=ON 执行隐式 DELETE，
        引用表的 ON DELETE CASCADE 子行被清空。
        """
        from sqlalchemy import create_engine, text

        from app.core.migrate import _fix_sqlite_table

        eng = create_engine(f"sqlite:///{tmp_path / 'm27.db'}")
        with eng.connect() as c:
            c.execute(text(
                "CREATE TABLE t1 (id INTEGER PRIMARY KEY, "
                "name TEXT UNIQUE NOT NULL, tenant TEXT NOT NULL, code TEXT NOT NULL)"
            ))
            c.execute(text(
                "CREATE TABLE t2 (id INTEGER PRIMARY KEY, "
                "ref INTEGER NOT NULL REFERENCES t1(id) ON DELETE CASCADE)"
            ))
            c.execute(text("INSERT INTO t1 VALUES (1, 'a', 't', 'c1')"))
            c.execute(text("INSERT INTO t2 VALUES (100, 1)"))
            c.commit()

        _fix_sqlite_table(eng, "t1", "name", ("tenant", "code"))

        with eng.connect() as c:
            assert c.execute(text("SELECT COUNT(*) FROM t2")).scalar() == 1, (
                "重建 t1 时 t2 引用行被级联清空——PRAGMA foreign_keys=OFF 未真正生效（事务内 no-op）"
            )
            assert c.execute(text("SELECT COUNT(*) FROM t1")).scalar() == 1
            assert c.execute(text("SELECT name FROM t1")).scalar() == "a"


# ── M26: async 引擎 SQLite pragma ────────────────────────────────────


class TestM26AsyncEnginePragmas:
    @pytest.mark.asyncio
    async def test_async_engine_applies_sqlite_pragmas(self, tmp_path):
        """async 引擎必须挂同步同款连接级 pragma（WAL/FK/busy_timeout）。

        历史：async 工厂无监听 → FK 关闭，删父行留孤儿行（与 PG CASCADE 语义分叉）。
        """
        from app.core.database import build_async_engine_for
        from app.core.db_config import ConnectionConfig

        conn_cfg = ConnectionConfig(
            id="m26", type="sqlite", name="M26", path=str(tmp_path / "m26.db")
        )
        eng = build_async_engine_for(conn_cfg)
        try:
            async with eng.connect() as c:
                fk = (await c.exec_driver_sql("PRAGMA foreign_keys")).scalar()
                busy = (await c.exec_driver_sql("PRAGMA busy_timeout")).scalar()
                mode = (await c.exec_driver_sql("PRAGMA journal_mode")).scalar()
        finally:
            await eng.dispose()
        assert int(fk) == 1, "async SQLite 连接必须 FK=ON（与同步引擎/PG 一致）"
        assert int(busy) == 5000
        assert str(mode).lower() == "wal"

    def test_async_factory_wires_listener(self):
        src = (REPO_ROOT / "backend/app/core/database.py").read_text(encoding="utf-8")
        assert 'event.listen(engine.sync_engine, "connect", _configure_sqlite_connection)' in src, (
            "async 工厂必须给 sqlite 连接挂 _configure_sqlite_connection 监听（M26）"
        )
