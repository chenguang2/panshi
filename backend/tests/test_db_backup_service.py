"""SQLite 异地备份服务单元测试（tasks 2.1-2.4）。

subprocess（ssh/scp）全部 monkeypatch，不发生真实网络 IO。
"""

import io
import json
import sqlite3
import tarfile
from datetime import datetime
from pathlib import Path

import pytest

from app.core.db_config import ConnectionConfig, DbConfig
from app.services import db_backup_service as svc


def _make_db(path: Path, tables=("sys_user",)):
    path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(path)
    for t in tables:
        conn.execute(f"CREATE TABLE {t} (id INTEGER PRIMARY KEY, name TEXT)")
        conn.execute(f"INSERT INTO {t} (name) VALUES ('n1')")
    conn.commit()
    conn.close()
    return path


async def _seed_world_async(config_kw=None, targets=()):
    """全局行 + 位置行种子（AsyncSessionLocal 世界；跨用例清理后重建，约定 #30）。

    targets 元素：{"name", "host", "port"?, "username"?, "remote_dir"?, "retain_count"?, "enabled"?}
    """
    from tests.api_helpers import isolated_app_lifespan

    with isolated_app_lifespan():
        from sqlalchemy import select

        from app.core.database import AsyncSessionLocal
        from app.core.db_config import encrypt_password
        from app.models.db_backup import DbBackupConfig, DbBackupHistory, DbBackupHistoryTarget, DbBackupTarget

        async with AsyncSessionLocal() as s:
            # 跨用例串扰清理（约定 #30）：位置/历史表清空 + 调度状态归位
            for t in (await s.execute(select(DbBackupTarget))).scalars().all():
                await s.delete(t)
            # 显式冲刷删除（SQLAlchemy 同表 INSERT 先于 DELETE 冲刷，同名重插会撞唯一约束）
            await s.flush()
            for sr in (await s.execute(select(DbBackupHistoryTarget))).scalars().all():
                await s.delete(sr)
            await s.flush()
            for h in (await s.execute(select(DbBackupHistory))).scalars().all():
                await s.delete(h)
            await s.flush()
            cfg_defaults = {
                "last_run_at": None, "last_success_at": None,
                "last_status": None, "last_error": None,
            }
            await s.merge(DbBackupConfig(id=1, enabled=True, interval_minutes=5, **cfg_defaults, **(config_kw or {})))
            for t in targets:
                s.add(DbBackupTarget(
                    name=t["name"], host=t["host"], port=t.get("port", 22),
                    username=t.get("username", "backup"), auth_type="password",
                    password_encrypted=encrypt_password("pw"),
                    remote_dir=t.get("remote_dir", "/remote/dir"),
                    retain_count=t.get("retain_count", 7),
                    enabled=t.get("enabled", True),
                ))
            await s.commit()


class TestSnapshot:
    def test_active_missing_raises(self, tmp_path):
        cfg = DbConfig(
            active="main",
            connections=[ConnectionConfig(id="main", type="sqlite", name="m", path=str(tmp_path / "nope.db"))],
        )
        conns, skipped = svc.collect_sqlite_connections(cfg)
        assert skipped == [] and len(conns) == 1
        with pytest.raises(RuntimeError, match="active"):
            svc.snapshot_sqlite_databases(conns, active_id="main", workdir=str(tmp_path / "w"))

    def test_nonactive_missing_skipped(self, tmp_path):
        good = _make_db(tmp_path / "good.db")
        cfg = DbConfig(
            active="main",
            connections=[
                ConnectionConfig(id="main", type="sqlite", name="m", path=str(good)),
                ConnectionConfig(id="aux", type="sqlite", name="a", path=str(tmp_path / "gone.db")),
                ConnectionConfig(id="pg", type="postgres", name="p", host="x"),
            ],
        )
        conns, skipped = svc.collect_sqlite_connections(cfg)
        assert [c.id for c in conns] == ["main", "aux"]
        assert skipped == ["pg"]
        snapshots, skipped2 = svc.snapshot_sqlite_databases(conns, active_id="main", workdir=str(tmp_path / "w"))
        assert snapshots and snapshots[0]["conn_id"] == "main"
        assert [s["conn_id"] for s in skipped2] == ["aux"]

    def test_vacuum_into_readable(self, tmp_path):
        src = _make_db(tmp_path / "src.db")
        dst = tmp_path / "snap.db"
        svc._vacuum_into(src, dst)
        conn = sqlite3.connect(dst)
        rows = conn.execute("SELECT name FROM sys_user").fetchall()
        conn.close()
        assert rows == [("n1",)]


