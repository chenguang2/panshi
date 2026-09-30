"""SQLite DR 恢复向导后端测试：远端列表 / 下载校验 / 落位激活。"""

import json
import os
import stat
import tarfile
from datetime import datetime, timedelta
from pathlib import Path

import pytest

from app.core import db_config as dbc
from app.services import db_backup_service as bsvc
from app.services import db_restore_service as rst
from tests.api_helpers import isolated_app_lifespan

pytestmark = pytest.mark.anyio


# ── 测试基建：本地伪造「远端」目录，_run/scp 用本地拷贝模拟 ──────────────

class FakeRemote:
    """用本地目录扮演远端：ls/stat/tar 走本地文件系统，scp 即拷贝。"""

    def __init__(self, root: Path):
        self.root = root

    def _resolve(self, name: str) -> Path:
        return self.root / name

    async def __call__(self, argv, env=None, timeout=None):
        cmd = " ".join(argv)
        if "ls -1" in cmd:
            names = sorted(p.name for p in self.root.glob("panshi_backup_*"))
            names += sorted(p.name for p in self.root.glob("garbage_*"))
            return 0, "\n".join(names) + ("\n" if names else ""), ""
        if "stat -c" in cmd:
            name = cmd.split("stat -c %s ")[-1].strip().strip("'")
            return 0, str(self._resolve(name).stat().st_size), ""
        if "tar -xzOf" in cmd:
            name = cmd.split("tar -xzOf ")[1].split(" meta.json")[0].strip().strip("'")
            try:
                with tarfile.open(self._resolve(name)) as tf:
                    return 0, tf.extractfile("meta.json").read().decode(), ""
            except Exception as exc:
                return 1, "", str(exc)
        if "test -f" in cmd:
            name = cmd.split("test -f ")[1].split(" &&")[0].strip().strip("'")
            return (0 if self._resolve(name).exists() else 1, "", "")
        if "scp" in cmd.split()[:3]:
            # 下载方向：user@host:remote → local
            remote_part = [a for a in argv if ":" in a][0]
            local_part = [a for a in argv[1:] if ":" not in a][-1]
            name = remote_part.split("/")[-1]
            import shutil

            shutil.copyfile(self._resolve(name), local_part)
            return 0, "", ""
        return 1, "", f"unmatched: {cmd}"


async def _mk_package(remote_dir: Path, tmp: Path) -> dict:
    """构造一个真实小包并放进「远端」。"""
    db_path = tmp / "panshi.db"
    import sqlite3

    con = sqlite3.connect(db_path)
    con.execute("CREATE TABLE sys_user (id INTEGER PRIMARY KEY, username TEXT)")
    con.execute("INSERT INTO sys_user VALUES (1, 'restored-admin')")
    con.execute("CREATE TABLE ps_cluster (id INTEGER PRIMARY KEY, name TEXT)")
    con.execute("INSERT INTO ps_cluster VALUES (1, 'restored-cluster')")
    con.commit()
    con.close()
    workdir = tmp / "wd"
    workdir.mkdir()
    snapshots = [
        {
            "conn_id": "main",
            "snapshot": str(workdir / "main.db"),
            "source": "./data/panshi.db",
        }
    ]
    import shutil as _sh

    _sh.copyfile(db_path, workdir / "main.db")
    fake_root = tmp / "backend_root"
    (fake_root / "data").mkdir(parents=True)
    (fake_root / "data" / "panshi.db").write_bytes(db_path.read_bytes())
    (fake_root / "data" / ".jwt_secret").write_text("test-secret-key")
    (fake_root / ".env.production").write_text("APP_ENV=production\n")
    (fake_root / "db_config.json").write_text(
        json.dumps(
            {
                "active": "main",
                "connections": [
                    {"id": "main", "type": "sqlite", "path": "./data/panshi.db", "name": "主库"}
                ],
            }
        )
    )
    monkey_backend_root(fake_root)
    pkg, meta = bsvc.build_package(
        workdir=str(workdir),
        snapshots=snapshots,
        skipped=[{"conn_id": "pg", "reason": "非 SQLite 类型"}],
        includes={"static": False, "task_scripts": False, "task_logs": False},
        version_info={"app_version": "1.0.0", "git_commit": "deadbee"},
        meta={"active_connection_id": "main", "databases": {}, "files": {}},
    )
    remote_dir.mkdir(parents=True, exist_ok=True)
    import shutil

    shutil.copyfile(pkg, remote_dir / Path(pkg).name)
    return {"name": Path(pkg).name, "meta": meta, "fake_root": fake_root}


def monkey_backend_root(root: Path, monkeypatch=None):
    """把两个服务的 backend 根指到伪造目录。"""
    if monkeypatch is not None:
        monkeypatch.setattr(bsvc, "_backend_root", lambda: root)
        monkeypatch.setattr(rst, "_backend_root", lambda: root)
    else:  # 测试内直接替换（无 monkeypatch 场景）
        bsvc._backend_root = lambda: root  # noqa: B010
        rst._backend_root = lambda: root  # noqa: B010


def _target(remote_dir: Path) -> dict:
    return {
        "host": "192.0.2.10",
        "port": 22,
        "username": "backup",
        "auth_type": "password",
        "password": "s3cret",
        "remote_dir": str(remote_dir),
    }


