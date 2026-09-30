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
        if "<<<PANSHI_SECT_STAT>>>" in cmd:
            # 合成列包命令（单次往返）：ls 全量名单 + 「size name」段 + 批量 meta 段（shell 原始形态）
            import tarfile as _tf

            pkgs = sorted(self.root.glob("panshi_backup_*"))
            lines = [p.name for p in pkgs]
            lines += [p.name for p in sorted(self.root.glob("garbage_*"))]
            lines.append("<<<PANSHI_SECT_STAT>>>")
            lines += [f"{p.stat().st_size} {p.name}" for p in pkgs]
            lines.append("<<<PANSHI_SECT_META>>>")
            body = []
            for p in pkgs:
                body.append(f"<<<PANSHI_META{p.name}\n")
                try:
                    with _tf.open(p) as tf:
                        body.append(tf.extractfile("meta.json").read().decode())
                except Exception:
                    pass
                body.append("\n>>>PANSHI_META\n")
            return 0, "\n".join(lines) + "\n" + "".join(body), ""
        if "<<<PANSHI_META" in cmd:
            # 独立批量 meta 形态（保留兼容）：for n in 'a' 'b'; do echo ...; tar ...; echo; echo ...; done
            # 真实 shell 语义：tar 输出无末尾换行，紧接的 echo 直接粘在内容后（故 end 前须有 echo 空行）
            import shlex as _shlex

            name_list = _shlex.split(cmd.split("for n in ", 1)[1].split("; do", 1)[0])
            out = []
            for pkg in name_list:
                out.append(f"<<<PANSHI_META{pkg}\n")
                try:
                    with tarfile.open(self._resolve(pkg)) as tf:
                        out.append(tf.extractfile("meta.json").read().decode())
                except Exception:
                    pass
                out.append("\n>>>PANSHI_META\n")
            return 0, "".join(out), ""
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


class CountingFakeRemote(FakeRemote):
    """统计远端命令条数（单次列包应只发 1 条合成命令：ls+stat+meta 一次往返）。"""

    def __init__(self, root: Path):
        super().__init__(root)
        self.calls = 0

    async def __call__(self, argv, env=None, timeout=None):
        self.calls += 1
        return await super().__call__(argv, env, timeout)


async def _mk_package(remote_dir: Path, tmp: Path, backup_source_name: str = None) -> dict:
    """构造一个真实小包并放进「远端」。

    backup_source_name：包内站点库 ps_db_backup_config 行携带的来源标识
    （模拟旧机备份配置，验证恢复继承语义）。
    """
    db_path = tmp / "panshi.db"
    import sqlite3

    con = sqlite3.connect(db_path)
    con.execute("CREATE TABLE sys_user (id INTEGER PRIMARY KEY, username TEXT)")
    con.execute("INSERT INTO sys_user VALUES (1, 'restored-admin')")
    con.execute("CREATE TABLE ps_cluster (id INTEGER PRIMARY KEY, name TEXT)")
    con.execute("INSERT INTO ps_cluster VALUES (1, 'restored-cluster')")
    if backup_source_name is not None:
        con.execute("CREATE TABLE ps_db_backup_config (id INTEGER PRIMARY KEY, source_name TEXT)")
        con.execute("INSERT INTO ps_db_backup_config VALUES (1, ?)", (backup_source_name,))
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


def _mk_pkg_file(remote_dir: Path, name: str, meta: dict) -> str:
    """按受控文件名直接落一个最小包（tar.gz 内仅 meta.json），供排序/解析用例。

    meta 写入与 build_package 一致用 indent=2（多行 JSON——批量 meta 流解析的拟真关键）。
    """
    remote_dir.mkdir(parents=True, exist_ok=True)
    path = remote_dir / name
    import io

    buf = json.dumps(meta, ensure_ascii=False, indent=2).encode()
    with tarfile.open(path, "w:gz") as tf:
        ti = tarfile.TarInfo("meta.json")
        ti.size = len(buf)
        tf.addfile(ti, io.BytesIO(buf))
    return name