class TestPackage:
    def _workdir(self, tmp_path):
        w = tmp_path / "w"
        w.mkdir()
        db1 = _make_db(tmp_path / "panshi.db")
        (tmp_path / ".jwt_secret").write_text("secret-key-material")
        return w, db1

    def test_layout_and_meta(self, tmp_path):
        w, db1 = self._workdir(tmp_path)
        snapshots = [{"conn_id": "main", "source": str(db1), "snapshot": str(db1)}]
        meta = {
            "format_version": 1,
            "created_utc": datetime.utcnow().isoformat(),
            "active_connection_id": "main",
            "files": {},
            "databases": {"main": {"original_path": "./data/panshi.db", "archive": "databases/main.db"}},
            "skipped_databases": [],
            "includes": {"static": False, "task_scripts": False, "task_logs": False},
        }
        pkg_path, final_meta = svc.build_package(
            workdir=str(w),
            snapshots=snapshots,
            skipped=[],
            includes={"static": False, "task_scripts": False, "task_logs": False},
            version_info={"app_version": "1.0.0", "git_commit": None},
            meta=meta,
        )
        assert pkg_path.endswith(".tar.gz")
        with tarfile.open(pkg_path, "r:gz") as tf:
            names = tf.getnames()
            assert "meta.json" in names
            assert "config/.jwt_secret" in names
            assert "databases/main.db" in names
            member = tf.extractfile("meta.json")
            m = json.loads(member.read().decode())
        assert m["active_connection_id"] == "main"
        assert m["files"]["databases/main.db"]["size"] == db1.stat().st_size
        assert len(m["files"]["databases/main.db"]["sha256"]) == 64
        assert m["app_version"] == "1.0.0"

    def test_package_name_contains_source(self):
        name = svc._package_name("192.168.0.5", datetime(2026, 9, 30, 8, 30, 5))
        assert name == "panshi_backup_192.168.0.5_20260930_083005.tar.gz"
        assert svc.PACKAGE_NAME_RE.match(name)

    def test_meta_records_source(self, tmp_path):
        """meta.json 记录来源标识（spec：元数据记录来源标识），供恢复侧核对。"""
        w, db1 = self._workdir(tmp_path)
        snapshots = [{"conn_id": "main", "source": str(db1), "snapshot": str(db1)}]
        _pkg, meta = svc.build_package(
            workdir=str(w),
            snapshots=snapshots,
            skipped=[],
            includes={},
            version_info={"app_version": "1.0.0", "git_commit": None},
            meta={"active_connection_id": "main", "databases": {}},
            source="srv-a",
        )
        assert meta["source"] == "srv-a"
        with tarfile.open(_pkg) as tf:
            m = json.loads(tf.extractfile("meta.json").read().decode())
        assert m == meta
        assert m["format_version"] == 1

    def test_meta_created_local_is_bare_iso(self, tmp_path):
        """created_local 必须是裸 ISO8601（可含 +08:00 offset）——历史值带
        " (Asia/Shanghai)" 注记后缀，非合法 ISO，前端 new Date 直接 Invalid Date。"""
        w, db1 = self._workdir(tmp_path)
        snapshots = [{"conn_id": "main", "source": str(db1), "snapshot": str(db1)}]
        _pkg, meta = svc.build_package(
            workdir=str(w),
            snapshots=snapshots,
            skipped=[],
            includes={},
            version_info={"app_version": "1.0.0", "git_commit": None},
            meta={"active_connection_id": "main", "databases": {}},
        )
        from datetime import datetime

        assert "(" not in meta["created_local"]
        assert isinstance(datetime.fromisoformat(meta["created_local"]), datetime)

    def test_package_name_matches_whitelist_for_various_sources(self):
        for source in ("192.168.0.5", "edge-01.aoh.local", "20260101", "host_20260101_123456", "a"):
            name = svc._package_name(source, datetime(2026, 9, 30, 15, 30, 0))
            assert svc.PACKAGE_NAME_RE.match(name), name


class TestPackageWhitelistRegex:
    """组合白名单正则与 parse_package_name（设计 D2：单点定义、两分支不相交、拆分唯一）。"""

    @pytest.mark.parametrize(
        "name",
        [
            "panshi_backup_192.168.0.5_20260930_153000.tar.gz",   # IP source
            "panshi_backup_edge-01.aoh_20260930_153000.tar.gz",  # 含点/中划线
            "panshi_backup_20260101_20260930_153000.tar.gz",     # 纯数字 source
            "panshi_backup_host_20260101_123456_20260930_153000.tar.gz",  # 内嵌 _数字_数字
            "panshi_backup_20260930_153000.tar.gz",              # 旧格式（升级前）
            "panshi_backup_20200101_000000.tar.gz",              # 旧格式（古老）
        ],
    )
    def test_matches(self, name):
        assert svc.PACKAGE_NAME_RE.match(name), name

    @pytest.mark.parametrize(
        "name",
        [
            "panshi_backup_192.168.0.5_20260930_153000.tar.gz.part",  # .part 残留
            "panshi_backup_x.tar.gz",
            "panshi_backup_20260930_1530.tar.gz",        # 时间戳不完整
            "panshi_backup_2026093O_153000.tar.gz",      # 字母 O 冒充数字
            "other_backup_20260930_153000.tar.gz",
            "panshi_backup_.tar.gz",
            "panshi_backup__20260930_153000.tar.gz",     # 空 source（双下划线）
            "../panshi_backup_a_20260930_153000.tar.gz",
            "panshi_backup_a_20260930_153000.tar.gz.bak",
            "Panshi_Backup_a_20260930_153000.tar.gz",
        ],
    )
    def test_rejects(self, name):
        assert not svc.PACKAGE_NAME_RE.match(name)

    @pytest.mark.parametrize(
        "name,source,ts",
        [
            ("panshi_backup_192.168.0.5_20260930_153000.tar.gz", "192.168.0.5", "20260930_153000"),
            ("panshi_backup_20260930_153000.tar.gz", None, "20260930_153000"),  # 旧格式 → None
            # 拆分唯一不变量：时间戳后缀恰占尾部 15 字符，source 随之唯一确定
            ("panshi_backup_host_20260101_123456_20260930_153000.tar.gz", "host_20260101_123456", "20260930_153000"),
            ("panshi_backup_20260101_123456_20260930_153000.tar.gz", "20260101_123456", "20260930_153000"),
        ],
    )
    def test_parse_package_name(self, name, source, ts):
        assert svc.parse_package_name(name) == (source, ts)

    def test_parse_non_whitelist_returns_none_none(self):
        assert svc.parse_package_name("unrelated.txt") == (None, None)
        assert svc.parse_package_name("") == (None, None)

    def test_legacy_never_misjudged_as_source_bearing(self):
        """两种格式不相交：旧格式名绝不会被解析出 source（长度喂不饱新分支）。"""
        for legacy in ("panshi_backup_20260930_153000.tar.gz", "panshi_backup_19991231_235959.tar.gz"):
            source, ts = svc.parse_package_name(legacy)
            assert source is None
            assert ts == legacy[len("panshi_backup_"):-len(".tar.gz")]

    def test_roundtrip_via_generated_name(self):
        """生成 → 解析 round-trip：source 原样取回（含内嵌时间戳形态的 source）。"""
        now = datetime(2026, 9, 30, 15, 30, 0)
        for source in ("192.168.0.5", "host_20260101_123456", "20260101_123456", "a.b-c_d"):
            name = svc._package_name(source, now)
            assert svc.parse_package_name(name) == (source, "20260930_153000")


