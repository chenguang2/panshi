"""Tests for schema migration (app.core.migrate)."""

import pytest

from app.core.migrate import run_migrations


def _create_engine(db_path):
    from sqlalchemy import create_engine

    return create_engine(f"sqlite:///{db_path}")


def _columns(engine, table: str) -> list[str]:
    from sqlalchemy import inspect

    return [c["name"] for c in inspect(engine).get_columns(table)]


@pytest.fixture
def legacy_db(tmp_path):
    """Fresh DB with the legacy edge_install_path column carrying data."""
    engine = _create_engine(tmp_path / "legacy.db")
    with engine.connect() as conn:
        conn.exec_driver_sql(
            "CREATE TABLE ps_node (id INTEGER PRIMARY KEY, "
            "edge_install_path VARCHAR(255), edge_path VARCHAR(255))"
        )
        conn.exec_driver_sql(
            "INSERT INTO ps_node (id, edge_install_path, edge_path) VALUES "
            "(1, '/work/jboss/uapm/openresty', '/work/jboss/uapm/uap-edge'), "
            "(2, NULL, '/work/edge2')"
        )
        conn.commit()
    yield engine
    engine.dispose()


def _create_mixed_db(db_path):
    """DB with BOTH columns: openresty_path added empty (from an earlier
    migration ordering bug), edge_install_path still carrying the data."""
    engine = _create_engine(db_path)
    with engine.connect() as conn:
        conn.exec_driver_sql(
            "CREATE TABLE ps_node (id INTEGER PRIMARY KEY, "
            "edge_install_path VARCHAR(255), openresty_path VARCHAR(255), "
            "edge_path VARCHAR(255))"
        )
        conn.exec_driver_sql(
            "INSERT INTO ps_node (id, edge_install_path, openresty_path, edge_path) VALUES "
            "(1, '/work/jboss/uapm/openresty', NULL, '/work/jboss/uapm/uap-edge'), "
            "(2, '/work/edge2', '', '/work/edge2'), "
            "(3, NULL, '/work/manual', '/work/edge3')"
        )
        conn.commit()
    return engine


def test_legacy_column_renamed_with_data_preserved(legacy_db):
    run_migrations(legacy_db)
    cols = _columns(legacy_db, "ps_node")
    assert "openresty_path" in cols
    assert "edge_install_path" not in cols
    with legacy_db.connect() as conn:
        row = conn.exec_driver_sql(
            "SELECT openresty_path FROM ps_node WHERE id=1"
        ).fetchone()
        assert row[0] == "/work/jboss/uapm/openresty"
        row = conn.exec_driver_sql(
            "SELECT openresty_path FROM ps_node WHERE id=2"
        ).fetchone()
        assert row[0] is None


def test_migration_is_idempotent(legacy_db):
    run_migrations(legacy_db)
    run_migrations(legacy_db)
    cols = _columns(legacy_db, "ps_node")
    assert "openresty_path" in cols
    assert "edge_install_path" not in cols


def test_both_columns_backfills_openresty_path_and_drops_legacy(tmp_path):
    """When openresty_path already exists (added empty by an earlier buggy
    migration), its data must be backfilled from edge_install_path and the
    legacy column dropped -- otherwise the app reads NULLs."""
    engine = _create_mixed_db(tmp_path / "mixed.db")
    run_migrations(engine)
    cols = _columns(engine, "ps_node")
    assert "openresty_path" in cols
    assert "edge_install_path" not in cols
    with engine.connect() as conn:
        rows = dict(
            conn.exec_driver_sql("SELECT id, openresty_path FROM ps_node").fetchall()
        )
        assert rows[1] == "/work/jboss/uapm/openresty"
        assert rows[2] == "/work/edge2"
        assert rows[3] == "/work/manual"
    engine.dispose()