class TestParseMetaStream:
    """批量 meta 流解析（_parse_meta_stream）单元用例——重点钉住真实 shell 的粘连形态。"""

    def test_parses_multiline_meta(self):
        out = '<<<PANSHI_METAa.tar.gz\n{\n  "app_version": "1.0"\n}\n>>>PANSHI_META\n'
        assert rst._parse_meta_stream(out, ["a.tar.gz"]) == {"a.tar.gz": {"app_version": "1.0"}}

    def test_handles_glued_end_delimiter(self):
        """tar 输出无末尾换行时 `}` 与 `>>>PANSHI_META` 粘在一行——必须剥掉结束符再解析。"""
        out = '<<<PANSHI_METAa.tar.gz\n{\n  "app_version": "1.0"\n}>>>PANSHI_META\n'
        assert rst._parse_meta_stream(out, ["a.tar.gz"]) == {"a.tar.gz": {"app_version": "1.0"}}

    def test_missing_package_falls_back_to_error(self):
        out = "<<<PANSHI_METAa.tar.gz\n\n>>>PANSHI_META\n"
        assert rst._parse_meta_stream(out, ["a.tar.gz", "b.tar.gz"])["b.tar.gz"]["_error"]


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

    async def test_list_accepts_new_format_and_parses_source(self, tmp_path, monkeypatch):
        """新旧格式并存可见：新格式解析出 source，旧格式 source 为 None（spec D5）。"""
        remote = FakeRemote(tmp_path / "remote")
        _mk_pkg_file(
            tmp_path / "remote", "panshi_backup_192.168.0.5_20260930_153000.tar.gz",
            {"source": "192.168.0.5", "app_version": "1.0.0"},
        )
        _mk_pkg_file(
            tmp_path / "remote", "panshi_backup_20260930_160000.tar.gz",
            {"app_version": "0.9.0"},  # 旧包 meta 无 source 键
        )
        monkeypatch.setattr(rst, "_run", remote)
        items = await rst.list_remote_packages(_target(tmp_path / "remote"))
        by_name = {i["package_name"]: i for i in items}
        assert set(by_name) == {
            "panshi_backup_192.168.0.5_20260930_153000.tar.gz",
            "panshi_backup_20260930_160000.tar.gz",
        }
        assert by_name["panshi_backup_192.168.0.5_20260930_153000.tar.gz"]["source"] == "192.168.0.5"
        assert by_name["panshi_backup_20260930_160000.tar.gz"]["source"] is None
        assert by_name["panshi_backup_192.168.0.5_20260930_153000.tar.gz"]["source_renamed"] is False
        assert by_name["panshi_backup_20260930_160000.tar.gz"]["source_renamed"] is False

    async def test_list_batches_meta_into_single_remote_command(self, tmp_path, monkeypatch):
        """列包一次远端往返：ls + stat + 批量 meta 合成单条命令（每条 SSH 握手 ~3s，
        逐条发曾使聚合列包 18s+；6 条 → 2 条且可并行）。"""
        remote_dir = tmp_path / "remote"
        _mk_pkg_file(remote_dir, "panshi_backup_node-a_20260930_120001.tar.gz", {"app_version": "1.0.0"})
        _mk_pkg_file(remote_dir, "panshi_backup_node-b_20260930_120002.tar.gz", {"app_version": "1.0.0"})
        _mk_pkg_file(remote_dir, "panshi_backup_20260930_120003.tar.gz", {"app_version": "1.0.0"})
        remote = CountingFakeRemote(remote_dir)
        monkeypatch.setattr(rst, "_run", remote)
        items = await rst.list_remote_packages(_target(remote_dir))
        assert len(items) == 3
        assert all(i["app_version"] == "1.0.0" for i in items)
        assert all(i["file_size"] and i["file_size"] > 0 for i in items)
        assert all(i["meta_error"] is None for i in items)
        assert remote.calls == 1

    async def test_list_sorts_by_parsed_ts_not_lexicographic(self, tmp_path, monkeypatch):
        """混合来源按文件名时间戳倒序：构造字典序与时间序不一致的用例防回退（D4）。"""
        remote = FakeRemote(tmp_path / "remote")
        # 字典序倒序 = zzz, legacy, aaa；时间序倒序 = legacy(13:00) > aaa(12:00) > zzz(09-29)
        _mk_pkg_file(tmp_path / "remote", "panshi_backup_zzz_20260929_120000.tar.gz", {"source": "zzz"})
        _mk_pkg_file(tmp_path / "remote", "panshi_backup_aaa_20260930_120000.tar.gz", {"source": "aaa"})
        _mk_pkg_file(tmp_path / "remote", "panshi_backup_20260930_130000.tar.gz", {})
        monkeypatch.setattr(rst, "_run", remote)
        items = await rst.list_remote_packages(_target(tmp_path / "remote"))
        assert [i["package_name"] for i in items] == [
            "panshi_backup_20260930_130000.tar.gz",
            "panshi_backup_aaa_20260930_120000.tar.gz",
            "panshi_backup_zzz_20260929_120000.tar.gz",
        ]

    async def test_list_flags_renamed_package(self, tmp_path, monkeypatch):
        """meta.source 与文件名解析不一致 → source_renamed=True（包被改名过，D5）。"""
        remote = FakeRemote(tmp_path / "remote")
        _mk_pkg_file(
            tmp_path / "remote", "panshi_backup_bbb_20260930_100000.tar.gz",
            {"source": "ccc"},  # 与文件名 bbb 不一致
        )
        _mk_pkg_file(
            tmp_path / "remote", "panshi_backup_ddd_20260930_110000.tar.gz",
            {"source": "ddd"},  # 一致
        )
        monkeypatch.setattr(rst, "_run", remote)
        items = await rst.list_remote_packages(_target(tmp_path / "remote"))
        by_name = {i["package_name"]: i for i in items}
        assert by_name["panshi_backup_bbb_20260930_100000.tar.gz"]["source_renamed"] is True
        assert by_name["panshi_backup_ddd_20260930_110000.tar.gz"]["source_renamed"] is False


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

    async def test_restore_preserves_source_name(self, tmp_path, monkeypatch):
        """恢复继承回归（设计 D7）：落位后包内 source_name 原样保留，不做清除/改写。"""
        remote = FakeRemote(tmp_path / "remote")
        pkg_info = await _mk_package(tmp_path / "remote", tmp_path, backup_source_name="old-host-01")
        monkeypatch.setattr(rst, "_run", remote)
        fake_root = pkg_info["fake_root"]
        monkeypatch.setattr(rst, "_engine_reload", lambda: None)

        with isolated_app_lifespan():
            result = await rst.verify_and_stage(_target(tmp_path / "remote"), pkg_info["name"])
            from app.core.database import AsyncSessionLocal

            async with AsyncSessionLocal() as db:
                out = await rst.execute_restore(result["verify_id"], confirmed=True, db=db)
            assert out["activated"] is True

            restored = sorted((fake_root / "data").glob("panshi.db.restored-*"))
            assert restored
            import sqlite3

            con = sqlite3.connect(restored[0])
            try:
                rows = con.execute(
                    "SELECT source_name FROM ps_db_backup_config WHERE id = 1"
                ).fetchall()
            finally:
                con.close()
            assert rows == [("old-host-01",)]

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