class TestPushAndRetention:
    async def test_push_uses_part_then_mv(self, tmp_path, monkeypatch):
        calls = []

        async def fake_run(cmd, env=None, timeout=None):
            calls.append((list(cmd), env))
            return 0, "", ""

        monkeypatch.setattr(svc, "_run", fake_run)
        local = tmp_path / "pkg.tar.gz"
        local.write_bytes(b"x")
        target = {"host": "h", "port": 22, "username": "u", "auth_type": "password"}
        await svc.push_package(target, str(local), "/remote/dir", "panshi_backup_x.tar.gz", password="pw")
        scp_call = calls[0]
        mv_call = calls[1]
        assert scp_call[0][0] == "sshpass" and scp_call[0][1] == "-e"
        assert scp_call[0][0:2] == ["sshpass", "-e"] or True
        # argv 不含明文密码
        assert "pw" not in scp_call[0] and "pw" not in mv_call[0]
        # 密码经环境变量传递
        assert scp_call[1]["SSHPASS"] == "pw"
        assert "/remote/dir/panshi_backup_x.tar.gz.part" in " ".join(scp_call[0])
        assert "mv" in " ".join(mv_call[0]) and ".part" in " ".join(mv_call[0])

    async def test_retention_cleanup_removes_old_only(self, monkeypatch):
        calls = []

        async def fake_run(cmd, env=None, timeout=None):
            calls.append(list(cmd))
            if cmd[0] in ("ssh", "sshpass"):
                # 第一次是 ls，后续是 rm
                if any("ls -1" in c for c in cmd):
                    return 0, "\n".join(
                        ["panshi_backup_20260930_120000.tar.gz", "panshi_backup_20260929_120000.tar.gz",
                         "panshi_backup_20260928_120000.tar.gz", "unrelated.txt"]
                    ), ""
                return 0, "", ""
            return 0, "", ""

        monkeypatch.setattr(svc, "_run", fake_run)
        target = {"host": "h", "port": 22, "username": "u", "auth_type": "password"}
        # 旧格式目录：legacy 全部归属清理集（自然老化，设计 D3），行为与升级前一致
        removed = await svc.cleanup_retention(
            target, "/remote/dir", retain_count=2, source="192.168.0.5", password="pw"
        )
        # 只删最旧的 1 个，白名单外的文件不动
        assert removed == ["panshi_backup_20260928_120000.tar.gz"]
        rm_calls = [c for c in calls if "rm" in " ".join(c)]
        assert len(rm_calls) == 1
        assert "panshi_backup_20260928_120000.tar.gz" in " ".join(rm_calls[0])
        assert "unrelated.txt" not in " ".join(rm_calls[0])

    async def test_retention_filters_by_source(self, monkeypatch):
        """混合目录：候选集 = 本源新格式 ∪ 旧格式；他源新格式不删不计（设计 D3）。"""
        listing = [
            # 本源（192.168.0.5）新格式 × 3
            "panshi_backup_192.168.0.5_20260930_120000.tar.gz",
            "panshi_backup_192.168.0.5_20260929_120000.tar.gz",
            "panshi_backup_192.168.0.5_20260928_120000.tar.gz",
            # 他源新格式 × 2（别机命脉，绝不删）
            "panshi_backup_10.8.0.2_20260930_130000.tar.gz",
            "panshi_backup_10.8.0.2_20260920_100000.tar.gz",
            # 旧格式 × 2（升级前本机产物，自然老化）
            "panshi_backup_20260930_123000.tar.gz",
            "panshi_backup_20260926_090000.tar.gz",
            "unrelated.txt",
            "panshi_backup_partial.tar.gz.part",
        ]
        rm_cmds = []

        async def fake_run(cmd, env=None, timeout=None):
            if any("ls -1" in c for c in cmd):
                return 0, "\n".join(listing), ""
            if "rm" in " ".join(cmd):
                rm_cmds.append(" ".join(cmd))
                return 0, "", ""
            return 0, "", ""

        monkeypatch.setattr(svc, "_run", fake_run)
        target = {"host": "h", "port": 22, "username": "u", "auth_type": "password"}
        # 候选集（本源 ∪ legacy）按时间戳倒序（与格式无关，新旧混排）：
        #   legacy 0930_1230 > own 0930_1200 > own 0929_1200 > own 0928_1200 > legacy 0926_0900
        # （legacy 0930_1230 比 own 0930_1200 新——证明 legacy 参与同一时间序）
        removed = await svc.cleanup_retention(
            target, "/remote/dir", retain_count=2, source="192.168.0.5", password="pw"
        )
        assert removed == [
            "panshi_backup_192.168.0.5_20260929_120000.tar.gz",
            "panshi_backup_192.168.0.5_20260928_120000.tar.gz",
            "panshi_backup_20260926_090000.tar.gz",
        ]
        assert len(rm_cmds) == 1
        rm_cmd = rm_cmds[0]
        for gone in removed:
            assert gone in rm_cmd
        # 他源新格式包：不删、不计入保留份数
        for other in ("panshi_backup_10.8.0.2_20260930_130000.tar.gz",
                      "panshi_backup_10.8.0.2_20260920_100000.tar.gz"):
            assert other not in rm_cmd
        # 保留窗内的新旧格式包同样不动
        for kept in ("panshi_backup_20260930_123000.tar.gz",
                     "panshi_backup_192.168.0.5_20260930_120000.tar.gz"):
            assert kept not in rm_cmd
        assert "unrelated.txt" not in rm_cmd
        assert ".part" not in rm_cmd

    async def test_retention_keeps_all_when_within_count(self, monkeypatch):
        async def fake_run(cmd, env=None, timeout=None):
            if any("ls -1" in c for c in cmd):
                return 0, "\n".join([
                    "panshi_backup_192.168.0.5_20260930_120000.tar.gz",
                    "panshi_backup_10.8.0.2_20260930_130000.tar.gz",
                ]), ""
            return 0, "", ""

        monkeypatch.setattr(svc, "_run", fake_run)
        target = {"host": "h", "port": 22, "username": "u", "auth_type": "password"}
        removed = await svc.cleanup_retention(target, "/remote/dir", retain_count=5, source="192.168.0.5")
        assert removed == []

    async def test_retention_own_source_regex_injection_safe(self, monkeypatch):
        """own source 含正则元字符时不得放大匹配面（re.escape 防注入）。"""
        listing = [
            "panshi_backup_a.b_20260930_120000.tar.gz",     # 本源（点号是正则元字符）
            "panshi_backup_aXb_20260930_120000.tar.gz",     # '.' 通配陷阱目标（他源）
            "panshi_backup_20260920_100000.tar.gz",         # legacy
        ]
        rm_cmds = []

        async def fake_run(cmd, env=None, timeout=None):
            if any("ls -1" in c for c in cmd):
                return 0, "\n".join(listing), ""
            if "rm" in " ".join(cmd):
                rm_cmds.append(" ".join(cmd))
                return 0, "", ""
            return 0, "", ""

        monkeypatch.setattr(svc, "_run", fake_run)
        target = {"host": "h", "port": 22, "username": "u", "auth_type": "password"}
        # 候选集（own ∪ legacy）按时间倒序：own 0930_1200 > legacy 0920_1000 → 保留 1 份删 legacy。
        # 若 '.' 未 re.escape，own_re 会把 aXb 也当本源吃进候选集 → aXb 被删（本用例即失败）
        removed = await svc.cleanup_retention(target, "/remote/dir", retain_count=1, source="a.b")
        assert removed == ["panshi_backup_20260920_100000.tar.gz"]
        assert rm_cmds and "panshi_backup_aXb_20260930_120000.tar.gz" not in rm_cmds[0]

    async def test_ssh_argv_key_auth(self):
        argv, env = svc._ssh_argv(
            {"host": "h", "port": 2222, "username": "u", "auth_type": "key"}, "ls", password=None,
            key_path="/k/id_ed25519",
        )
        assert argv[0] == "ssh"
        assert "-p" in argv and "2222" in argv
        assert "-i" in argv and "/k/id_ed25519" in argv
        assert "BatchMode=yes" in argv


