"""clickhouse_client 配置归一化与跨线程失效测试（add-clickhouse-config-page）。

覆盖 design D1（文件结构与迁移兼容）与 D3（版本号惰性重建）。
"""

import threading
from pathlib import Path

import pytest
import yaml

import app.services.clickhouse_client as ch
from app.core.db_config import encrypt_password


@pytest.fixture(autouse=True)
def _reset(monkeypatch, tmp_path):
    """隔离：模块全局缓存/版本/线程 client/路径全部重置，文件放 tmp。"""
    monkeypatch.setattr(ch, "_config", None)
    monkeypatch.setattr(ch, "_config_version", 0, raising=False)
    monkeypatch.setattr(ch, "_CONFIG_PATH", tmp_path / "clickhouse.yaml", raising=True)
    monkeypatch.setattr(ch, "_LEGACY_CONFIG_PATH", tmp_path / "legacy" / "clickhouse.yaml", raising=False)
    if hasattr(ch._local, "client"):
        del ch._local.client
    if hasattr(ch._local, "version"):
        del ch._local.version
    yield


def _write(path: Path, data: dict) -> Path:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(yaml.safe_dump(data, allow_unicode=True), encoding="utf-8")
    return path


class TestShippedTemplate:
    """仓库随包模板（app/config/clickhouse.yaml）守卫。

    2026-10-04 发现：legacy 候选路径的模板文件从未入库 → 产品机两条候选路径全空，
    ClickHouse 配置只能靠 UI 首次保存生成（与 db_config.json 的启动自愈行为不一致）。
    模板路径从 ch.__file__ 推导，不读被 _reset 补丁过的模块常量。
    """

    def _template_path(self) -> Path:
        return Path(ch.__file__).resolve().parent.parent / "config" / "clickhouse.yaml"

    def test_template_exists_and_parses(self):
        p = self._template_path()
        assert p.exists(), "缺少随包模板 app/config/clickhouse.yaml"
        raw = yaml.safe_load(p.read_text(encoding="utf-8"))
        assert isinstance(raw, dict)

    def test_template_shape_and_placeholder_values(self):
        raw = yaml.safe_load(self._template_path().read_text(encoding="utf-8"))
        conns = raw.get("connections")
        assert isinstance(conns, list) and conns
        active = next(
            (c for c in conns if isinstance(c, dict) and c.get("id") == raw.get("active")), None
        )
        assert active is not None, "active 指向的连接必须存在"
        for k in ("name", "host", "port", "database", "user", "connect_timeout"):
            assert active.get(k) is not None, f"模板连接缺 {k}"
        assert active["host"] == "127.0.0.1", "模板必须是占位地址，不得携带真实内网主机"
        assert "password_enc" not in active and "password" not in active, "模板不得携带任何口令"


class _FakeClient:
    """记录构造参数的假 Client。"""

    instances: list = []

    def __init__(self, **kw):
        self.kw = kw
        self.disconnected = False
        _FakeClient.instances.append(self)

    def disconnect(self):
        self.disconnected = True


NEW_FORMAT = {
    "active": "ck_two",
    "connections": [
        {"id": "ck_one", "name": "一", "host": "10.0.0.1", "port": 9000,
         "database": "db1", "user": "u1", "connect_timeout": 5},
        {"id": "ck_two", "name": "二", "host": "10.0.0.2", "port": 9001,
         "database": "db2", "user": "u2", "password_enc": encrypt_password("s3cret"),
         "connect_timeout": 7},
    ],
}

LEGACY_SINGLE = {"host": "192.168.100.42", "port": 9000, "database": "esapm_metrics",
                 "user": "default", "password": "plainpw", "connect_timeout": 5}


def test_new_format_resolves_active_connection():
    _write(ch._CONFIG_PATH, NEW_FORMAT)
    cfg = ch._load_config()
    assert cfg["host"] == "10.0.0.2"
    assert cfg["port"] == 9001
    assert cfg["database"] == "db2"
    assert cfg["password"] == "s3cret"          # password_enc 解密供连接使用
    assert cfg["connect_timeout"] == 7


def test_active_id_missing_falls_back_to_first():
    bad = dict(NEW_FORMAT, active="ck_nonexistent")
    _write(ch._CONFIG_PATH, bad)
    cfg = ch._load_config()
    assert cfg["host"] == "10.0.0.1"


def test_legacy_single_format_normalized():
    """旧单连接明文格式 → 视为默认连接，password 明文可用。"""
    _write(ch._CONFIG_PATH, LEGACY_SINGLE)
    cfg = ch._load_config()
    assert cfg["host"] == "192.168.100.42"
    assert cfg["password"] == "plainpw"


def test_missing_new_path_falls_back_to_legacy_path():
    """新路径缺失 → 回退旧路径（部署残留兼容）。"""
    _write(ch._LEGACY_CONFIG_PATH, LEGACY_SINGLE)
    cfg = ch._load_config()
    assert cfg["host"] == "192.168.100.42"


def test_all_missing_uses_defaults():
    cfg = ch._load_config()
    assert cfg["host"] == "127.0.0.1"
    assert cfg["database"] == "esapm_metrics"


def test_invalidate_bumps_version_and_forces_reconnect(monkeypatch):
    monkeypatch.setattr(ch, "Client", _FakeClient)
    _FakeClient.instances = []
    _write(ch._CONFIG_PATH, NEW_FORMAT)

    c1 = ch.get_client()
    assert c1 is _FakeClient.instances[0]
    assert c1.kw["host"] == "10.0.0.2"

    # 不失效：文件改了也不重连（缓存语义不变）
    v2 = dict(NEW_FORMAT, active="ck_one")
    _write(ch._CONFIG_PATH, v2)
    assert ch.get_client() is c1

    # 失效后：版本变化 → 旧连接 disconnect、按新 active 重建
    ch.invalidate()
    assert ch._config_version == 1
    c2 = ch.get_client()
    assert c2 is not c1
    assert c1.disconnected is True
    assert c2.kw["host"] == "10.0.0.1"


def test_get_client_failure_returns_none(monkeypatch):
    def boom(**kw):
        raise RuntimeError("connect fail")

    monkeypatch.setattr(ch, "Client", boom)
    _write(ch._CONFIG_PATH, NEW_FORMAT)
    assert ch.get_client() is None
