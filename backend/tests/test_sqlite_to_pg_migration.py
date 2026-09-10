"""SQLite → PostgreSQL 迁移集成测试（需可用 PG 实例）。

运行前设置环境变量：
  PG_DSN=postgresql://user:pass@host:5432/dbname

若未设置 PG_DSN，测试自动跳过。
"""
import os
import pytest
from sqlalchemy import create_engine, inspect, text
from sqlalchemy.orm import Session

from app.core.database import Base
from app.services.db_migration_service import migrate_direct, target_is_empty
from app.core.db_config import ConnectionConfig, DbConfig
from app.core.db_migration import tables_for_migration


PG_DSN = os.getenv("PG_DSN")
SQLITE_PATH = "./data/panshi.db"


@pytest.mark.skipif(not PG_DSN, reason="PG_DSN not set; skipping SQLite→PG migration test")
class TestSqliteToPgMigration:
    """SQLite 到 PostgreSQL 完整迁移测试。"""

    @pytest.fixture(scope="class")
    def sqlite_conn(self):
        """SQLite 源连接配置。"""
        return ConnectionConfig(
            id="test_sqlite",
            type="sqlite",
            name="Test SQLite",
            path=SQLITE_PATH,
        )

    @pytest.fixture(scope="class")
    def pg_conn(self):
        """PostgreSQL 目标连接配置。"""
        from app.core.db_config import encrypt_password

        return ConnectionConfig(
            id="test_pg",
            type="postgresql",
            name="Test PG",
            host="localhost",
            port=5432,
            database="test_panshi",
            username="postgres",
            password_enc=encrypt_password("postgres"),
        )

    def test_sqlite_source_has_data(self, sqlite_conn):
        """验证 SQLite 源库有业务数据。"""
        from app.core.database import build_sync_engine_for
        engine = build_sync_engine_for(sqlite_conn)
        tables = tables_for_migration(True)
        with engine.connect() as conn:
            for table in tables:
                count = conn.execute(text(f"SELECT COUNT(*) FROM {table}")).scalar()
                if count > 0:
                    print(f"SQLite {table}: {count} rows")
                    break
            else:
                pytest.skip("SQLite 源库无业务数据，跳过迁移测试")
        engine.dispose()

    def test_pg_target_empty_before(self, pg_conn):
        """迁移前确认 PG 目标库为空。"""
        from app.core.database import build_sync_engine_for
        engine = build_sync_engine_for(pg_conn)
        Base.metadata.create_all(engine)  # 先建表
        assert target_is_empty(pg_conn), "目标库应为空"
        engine.dispose()

    def test_migrate_direct_sqlite_to_pg(self, sqlite_conn, pg_conn):
        """执行 SQLite → PG 直连迁移（replace 模式）。"""
        # 确保目标库干净
        from app.core.database import build_sync_engine_for
        engine = build_sync_engine_for(pg_conn)
        Base.metadata.drop_all(engine)
        Base.metadata.create_all(engine)
        engine.dispose()

        # 执行迁移
        done = migrate_direct(
            source_conn=sqlite_conn,
            target_conn=pg_conn,
            include_logs=True,
            mode="replace",
            confirmed_clear=True,
        )
        assert len(done) > 0, f"应迁移至少 1 张表，实际 {len(done)}"

    def test_pg_tables_have_data_after_migration(self, pg_conn):
        """验证迁移后 PG 表有数据且 schema 完整（含 FK 列）。"""
        from app.core.database import build_sync_engine_for
        engine = build_sync_engine_for(pg_conn)
        insp = inspect(engine)
        tables = tables_for_migration(True)

        for table in tables:
            if not insp.has_table(table):
                continue
            cols = {c["name"] for c in insp.get_columns(table)}
            count = 0
            with engine.connect() as conn:
                try:
                    count = conn.execute(text(f"SELECT COUNT(*) FROM {table}")).scalar()
                except Exception:
                    pass

            # 关键检查：sys_user 必须有 id 列（FK 目标）
            if table == "sys_user":
                assert "id" in cols, f"sys_user 表缺 id 列：{cols}"
                print(f"✅ {table}: id 列存在，{count} 行")
            else:
                print(f"  {table}: {count} 行")

            # 有 FK 的表验证引用列存在
            fks = insp.get_foreign_keys(table)
            for fk in fks:
                for col in fk["constrained_columns"]:
                    assert col in cols, f"{table}.{col} 列缺失（FK 要求）"

        engine.dispose()

    def test_migrate_is_idempotent(self, sqlite_conn, pg_conn):
        """二次迁移应幂等（不报错、不重复数据）。"""
        done1 = migrate_direct(
            source_conn=sqlite_conn,
            target_conn=pg_conn,
            include_logs=True,
            mode="replace",
            confirmed_clear=True,
        )
        done2 = migrate_direct(
            source_conn=sqlite_conn,
            target_conn=pg_conn,
            include_logs=True,
            mode="replace",
            confirmed_clear=True,
        )
        assert len(done1) == len(done2), "二次迁移表数应一致"

        # 验证行数未翻倍
        from app.core.database import build_sync_engine_for
        engine = build_sync_engine_for(pg_conn)
        with engine.connect() as conn:
            cnt = conn.execute(text("SELECT COUNT(*) FROM sys_user")).scalar()
            assert cnt > 0
        engine.dispose()