class TestDataSegmentsAndHygiene:
    def test_include_switches_control_data_segments(self, tmp_path, monkeypatch):
        fake_root = tmp_path / "backend"
        for rel in ["data/static", "data/task-scripts", "data/task-logs"]:
            d = fake_root / rel
            d.mkdir(parents=True)
        (fake_root / "data/static/a.txt").write_text("s")
        (fake_root / "data/task-scripts/s.sh").write_text("#!/bin/sh")
        (fake_root / "data/task-logs/l.log").write_text("log")
        monkeypatch.setattr(svc, "_backend_root", lambda: fake_root)

        db1 = _make_db(tmp_path / "panshi.db")
        (tmp_path / "junk.db").write_bytes(b"not in snapshots")

        def members(includes):
            snaps, _skip = svc.snapshot_sqlite_databases(
                [ConnectionConfig(id="main", type="sqlite", name="m", path=str(db1))], "main", str(tmp_path / "w1")
            )
            w = tmp_path / ("pkg_on" if includes else "pkg_off")
            w.mkdir(exist_ok=True)
            pkg, _meta = svc.build_package(
                workdir=str(w), snapshots=snaps, skipped=[],
                includes=includes, version_info={"app_version": "1", "git_commit": None},
                meta={"active_connection_id": "main", "databases": {}},
            )
            with tarfile.open(pkg) as tf:
                return tf.getnames()

        names_on = members({"static": True, "task_scripts": True, "task_logs": True})
        assert "data/static/a.txt" in names_on
        assert "data/task-scripts/s.sh" in names_on
        assert "data/task-logs/l.log" in names_on
        names_off = members({"static": False, "task_scripts": False, "task_logs": False})
        assert not any(n.startswith("data/") for n in names_off)
        # 垃圾文件（不在快照清单）绝不进包
        assert "junk.db" not in names_on and "databases/junk.db" not in names_on


class TestVersionInfo:
    def test_app_version_info(self):
        info = svc._app_version_info()
        assert set(info) == {"app_version", "git_commit"}
        assert info["app_version"]


class TestResolveSourceName:
    """来源标识解析（设计 D1：出口 IP → hostname → 兜底常量，一次性解析持久化）。"""

    def _row(self, **kw):
        from app.models.db_backup import DbBackupConfig

        return DbBackupConfig(
            id=1, host=kw.get("host", "203.0.113.9"), port=kw.get("port", 22),
            source_name=kw.get("source_name"),
        )

    @pytest.mark.parametrize(
        "raw,expected",
        [
            ("192.168.0.5", "192.168.0.5"),          # 纯 IP 原样
            ("  10.1.2.3\n", "10.1.2.3"),            # 去首尾空白
            ("fe80::1", "fe80--1"),                  # IPv6 冒号 → '-'（确定性变形）
            ("edge-01.aoh", "edge-01.aoh"),          # 点号/中划线合法
            ("20260101", "20260101"),                # 纯数字合法
            ("-host", "host"),                       # 首字符非字母数字 → 去前导
            ("x" * 100, "x" * 64),                   # 超长截断 64
            ("???", svc.FALLBACK_SOURCE_NAME),       # 清洗后为空 → 兜底常量
            ("", svc.FALLBACK_SOURCE_NAME),
            (None, svc.FALLBACK_SOURCE_NAME),
        ],
    )
    def test_clean_source_name(self, raw, expected):
        assert svc._clean_source_name(raw) == expected
        # 清洗结果必须满足校验正则（设计 D1）
        assert svc.SOURCE_NAME_RE.match(expected)

    async def test_resolve_returns_stored_without_probing(self, monkeypatch):
        """备份执行只读存储值：存储值非空时绝不动态探测。"""
        calls = []

        def spy_probe(host, port):
            calls.append((host, port))
            return "10.9.9.9"

        monkeypatch.setattr(svc, "_detect_source_raw", spy_probe)
        row = self._row(source_name="192.168.0.5")
        assert await svc.resolve_source_name(row) == "192.168.0.5"
        assert calls == []

    async def test_resolve_probes_cleans_and_writes_back(self, monkeypatch):
        monkeypatch.setattr(svc, "_detect_source_raw", lambda host, port: "fe80::1")
        row = self._row(source_name=None)
        got = await svc.resolve_source_name(row)
        assert got == "fe80--1"
        assert row.source_name == "fe80--1"  # 回写配置行（由调用方事务提交持久化）

    async def test_resolve_force_reprobes(self, monkeypatch):
        """配置保存载荷空 → 强制重解析（「清空字段重存即重解析」补救路径）。"""
        monkeypatch.setattr(svc, "_detect_source_raw", lambda host, port: "10.0.0.1")
        row = self._row(source_name="stale-host")
        assert await svc.resolve_source_name(row, force=True) == "10.0.0.1"
        assert row.source_name == "10.0.0.1"

    def test_detect_raw_udp_connect_uses_target(self, monkeypatch):
        """出口 IP 探测：UDP connect 到配置的 target host:port（不发真实流量）。"""
        seen = {}

        class FakeSock:
            def __init__(self, *a, **kw):
                pass

            def settimeout(self, t):
                pass

            def connect(self, addr):
                seen["addr"] = addr

            def getsockname(self):
                return ("192.168.100.7", 51234)

            def close(self):
                pass

        monkeypatch.setattr(svc.socket, "socket", FakeSock)
        assert svc._detect_source_raw("203.0.113.9", 2222) == "192.168.100.7"
        assert seen["addr"] == ("203.0.113.9", 2222)

    def test_detect_raw_fallback_chain(self, monkeypatch):
        """IP 不可得 → hostname → 兜底常量，逐级回退。"""
        import socket as _socket

        def _no_sock(*a, **kw):
            raise OSError("no route")

        monkeypatch.setattr(svc, "socket", type("S", (), {
            "socket": staticmethod(_no_sock),
            "gethostname": staticmethod(lambda: "hb-edge-01"),
        }))
        assert svc._detect_source_raw("unreachable", 22) == "hb-edge-01"

        def _no_hostname():
            raise OSError("no hostname")

        monkeypatch.setattr(svc, "socket", type("S", (), {
            "socket": staticmethod(_no_sock),
            "gethostname": staticmethod(_no_hostname),
        }))
        assert svc._detect_source_raw("unreachable", 22) == svc.FALLBACK_SOURCE_NAME
        assert _socket.gethostname()  # 仅确认原模块未被污染


