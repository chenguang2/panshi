"""SSH 失败中文归因（design D7，db-backup-dr-ux-optimization 任务 2.3/2.4）。

断言逐位置 error **首句**为中文归因（含 host:port 与「请检查」类可操作导向），
且原始英文错误串仍保留在 error 文本中作为详情（展开可看原文）。
三类：连接被拒绝 / 认证失败 / sshpass 缺失（平台后端服务器组件语义）。
"""
import pytest

from app.core import db_config as dbc
from app.services import db_backup_service as svc

pytestmark = pytest.mark.anyio


def _mkcfg(tmp_path):
    import sqlite3

    p = tmp_path / "panshi.db"
    if not p.exists():
        con = sqlite3.connect(p)
        con.execute("CREATE TABLE t (x)")
        con.commit()
        con.close()
    conns = [dbc.ConnectionConfig(id="panshi", name="panshi.db", type="sqlite", path=str(p))]
    return dbc.DbConfig(active="panshi", connections=conns)


async def _seed_one_target(session, host="192.0.2.10"):
    from app.core.db_config import encrypt_password
    from app.models.db_backup import DbBackupTarget

    session.add(
        DbBackupTarget(
            name="局内DR", host=host, port=22, username="backup", auth_type="password",
            password_encrypted=encrypt_password("s3cret"),
            remote_dir="/srv/panshi-dr", retain_count=7, enabled=True,
        )
    )
    await session.commit()


async def _run_and_first_target_error(async_authed_client, monkeypatch, tmp_path, run_fn):
    monkeypatch.setattr(dbc, "load_config", lambda: _mkcfg(tmp_path))
    monkeypatch.setattr(svc, "_app_version_info", lambda: {"app_version": "t", "git_commit": "t"})
    monkeypatch.setattr(svc, "_detect_source_raw", lambda h, p: "10.0.0.1")
    monkeypatch.setattr(svc, "_run", run_fn)
    r = await async_authed_client.post("/api/v1/db-backup/run")
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["status"] == "failed"
    assert body["targets"], "推送阶段失败应有逐位置子结果"
    return body["targets"][0]["error"] or ""


class TestErrorAttributionZh:
    async def test_connection_refused(
        self, async_authed_client, isolated_session, monkeypatch, tmp_path
    ):
        async def fail_run(argv, env=None, timeout=300):
            return 255, "", "ssh: connect to host 192.0.2.10 port 22: Connection refused"

        async with isolated_session() as s:
            await _seed_one_target(s)
        error = await _run_and_first_target_error(async_authed_client, monkeypatch, tmp_path, fail_run)
        first_sentence = error.split("。")[0]
        # 首句中文归因：host:port + 类别 + 「请检查」导向
        assert "192.0.2.10:22" in first_sentence
        assert "连接被拒绝" in first_sentence
        assert "请检查" in first_sentence
        # 原始英文错误串保留为详情
        assert "Connection refused" in error

    async def test_auth_failure(
        self, async_authed_client, isolated_session, monkeypatch, tmp_path
    ):
        async def fail_run(argv, env=None, timeout=300):
            return 255, "", "backup@192.0.2.10: Permission denied (publickey,password)."

        async with isolated_session() as s:
            await _seed_one_target(s)
        error = await _run_and_first_target_error(async_authed_client, monkeypatch, tmp_path, fail_run)
        first_sentence = error.split("。")[0]
        assert "认证失败" in first_sentence
        assert "192.0.2.10:22" in first_sentence
        assert "请检查" in first_sentence
        assert "Permission denied" in error

    async def test_sshpass_missing(
        self, async_authed_client, isolated_session, monkeypatch, tmp_path
    ):
        """sshpass 缺失：说明组件装在平台后端服务器（非用户本机）、给安装命令与密钥认证替代路径。"""
        monkeypatch.setattr(svc, "_sshpass_available", lambda: False)
        async with isolated_session() as s:
            await _seed_one_target(s)

        async def unreachable_run(argv, env=None, timeout=300):  # pragma: no cover - 不应触达
            raise AssertionError("sshpass 缺失时不应执行远端命令")

        error = await _run_and_first_target_error(
            async_authed_client, monkeypatch, tmp_path, unreachable_run
        )
        assert "平台后端服务器" in error  # 主语：非用户本机
        assert "sudo apt-get install sshpass" in error  # 安装命令
        assert "密钥认证" in error  # 替代路径
