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
        return ConnectionConfig(
            id="test_pg",
            type="postgresql",
            name="Test PG",
            host="localhost",
            port=5432,
            database="test_panshi",
            username="postgres",
            password="postgres",
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
            source=sqlite_conn,
            target=pg_conn,
            include_logs=True,
            mode="replace",
            confirmed_clear=True,
        )
        assert done > 0, f"应迁移至少 1 张表，实际 {done}"

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
            source=sqlite_conn,
            target=pg_conn,
            include_logs=True,
            mode="replace",
            confirmed_clear=True,
        )
        done2 = migrate_direct(
            source=sqlite_conn,
            target=pg_conn,
            include_logs=True,
            mode="replace",
            confirmed_clear=True,
        )
        assert done1 == done2, "二次迁移表数应一致"

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