class TestPerformBackup:
    async def test_uses_stored_source_without_probing(self, tmp_path, monkeypatch):
        """备份执行只读存储值：包名/meta 用已存 source_name，绝不动态探测（D1）。"""
        from app.core.db_config import ConnectionConfig, DbConfig

        db1 = _make_db(tmp_path / "panshi.db")
        cfg = DbConfig(
            active="main",
            connections=[ConnectionConfig(id="main", type="sqlite", name="m", path=str(db1))],
        )
        monkeypatch.setattr(svc.db_config, "load_config", lambda: cfg)
        monkeypatch.setattr(svc, "_app_version_info", lambda: {"app_version": "t", "git_commit": None})
        probes = []
        monkeypatch.setattr(svc, "_detect_source_raw", lambda h, p: probes.append(1) or "9.9.9.9")

        seen_cmds = []

        async def fake_run(cmd, env=None, timeout=None):
            seen_cmds.append(" ".join(cmd))
            return 0, "", ""

        monkeypatch.setattr(svc, "_run", fake_run)

        await _seed_world_async(
            config_kw={"source_name": "192.168.0.5"},
            targets=[{"name": "t1", "host": "h"}],
        )
        result = await svc.perform_backup(trigger="probe-check")
        assert result["package_name"].startswith("panshi_backup_192.168.0.5_")
        assert svc.PACKAGE_NAME_RE.match(result["package_name"])
        assert probes == []  # 存储值非空 → 绝不探测

    async def test_orchestration_and_transaction_discipline(self, tmp_path, monkeypatch):
        """端到端（mock SSH）：历史两段提交、状态回写、外部 IO 期间无未决事务。"""
        from app.core import database as core_db
        from app.core.db_config import ConnectionConfig, DbConfig
        from tests.api_helpers import isolated_app_lifespan

        db1 = _make_db(tmp_path / "panshi.db")
        cfg = DbConfig(
            active="main",
            connections=[ConnectionConfig(id="main", type="sqlite", name="m", path=str(db1))],
        )
        monkeypatch.setattr(svc.db_config, "load_config", lambda: cfg)
        monkeypatch.setattr(svc, "_app_version_info", lambda: {"app_version": "t", "git_commit": None})

        recorded_sessions = []
        real_factory = core_db.AsyncSessionLocal

        class RecordingFactory:
            def __call__(self):
                s = real_factory()
                recorded_sessions.append(s)
                return s

        monkeypatch.setattr(core_db, "AsyncSessionLocal", RecordingFactory())

        async def fake_run(cmd, env=None, timeout=None):
            # 外部 IO 瞬间：此前创建的所有会话都不得持有事务（约定 #29）
            for s in recorded_sessions:
                assert s.in_transaction() is False, "外部 IO 期间不得持有数据库事务"
            return 0, "", ""

        monkeypatch.setattr(svc, "_run", fake_run)

        await _seed_world_async(
            config_kw={"source_name": "192.168.0.5"},
            targets=[{"name": "t1", "host": "h"}],
        )

        with isolated_app_lifespan():
            from app.core.database import AsyncSessionLocal
            from app.models.db_backup import DbBackupConfig, DbBackupHistory

            result = await svc.perform_backup(trigger="manual")
            assert result["package_name"].startswith("panshi_backup_")

            async with AsyncSessionLocal() as s:
                from sqlalchemy import select

                rows = (
                    await s.execute(
                        select(DbBackupHistory)
                        .where(DbBackupHistory.trigger == "manual")
                        .order_by(DbBackupHistory.id.desc())
                    )
                ).scalars().all()
                assert len(rows) == 1
                assert rows[0].status == "success"
                assert rows[0].trigger == "manual"
                assert rows[0].file_size > 0
                cfg_row = await s.get(DbBackupConfig, 1)
                assert cfg_row.last_status == "success"
                assert cfg_row.last_success_at is not None

    async def test_failure_records_history(self, tmp_path, monkeypatch):
        from app.core.db_config import ConnectionConfig, DbConfig
        from tests.api_helpers import isolated_app_lifespan

        cfg = DbConfig(
            active="main",
            connections=[ConnectionConfig(id="main", type="sqlite", name="m", path=str(tmp_path / "nope.db"))],
        )
        monkeypatch.setattr(svc.db_config, "load_config", lambda: cfg)

        await _seed_world_async(targets=[{"name": "t1", "host": "h"}])

        with isolated_app_lifespan():
            from app.core.database import AsyncSessionLocal
            from app.models.db_backup import DbBackupConfig, DbBackupHistory, DbBackupHistoryTarget

            with pytest.raises(RuntimeError, match="active|活动"):
                await svc.perform_backup(trigger="scheduled")

            async with AsyncSessionLocal() as s:
                from sqlalchemy import select

                rows = (await s.execute(
                    select(DbBackupHistory).order_by(DbBackupHistory.id.desc())
                )).scalars().all()
                assert rows and rows[0].status == "failed"
                # 构建阶段失败 → 无子结果行（D4）
                subs = (await s.execute(select(DbBackupHistoryTarget))).scalars().all()
                assert subs == []
                cfg_row = await s.get(DbBackupConfig, 1)
                assert cfg_row.last_status == "failed"
                assert cfg_row.last_error