class MultiHostFakeRemote:
    """按 host 路由到不同 FakeRemote 实例；未注册 host = 不可达。"""

    def __init__(self):
        self.hosts: dict = {}  # host → FakeRemote

    async def __call__(self, argv, env=None, timeout=None):
        host = "?"
        for tok in argv:
            if "@" in tok and not tok.startswith("-"):
                uh = tok.split(":")[0]
                if "@" in uh:
                    host = uh.split("@", 1)[1]
        fake = self.hosts.get(host)
        if fake is None:
            return 1, "", f"ssh: connect to host {host}: Connection refused"
        return await fake(argv, env=env, timeout=timeout)


async def _seed_restore_targets(specs):
    """位置行种子（AsyncSessionLocal 世界；跨用例清理后重建）。"""
    from sqlalchemy import select

    from app.core.database import AsyncSessionLocal
    from app.core.db_config import encrypt_password
    from app.models.db_backup import DbBackupTarget

    async with AsyncSessionLocal() as s:
        for t in (await s.execute(select(DbBackupTarget))).scalars().all():
            await s.delete(t)
        await s.flush()
        for spec in specs:
            s.add(DbBackupTarget(
                name=spec["name"], host=spec["host"], port=spec.get("port", 22),
                username=spec.get("username", "backup"), auth_type="password",
                password_encrypted=encrypt_password("pw"),
                remote_dir=spec.get("remote_dir", "/srv/dr"),
                retain_count=7, enabled=spec.get("enabled", True),
            ))
        await s.commit()