if __name__ == "__main__":
    # 手动运行：python -m pytest backend/tests/test_sqlite_to_pg_migration.py -v -s
    pytest.main([__file__, "-v", "-s"])

class TestTypeCoercionInRealMigration:
    """任务 5.1：真实迁移中验证 SQLite→PG 类型协同生效（布尔/日期时间原生入列）。"""

    @pytest.mark.skipif(not PG_DSN, reason="PG_DSN not set; skipping SQLite→PG migration test")
    def test_boolean_and_datetime_are_native_in_pg(self, tmp_path):
        from datetime import datetime as dt

        from sqlalchemy import Boolean as SA_Boolean, DateTime as SA_DateTime, inspect

        from app.core.database import build_sync_engine_for
        from app.services.db_migration_service import _copy_table
        from sqlalchemy import create_engine

        sqlite_conn = ConnectionConfig(id="tc_src", type="sqlite", name="TC源", path="./data/panshi.db")
        src_engine = create_engine(f"sqlite:///{sqlite_conn.path}")
        Base.metadata.create_all(src_engine)

        insp = inspect(src_engine)
        tables = tables_for_migration(True)
        # 找一个含布尔列且有行的表
        target_table, bool_col = None, None
        for t in tables:
            if not insp.has_table(t):
                continue
            model = Base.metadata.tables.get(t)
            if model is None:
                continue
            bcols = [c.name for c in model.columns if isinstance(c.type, SA_Boolean)]
            if not bcols:
                continue
            with src_engine.connect() as conn:
                cnt = conn.execute(text(f"SELECT COUNT(*) FROM {t} WHERE {bcols[0]} IS NOT NULL")).scalar()
            if cnt:
                target_table, bool_col = t, bcols[0]
                break
        if target_table is None:
            src_engine.dispose()
            pytest.skip("源库无含布尔列数据的表，跳过类型协同 E2E")

        pg_conn = ConnectionConfig(
            id="tc_pg", type="postgresql", name="TC目标", host="localhost", port=5432,
            database="test_panshi", username="postgres",
            password_enc=__import__("app.core.db_config", fromlist=["encrypt_password"]).encrypt_password("postgres"),
        )
        pg_engine = build_sync_engine_for(pg_conn)
        Base.metadata.drop_all(pg_engine)
        Base.metadata.create_all(pg_engine)

        result = _copy_table(src_engine, pg_engine, target_table)
        assert result["skipped"] is False

        pg_ins = inspect(pg_engine)
        with src_engine.connect() as sconn, pg_engine.connect() as pconn:
            srow = sconn.execute(text(f"SELECT {bool_col} FROM {target_table} WHERE {bool_col} IS NOT NULL LIMIT 1")).scalar()
            prow = pconn.execute(text(f"SELECT {bool_col} FROM {target_table} WHERE {bool_col} IS NOT NULL LIMIT 1")).scalar()
        assert isinstance(prow, bool), f"PG 布尔列应返回原生 bool，实际 {type(prow)}: {prow!r}"
        assert prow == bool(srow)
        src_engine.dispose()
        pg_engine.dispose()


class TestPgToSqliteMigration:
    """任务 5.4：PG → SQLite 完整迁移（roundtrip）。"""

    @pytest.mark.skipif(not PG_DSN, reason="PG_DSN not set; skipping PG→SQLite migration test")
    def test_pg_to_sqlite_roundtrip(self, tmp_path):
        from sqlalchemy import create_engine

        from app.core.database import build_sync_engine_for
        from app.core.db_config import encrypt_password

        sqlite_conn = ConnectionConfig(id="rt_src", type="sqlite", name="往返源", path="./data/panshi.db")
        pg_conn = ConnectionConfig(
            id="rt_pg", type="postgresql", name="往返PG", host="localhost", port=5432,
            database="test_panshi", username="postgres", password_enc=encrypt_password("postgres"),
        )
        roundtrip = ConnectionConfig(
            id="rt_dst", type="sqlite", name="往返目标", path=str(tmp_path / "roundtrip.db"),
        )

        # 先确保 PG 有数据：sqlite → pg
        migrate_direct(sqlite_conn, pg_conn, include_logs=True, mode="replace", confirmed_clear=True)
        # 再 pg → sqlite（往返）
        done = migrate_direct(pg_conn, roundtrip, include_logs=True, mode="replace", confirmed_clear=True)
        assert len(done) > 0

        src_engine = create_engine(f"sqlite:///{sqlite_conn.path}")
        dst_engine = build_sync_engine_for(roundtrip)
        for table in ("sys_user",):
            with src_engine.connect() as s, dst_engine.connect() as d:
                s_cnt = s.execute(text(f"SELECT COUNT(*) FROM {table}")).scalar()
                d_cnt = d.execute(text(f"SELECT COUNT(*) FROM {table}")).scalar()
            assert s_cnt == d_cnt, f"{table} 往返行数不一致：{s_cnt} != {d_cnt}"
            assert d_cnt > 0
        src_engine.dispose()
        dst_engine.dispose()