class TestEnsureTargetsMigrated:
    """存量单行一次性迁移（设计 D7）：幂等、标志防复活、name 唯一约束兜底并发。"""

    async def _seed_legacy(self, **kw):
        from tests.api_helpers import isolated_app_lifespan

        with isolated_app_lifespan():
            from sqlalchemy import select

            from app.core.database import AsyncSessionLocal
            from app.core.db_config import encrypt_password
            from app.models.db_backup import DbBackupConfig, DbBackupTarget

            fields = {
                "id": 1, "enabled": False, "host": "192.0.2.10", "port": 2222, "username": "backup",
                "auth_type": "password", "password_encrypted": encrypt_password("legacy-pw"),
                "key_path": None, "remote_dir": "/srv/legacy-dr",
                "interval_minutes": 15, "retain_count": 12, "source_name": "192.168.0.5",
                "targets_migrated": False,
            }
            fields.update(kw)
            async with AsyncSessionLocal() as s:
                # 跨用例串扰清理（约定 #30）：位置表清空 + 标志显式归位
                # （merge 未提供的列保留库中原值，须逐字段覆写）
                for t in (await s.execute(select(DbBackupTarget))).scalars().all():
                    await s.delete(t)
                row = await s.get(DbBackupConfig, 1)
                if row is None:
                    row = DbBackupConfig(id=1)
                    s.add(row)
                for k, v in fields.items():
                    if k != "id":
                        setattr(row, k, v)
                await s.commit()

    async def _call(self):
        return await svc.ensure_targets_migrated()

    async def _targets(self):
        from tests.api_helpers import isolated_app_lifespan

        with isolated_app_lifespan():
            from sqlalchemy import select

            from app.core.database import AsyncSessionLocal
            from app.models.db_backup import DbBackupConfig, DbBackupTarget

            async with AsyncSessionLocal() as s:
                rows = (await s.execute(select(DbBackupTarget).order_by(DbBackupTarget.id))).scalars().all()
                cfg = await s.get(DbBackupConfig, 1)
                return [
                    {
                        "name": r.name, "host": r.host, "port": r.port, "username": r.username,
                        "auth_type": r.auth_type, "password_encrypted": r.password_encrypted,
                        "key_path": r.key_path, "remote_dir": r.remote_dir,
                        "retain_count": r.retain_count, "enabled": r.enabled,
                    }
                    for r in rows
                ], (cfg.targets_migrated if cfg else None)

    async def test_creates_default_from_legacy_row(self):
        """标志假 + 旧 host 非空 → 建 name=default 复制全部旧目标字段并置位标志。"""
        await self._seed_legacy()
        assert await self._call() is True
        targets, flag = await self._targets()
        assert len(targets) == 1
        t = targets[0]
        assert t["name"] == "default"
        assert t["host"] == "192.0.2.10" and t["port"] == 2222
        assert t["username"] == "backup" and t["auth_type"] == "password"
        assert t["password_encrypted"]  # 密文原样复制（不解密重加密）
        assert t["remote_dir"] == "/srv/legacy-dr" and t["retain_count"] == 12
        assert t["enabled"] is True
        assert flag is True

    async def test_flag_true_no_revival_even_with_zero_targets(self):
        """标志真 + 位置被删光 → 不复活默认位置（spec：删光位置后重启不复活）。"""
        await self._seed_legacy(targets_migrated=True)
        assert await self._call() is False
        targets, flag = await self._targets()
        assert targets == []
        assert flag is True

    async def test_empty_host_noop(self):
        """旧 host 为空（从未配置目标）→ 不触发迁移。"""
        await self._seed_legacy(host=None, remote_dir=None, username=None, password_encrypted=None)
        assert await self._call() is False
        targets, _ = await self._targets()
        assert targets == []

    async def test_repeat_call_creates_single_row(self):
        await self._seed_legacy()
        assert await self._call() is True
        assert await self._call() is False  # 已置位 → 不再触发
        targets, _ = await self._targets()
        assert len(targets) == 1

    async def test_existing_default_adopts_and_sets_flag(self):
        """并发兜底路径：name=default 已存在（对手方已建）且标志仍假 → 只置标志不重复建。"""
        from tests.api_helpers import isolated_app_lifespan

        await self._seed_legacy()
        with isolated_app_lifespan():
            from app.core.database import AsyncSessionLocal
            from app.models.db_backup import DbBackupTarget

            async with AsyncSessionLocal() as s:
                s.add(DbBackupTarget(
                    name="default", host="192.0.2.10", port=2222, username="backup",
                    remote_dir="/srv/legacy-dr", retain_count=12, enabled=True,
                ))
                await s.commit()
        assert await self._call() is True
        targets, flag = await self._targets()
        assert len(targets) == 1  # 恰好一条（并发双调用恰好建一条的语义由唯一约束保证）
        assert flag is True


