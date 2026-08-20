"""Tests for database switch service — running-task guard, config switch, flag, rollback."""

import os
import pytest
from sqlalchemy import text

from app.core import db_config
from app.core.db_config import DbConfig, ConnectionConfig
from app.models.node_task import NodeTask
from app.services import db_switch_service


@pytest.fixture(autouse=True)
def _isolate(tmp_path, monkeypatch):
    monkeypatch.setattr(db_config, "CONFIG_PATH", str(tmp_path / "db_config.json"))
    monkeypatch.setattr(db_config, "CONFIG_BAK_PATH", str(tmp_path / "db_config.json.bak"))
    monkeypatch.setattr(db_config, "DEFAULT_SQLITE_PATH", str(tmp_path / "panshi.db"))
    monkeypatch.setattr(db_switch_service, "RESTART_FLAG_PATH", str(tmp_path / ".restart.flag"))
    yield tmp_path


def _make_config(tmp_path):
    cfg = DbConfig(version=1, active="local", connections=[
        ConnectionConfig(id="local", type="sqlite", name="本地", path=str(tmp_path / "a.db")),
        ConnectionConfig(id="pg", type="sqlite", name="目标", path=str(tmp_path / "b.db")),
    ])
    db_config.save_config(cfg, path=str(tmp_path / "db_config.json"))
    return cfg


class TestSwitchService:
    async def test_switch_success(self, _isolate, test_db):
        cfg = _make_config(_isolate)
        result = await db_switch_service.perform_switch("pg", test_db)
        assert result["message"]
        stored = db_config.load_config()
        assert stored.active == "pg"
        # .bak written
        assert os.path.exists(str(_isolate / "db_config.json.bak"))
        # restart flag written
        assert os.path.exists(str(_isolate / ".restart.flag"))

    async def test_switch_to_same_connection_rejected(self, _isolate, test_db):
        _make_config(_isolate)
        with pytest.raises(Exception) as exc:
            await db_switch_service.perform_switch("local", test_db)
        assert "已是当前" in str(exc.value.detail)

    async def test_switch_unknown_connection_rejected(self, _isolate, test_db):
        _make_config(_isolate)
        with pytest.raises(Exception) as exc:
            await db_switch_service.perform_switch("nonexistent", test_db)
        assert "不存在" in str(exc.value.detail)

    async def test_switch_rejected_when_running_task(self, _isolate, test_db):
        _make_config(_isolate)
        test_db.add(NodeTask(cluster_id=1, task_type="install", status="running"))
        await test_db.commit()
        with pytest.raises(Exception) as exc:
            await db_switch_service.perform_switch("pg", test_db)
        assert "任务正在运行" in str(exc.value.detail)
        # config unchanged
        assert db_config.load_config().active == "local"

    async def test_switch_allowed_when_task_not_running(self, _isolate, test_db):
        _make_config(_isolate)
        test_db.add(NodeTask(cluster_id=1, task_type="install", status="success"))
        await test_db.commit()
        result = await db_switch_service.perform_switch("pg", test_db)
        assert db_config.load_config().active == "pg"

    async def test_restart_flag_path_const(self, _isolate):
        assert db_switch_service.RESTART_FLAG_PATH.endswith(".restart.flag")


class TestStartupRollback:
    def test_rollback_when_active_unreachable(self, _isolate):
        # main config points at an unreachable PG; .bak has a valid sqlite
        good = DbConfig(version=1, active="local", connections=[
            ConnectionConfig(id="local", type="sqlite", name="本地", path=str(_isolate / "good.db")),
        ])
        db_config.save_config(good, path=str(_isolate / "db_config.json.bak"))
        bad = DbConfig(version=1, active="pg", connections=[
            ConnectionConfig(id="pg", type="postgres", name="坏PG", host="127.0.0.1",
                             port=1, database="x", username="u"),
            ConnectionConfig(id="local", type="sqlite", name="本地", path=str(_isolate / "good.db")),
        ])
        db_config.save_config(bad, path=str(_isolate / "db_config.json"))
        # write restart flag
        with open(str(_isolate / ".restart.flag"), "w") as f:
            f.write("1")

        result = db_switch_service.check_and_rollback_startup()
        assert result is not None
        assert result["rolled_back"] is True
        # active rolled back to local
        assert db_config.load_config().active == "local"
        # flag cleared
        assert not db_switch_service.restart_flag_exists()

    def test_no_rollback_when_active_reachable(self, _isolate):
        cfg = DbConfig(version=1, active="local", connections=[
            ConnectionConfig(id="local", type="sqlite", name="本地", path=str(_isolate / "ok.db")),
        ])
        db_config.save_config(cfg, path=str(_isolate / "db_config.json"))
        with open(str(_isolate / ".restart.flag"), "w") as f:
            f.write("1")
        result = db_switch_service.check_and_rollback_startup()
        assert result is None
        assert db_config.load_config().active == "local"
        assert not db_switch_service.restart_flag_exists()

    def test_no_flag_no_rollback(self, _isolate):
        _make_config(_isolate)
        result = db_switch_service.check_and_rollback_startup()
        assert result is None