class TestAggregatedListing:
    """聚合列包（设计 D5/D6）：含停用位置、去重合并、存在位置标注、不可达不阻断。"""

    async def test_aggregate_merges_by_name_and_annotates(self, tmp_path, monkeypatch):
        dir1 = tmp_path / "dr1"
        dir2 = tmp_path / "dr2"
        dir1.mkdir(); dir2.mkdir()
        _mk_pkg_file(dir1, "panshi_backup_src-a_20260930_120000.tar.gz", {})
        _mk_pkg_file(dir1, "panshi_backup_src-a_20260929_120000.tar.gz", {})
        _mk_pkg_file(dir2, "panshi_backup_src-a_20260930_120000.tar.gz", {})  # 同名包两位置都有
        _mk_pkg_file(dir2, "panshi_backup_src-a_20260928_120000.tar.gz", {})
        multi = MultiHostFakeRemote()
        multi.hosts = {"192.0.2.10": FakeRemote(dir1), "10.8.0.2": FakeRemote(dir2)}
        monkeypatch.setattr(rst, "_run", multi)
        await _seed_restore_targets([
            {"name": "局内DR", "host": "192.0.2.10"},
            {"name": "中心机房", "host": "10.8.0.2"},
        ])
        result = await rst.list_aggregated()
        names = [p["package_name"] for p in result["packages"]]
        assert names == [
            "panshi_backup_src-a_20260930_120000.tar.gz",
            "panshi_backup_src-a_20260929_120000.tar.gz",
            "panshi_backup_src-a_20260928_120000.tar.gz",
        ]  # 去重合并 + 时间倒序
        present = {p["package_name"]: [t["target_name"] for t in p["_present"]] for p in result["packages"]}
        assert present["panshi_backup_src-a_20260930_120000.tar.gz"] == ["局内DR", "中心机房"]
        assert present["panshi_backup_src-a_20260929_120000.tar.gz"] == ["局内DR"]
        assert all(s["status"] == "ok" for s in result["targets_status"])

    async def test_unreachable_target_marked_not_blocking(self, tmp_path, monkeypatch):
        dir1 = tmp_path / "dr1"
        dir1.mkdir()
        _mk_pkg_file(dir1, "panshi_backup_src-a_20260930_120000.tar.gz", {})
        multi = MultiHostFakeRemote()
        multi.hosts = {"192.0.2.10": FakeRemote(dir1)}  # 10.8.0.2 不可达
        monkeypatch.setattr(rst, "_run", multi)
        await _seed_restore_targets([
            {"name": "局内DR", "host": "192.0.2.10"},
            {"name": "中心机房", "host": "10.8.0.2"},
        ])
        result = await rst.list_aggregated()
        by_name = {s["target_name"]: s for s in result["targets_status"]}
        assert by_name["中心机房"]["status"] == "failed"
        assert "Connection refused" in (by_name["中心机房"]["error"] or "")
        assert by_name["局内DR"]["status"] == "ok"
        # 健康位置的包照常返回（不阻断）
        assert [p["package_name"] for p in result["packages"]] == ["panshi_backup_src-a_20260930_120000.tar.gz"]

    async def test_no_targets_empty_with_hint(self, tmp_path, monkeypatch):
        await _seed_restore_targets([])
        result = await rst.list_aggregated()
        assert result["packages"] == []
        assert result["targets_status"] == []
        assert result["hint"] and "手输" in result["hint"]

    async def test_disabled_targets_included_in_aggregation(self, tmp_path, monkeypatch):
        """聚合含停用位置（spec：恢复可从已停位置取包）。"""
        dir1 = tmp_path / "dr1"
        dir1.mkdir()
        _mk_pkg_file(dir1, "panshi_backup_src-a_20260930_120000.tar.gz", {})
        multi = MultiHostFakeRemote()
        multi.hosts = {"192.0.2.10": FakeRemote(dir1)}
        monkeypatch.setattr(rst, "_run", multi)
        await _seed_restore_targets([
            {"name": "停用DR", "host": "192.0.2.10", "enabled": False},
        ])
        result = await rst.list_aggregated()
        assert result["targets_status"][0]["target_name"] == "停用DR"
        assert len(result["packages"]) == 1

    async def test_list_by_target_id(self, tmp_path, monkeypatch):
        dir1 = tmp_path / "dr1"
        dir1.mkdir()
        _mk_pkg_file(dir1, "panshi_backup_src-a_20260930_120000.tar.gz", {})
        multi = MultiHostFakeRemote()
        multi.hosts = {"192.0.2.10": FakeRemote(dir1)}
        monkeypatch.setattr(rst, "_run", multi)
        await _seed_restore_targets([{"name": "局内DR", "host": "192.0.2.10"}])
        items = await rst.list_by_target_id(1)
        assert [i["package_name"] for i in items] == ["panshi_backup_src-a_20260930_120000.tar.gz"]
        with pytest.raises(RuntimeError, match="不存在"):
            await rst.list_by_target_id(999)