class _FakeRemoteMulti:
    """多目标远端桩：按 host 区分成败与列包输出。"""

    def __init__(self):
        self.calls = []          # (host, cmd)
        self.hosts_ok = set()
        self.listing = {}        # host → ls -1 输出

    async def run(self, argv, env=None, timeout=None):
        host = "?"
        for tok in argv:
            if "@" in tok and not tok.startswith("-"):
                uh = tok.split(":")[0]
                if "@" in uh:
                    host = uh.split("@", 1)[1]
        cmd = argv[-1]
        self.calls.append((host, cmd))
        if host not in self.hosts_ok:
            return 1, "", "ssh: connect to host refused"
        if cmd.startswith("ls -1"):
            return 0, self.listing.get(host, ""), ""
        if cmd.startswith("mv "):
            # 原子改名落地 → 后续 ls 能看到该包（真实远端行为）
            # mv 命令形如：mv '/dir/pkg.part' '/dir/pkg'（shlex.quote 带引号全路径）
            name = cmd.rsplit("/", 1)[-1].strip("'\"")
            self.listing.setdefault(host, "")
            if name and not self.listing[host].endswith(name):
                self.listing[host] = (self.listing[host] + "\n" + name).strip("\n")
        return 0, "", ""

    def pushes(self, host):
        return [c for h, c in self.calls if h == host and (c.startswith("mv ") or ".part" in c)]