class TestListRemotePackages:
    async def test_list_filters_and_reads_meta(self, tmp_path, monkeypatch):
        remote = FakeRemote(tmp_path / "remote")
        pkg_info = await _mk_package(tmp_path / "remote", tmp_path)
        (tmp_path / "remote" / "garbage_999.txt").write_text("x")
        (tmp_path / "remote" / "other.tar.gz").write_bytes(b"junk")
        monkeypatch.setattr(rst, "_run", remote)
        items = await rst.list_remote_packages(_target(tmp_path / "remote"))
        names = [i["package_name"] for i in items]
        assert pkg_info["name"] in names
        assert all(n.startswith("panshi_backup_") for n in names)
        item = next(i for i in items if i["package_name"] == pkg_info["name"])
        assert item["app_version"] == "1.0.0"
        assert item["file_size"] > 0
        assert item["skipped_databases"] == ["pg"]


class TestVerifyAndStage:
    async def test_verify_ok_and_stage(self, tmp_path, monkeypatch):
        remote = FakeRemote(tmp_path / "remote")
        pkg_info = await _mk_package(tmp_path / "remote", tmp_path)
        monkeypatch.setattr(rst, "_run", remote)
        result = await rst.verify_and_stage(_target(tmp_path / "remote"), pkg_info["name"])
        assert result["package_name"] == pkg_info["name"]
        assert result["databases"]["main"]["integrity"] == "ok"
        assert rst.get_staged(result["verify_id"]) is not None

    async def test_verify_missing_package(self, tmp_path, monkeypatch):
        remote = FakeRemote(tmp_path / "remote")
        (tmp_path / "remote").mkdir(parents=True)
        monkeypatch.setattr(rst, "_run", remote)
        with pytest.raises(Exception, match="不存在|not found|刷新"):
            await rst.verify_and_stage(_target(tmp_path / "remote"), "panshi_backup_00000000_000000.tar.gz")

    async def test_verify_corrupt_sha(self, tmp_path, monkeypatch):
        remote = FakeRemote(tmp_path / "remote")
        pkg_info = await _mk_package(tmp_path / "remote", tmp_path)
        # 篡改包内一个文件后重打包
        pkg_path = tmp_path / "remote" / pkg_info["name"]
        with tarfile.open(pkg_path) as tf:
            members = tf.getmembers()
            data = {}
            for m in members:
                f = tf.extractfile(m)
                data[m.name] = f.read() if f else b""
        data["config/.jwt_secret"] = b"tampered"
        with tarfile.open(pkg_path, "w:gz") as tf:
            for name, blob in data.items():
                import io

                ti = tarfile.TarInfo(name)
                ti.size = len(blob)
                tf.addfile(ti, io.BytesIO(blob))
        monkeypatch.setattr(rst, "_run", remote)
        with pytest.raises(Exception, match="SHA|校验"):
            await rst.verify_and_stage(_target(tmp_path / "remote"), pkg_info["name"])


class TestExecuteRestore:
    async def test_full_restore_flow(self, tmp_path, monkeypatch):
        remote = FakeRemote(tmp_path / "remote")
        pkg_info = await _mk_package(tmp_path / "remote", tmp_path)
        monkeypatch.setattr(rst, "_run", remote)
        fake_root = pkg_info["fake_root"]

        reloaded = []
        monkeypatch.setattr(rst, "_engine_reload", lambda: reloaded.append(1))

        with isolated_app_lifespan():
            result = await rst.verify_and_stage(_target(tmp_path / "remote"), pkg_info["name"])
            vid = result["verify_id"]

            from app.core.database import AsyncSessionLocal

            async with AsyncSessionLocal() as db:
                out = await rst.execute_restore(vid, confirmed=True, db=db)
            assert out["activated"] is True
            assert reloaded  # 引擎已重载

            data_dir = fake_root / "data"
            restored = sorted(data_dir.glob("panshi.db.restored-*"))
            assert restored, "恢复库应以 .restored-<ts> 落盘"
            prerestore = sorted(data_dir.glob("panshi.db.pre-restore-*"))
            assert prerestore, "旧活动库应保留 .pre-restore-<ts>"
            # db_config.json 指向恢复库
            cfg = json.loads((fake_root / "db_config.json").read_text())
            assert cfg["active"] == "main"
            main_conn = next(c for c in cfg["connections"] if c["id"] == "main")
            assert ".restored-" in main_conn["path"]
            # key 文件权限 600
            mode = stat.S_IMODE((fake_root / "data" / ".jwt_secret").stat().st_mode)
            assert mode == 0o600
            # 恢复库数据可见
            import sqlite3

            con = sqlite3.connect(restored[0])
            rows = con.execute("SELECT username FROM sys_user").fetchall()
            con.close()
            assert rows == [("restored-admin",)]

    async def test_restore_requires_confirm(self, tmp_path, monkeypatch):
        remote = FakeRemote(tmp_path / "remote")
        pkg_info = await _mk_package(tmp_path / "remote", tmp_path)
        monkeypatch.setattr(rst, "_run", remote)
        with isolated_app_lifespan():
            result = await rst.verify_and_stage(_target(tmp_path / "remote"), pkg_info["name"])
            from app.core.database import AsyncSessionLocal

            async with AsyncSessionLocal() as db:
                with pytest.raises(Exception, match="确认"):
                    await rst.execute_restore(result["verify_id"], confirmed=False, db=db)

    async def test_restore_rejects_when_backup_inflight(self, tmp_path, monkeypatch):
        assert bsvc.try_acquire_inflight()
        try:
            with pytest.raises(Exception, match="进行中"):
                await rst.execute_restore("whatever-id", confirmed=True, db=None)
        finally:
            bsvc.release_inflight()

    async def test_staged_expiry(self, tmp_path, monkeypatch):
        # 过期暂存被清理
        rst._STAGED["expired-one"] = {
            "dir": str(tmp_path),
            "expires": datetime.utcnow() - timedelta(seconds=1),
            "package_name": "panshi_backup_x.tar.gz",
        }
        assert rst.get_staged("expired-one") is None
        assert "expired-one" not in rst._STAGED