class TestFanoutBackup:
    """扇出执行与三态（设计 D3/D4）：一次构建、逐位置推送、独立保留、部分失败不中断。"""

    async def _seed(self, monkeypatch, tmp_path, targets, config_kw=None):
        db1 = _make_db(tmp_path / "panshi.db")
        cfg = DbConfig(
            active="main",
            connections=[ConnectionConfig(id="main", type="sqlite", name="m", path=str(db1))],
        )
        monkeypatch.setattr(svc.db_config, "load_config", lambda: cfg)
        monkeypatch.setattr(svc, "_app_version_info", lambda: {"app_version": "t", "git_commit": None})
        await _seed_world_async(
            config_kw={"source_name": "192.168.0.5", **(config_kw or {})},
            targets=targets,
        )

    async def _history_state(self):
        from tests.api_helpers import isolated_app_lifespan

        with isolated_app_lifespan():
            from sqlalchemy import select

            from app.core.database import AsyncSessionLocal
            from app.models.db_backup import DbBackupConfig, DbBackupHistory, DbBackupHistoryTarget

            async with AsyncSessionLocal() as s:
                rows = (await s.execute(
                    select(DbBackupHistory).order_by(DbBackupHistory.id.desc())
                )).scalars().all()
                subs = (await s.execute(select(DbBackupHistoryTarget))).scalars().all()
                cfg = await s.get(DbBackupConfig, 1)
                return rows, subs, cfg

    async def test_fanout_builds_once_pushes_each_target(self, tmp_path, monkeypatch):
        """包只构建一次，同一包名推送到每个启用位置（spec：多位置扇出）。"""
        builds = []
        real_build = svc.build_package

        def counting_build(**kw):
            builds.append(kw.get("source"))
            return real_build(**kw)

        monkeypatch.setattr(svc, "build_package", counting_build)
        fake = _FakeRemoteMulti()
        fake.hosts_ok = {"192.0.2.10", "10.8.0.2"}
        monkeypatch.setattr(svc, "_run", fake.run)
        await self._seed(monkeypatch, tmp_path, [
            {"name": "局内DR", "host": "192.0.2.10", "retain_count": 7},
            {"name": "中心机房", "host": "10.8.0.2", "retain_count": 30},
        ])

        result = await svc.perform_backup(trigger="manual")

        assert len(builds) == 1  # 构建一次
        assert result["status"] == "success"
        pkg = result["package_name"]
        assert pkg.startswith("panshi_backup_192.168.0.5_")
        for host in ("192.0.2.10", "10.8.0.2"):
            pushes = fake.pushes(host)
            assert any(pkg in c for c in pushes), f"{host} 未收到 {pkg}"
        # 响应含每目标子结果
        by_name = {t["target_name"]: t["status"] for t in result["targets"]}
        assert by_name == {"局内DR": "success", "中心机房": "success"}
        rows, subs, cfg = await self._history_state()
        assert rows[0].status == "success"
        assert {(s.target_name, s.status) for s in subs} == {("局内DR", "success"), ("中心机房", "success")}
        assert cfg.last_status == "success" and cfg.last_success_at is not None

    async def test_partial_failure_continues_to_next_target(self, tmp_path, monkeypatch):
        """单位置失败记录子结果后继续下一位置；整体 partial（spec：单位置失败不中断）。"""
        fake = _FakeRemoteMulti()
        fake.hosts_ok = {"10.8.0.2"}  # 192.0.2.10 失败
        monkeypatch.setattr(svc, "_run", fake.run)
        await self._seed(monkeypatch, tmp_path, [
            {"name": "局内DR", "host": "192.0.2.10"},
            {"name": "中心机房", "host": "10.8.0.2"},
        ])

        result = await svc.perform_backup(trigger="manual")

        assert result["status"] == "partial"
        by_name = {t["target_name"]: t["status"] for t in result["targets"]}
        assert by_name["局内DR"] == "failed" and by_name["中心机房"] == "success"
        failed = next(t for t in result["targets"] if t["target_name"] == "局内DR")
        assert failed["error"] and "refused" in failed["error"]
        assert failed["duration_ms"] >= 0
        # 健康位置照常收到推送
        assert any(result["package_name"] in c for c in fake.pushes("10.8.0.2"))
        rows, subs, cfg = await self._history_state()
        assert rows[0].status == "partial"
        # last_success_at 仅全绿更新（partial 不更新）
        assert cfg.last_status == "partial"
        assert cfg.last_success_at is None
        # error 汇总逐目标拼接
        assert "局内DR" in (rows[0].error or "")

    async def test_all_targets_failed(self, tmp_path, monkeypatch):
        fake = _FakeRemoteMulti()
        fake.hosts_ok = set()
        monkeypatch.setattr(svc, "_run", fake.run)
        await self._seed(monkeypatch, tmp_path, [
            {"name": "a", "host": "192.0.2.10"},
            {"name": "b", "host": "10.8.0.2"},
        ])
        with pytest.raises(RuntimeError):
            await svc.perform_backup(trigger="manual")
        rows, subs, cfg = await self._history_state()
        assert rows[0].status == "failed"
        assert len(subs) == 2 and all(s.status == "failed" for s in subs)
        assert cfg.last_status == "failed" and cfg.last_success_at is None

    async def test_build_failure_failed_without_subresults(self, tmp_path, monkeypatch):
        """构建阶段失败 → 整体 failed、无子结果行（spec：构建失败无子结果）。"""
        from app.core.db_config import ConnectionConfig, DbConfig

        cfg = DbConfig(
            active="main",
            connections=[ConnectionConfig(id="main", type="sqlite", name="m", path=str(tmp_path / "nope.db"))],
        )
        monkeypatch.setattr(svc.db_config, "load_config", lambda: cfg)
        fake = _FakeRemoteMulti()
        fake.hosts_ok = {"192.0.2.10"}
        monkeypatch.setattr(svc, "_run", fake.run)
        # 位置种子不触碰 load_config（保持 nope.cfg 指向缺失库）
        await _seed_world_async(targets=[{"name": "a", "host": "192.0.2.10"}])
        with pytest.raises(RuntimeError, match="active|活动"):
            await svc.perform_backup(trigger="manual")
        rows, subs, cfg = await self._history_state()
        assert rows[0].status == "failed"
        assert subs == []  # 无子结果行
        assert fake.calls == []  # 构建失败不触达任何远端

    async def test_per_target_retention_independent(self, tmp_path, monkeypatch):
        """各位置按各自 retain_count 独立清理（spec：超保留量清理最旧）。"""
        fake = _FakeRemoteMulti()
        fake.hosts_ok = {"192.0.2.10", "10.8.0.2"}
        old = [f"panshi_backup_192.168.0.5_2026092{d}_120000.tar.gz" for d in (0, 1, 2, 3)]
        fake.listing = {
            "192.0.2.10": "\n".join(old + ["panshi_backup_other_20260925_130000.tar.gz"]),
            "10.8.0.2": "\n".join(old),
        }
        monkeypatch.setattr(svc, "_run", fake.run)
        await self._seed(monkeypatch, tmp_path, [
            {"name": "r1", "host": "192.0.2.10", "retain_count": 2},
            {"name": "r30", "host": "10.8.0.2", "retain_count": 3},
        ])
        result = await svc.perform_backup(trigger="retain-check")
        assert result["status"] == "success"
        rm_by_host = {}
        for host, cmd in fake.calls:
            if cmd.startswith("cd ") and "rm -f" in cmd:
                rm_by_host.setdefault(host, []).append(cmd)
        # 位置一：候选 = 4 旧 + 本次新包（mv 落地后可见），retain 2 → 删最旧 3 个；他源包不动
        rm1 = " ".join(rm_by_host.get("192.0.2.10", []))
        assert "panshi_backup_192.168.0.5_20260920_120000" in rm1
        assert "panshi_backup_192.168.0.5_20260921_120000" in rm1
        assert "panshi_backup_192.168.0.5_20260922_120000" in rm1
        assert "panshi_backup_192.168.0.5_20260923_120000" not in rm1
        assert "panshi_backup_other_" not in rm1
        # 位置二：retain 3 → 删最旧 2 个
        rm2 = " ".join(rm_by_host.get("10.8.0.2", []))
        assert "20260920_120000" in rm2 and "20260921_120000" in rm2
        assert "20260922_120000" not in rm2

    async def test_disabled_targets_skipped(self, tmp_path, monkeypatch):
        fake = _FakeRemoteMulti()
        fake.hosts_ok = {"192.0.2.10", "10.8.0.2"}
        monkeypatch.setattr(svc, "_run", fake.run)
        await self._seed(monkeypatch, tmp_path, [
            {"name": "on", "host": "192.0.2.10"},
            {"name": "off", "host": "10.8.0.2", "enabled": False},
        ])
        result = await svc.perform_backup(trigger="manual")
        assert result["status"] == "success"
        assert [t["target_name"] for t in result["targets"]] == ["on"]
        assert all(h == "192.0.2.10" for h, _ in fake.calls)

    async def test_manual_run_requires_enabled_target(self, tmp_path, monkeypatch):
        """无启用位置手动备份 → 明确报错（spec：无启用位置明确报错）。"""
        fake = _FakeRemoteMulti()
        monkeypatch.setattr(svc, "_run", fake.run)
        await self._seed(monkeypatch, tmp_path, [
            {"name": "off", "host": "192.0.2.10", "enabled": False},
        ])
        with pytest.raises(RuntimeError, match="启用"):
            await svc.perform_backup(trigger="manual")

    async def test_scheduler_skips_without_enabled_targets(self, tmp_path, monkeypatch):
        await self._seed(monkeypatch, tmp_path, [
            {"name": "off", "host": "192.0.2.10", "enabled": False},
        ])
        assert await svc.scheduler_tick() is False

    async def test_scheduler_triggers_with_enabled_target(self, tmp_path, monkeypatch):
        fake = _FakeRemoteMulti()
        fake.hosts_ok = {"192.0.2.10"}
        monkeypatch.setattr(svc, "_run", fake.run)
        await self._seed(monkeypatch, tmp_path, [{"name": "on", "host": "192.0.2.10"}])
        assert await svc.scheduler_tick() is True
        assert fake.calls

    async def test_source_probe_direction_first_enabled_target(self, tmp_path, monkeypatch):
        """D8：出口 IP 探测方向 = 第一个启用位置的 host:port。"""
        probes = []

        def probe(host, port):
            probes.append((host, port))
            return "10.0.0.9"

        monkeypatch.setattr(svc, "_detect_source_raw", probe)
        fake = _FakeRemoteMulti()
        fake.hosts_ok = {"192.0.2.10", "10.8.0.2"}
        monkeypatch.setattr(svc, "_run", fake.run)
        await self._seed(monkeypatch, tmp_path, [
            {"name": "off", "host": "203.0.113.99", "enabled": False},
            {"name": "first", "host": "192.0.2.10", "port": 2222},
            {"name": "second", "host": "10.8.0.2"},
        ], config_kw={"source_name": None})
        result = await svc.perform_backup(trigger="probe-dir")
        assert probes == [("192.0.2.10", 2222)]
        assert result["package_name"].startswith("panshi_backup_10.0.0.9_")
