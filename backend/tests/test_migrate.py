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


def _create_task_db_with_duplicates(db_path):
    """DB with duplicate (task_id, node_id) items in install_task_node."""
    engine = _create_engine(db_path)
    with engine.connect() as conn:
        conn.exec_driver_sql(
            "CREATE TABLE install_task (id INTEGER PRIMARY KEY, cluster_id INTEGER, "
            "task_type VARCHAR(20), status VARCHAR(20), params TEXT, total_nodes INTEGER, "
            "success_nodes INTEGER DEFAULT 0, failed_nodes INTEGER DEFAULT 0, "
            "cancelled_nodes INTEGER DEFAULT 0, created_by INTEGER, "
            "created_at DATETIME, started_at DATETIME, finished_at DATETIME)"
        )
        conn.exec_driver_sql(
            "CREATE TABLE install_task_node (id INTEGER PRIMARY KEY, task_id INTEGER, "
            "node_id INTEGER, ip VARCHAR(50), node_name VARCHAR(100), status VARCHAR(20), "
            "rc INTEGER, logs TEXT, stdout TEXT, stderr TEXT, command TEXT, "
            "log_file VARCHAR(255), log_line_count INTEGER DEFAULT 0, stdout_tail TEXT, "
            "started_at DATETIME, finished_at DATETIME)"
        )
        conn.exec_driver_sql(
            "INSERT INTO install_task (id, cluster_id, task_type, status, total_nodes) "
            "VALUES (1, 4, 'statistic', 'partial', 3)"
        )
        conn.exec_driver_sql(
            "INSERT INTO install_task_node (id, task_id, node_id, ip, status) VALUES "
            "(42, 1, 7, '192.168.0.13', 'success'), "
            "(43, 1, 8, '192.168.0.14', 'failed'), "
            "(44, 1, 7, '192.168.0.13', 'success'), "
            "(61, 1, 7, '192.168.0.13', 'success'), "
            "(62, 1, 8, '192.168.0.14', 'success'), "
            "(63, 1, 9, '192.168.0.15', 'success')"
        )
        conn.commit()
    return engine


def _unique_indexes(engine, table: str) -> list[str]:
    from sqlalchemy import inspect

    return [idx["name"] for idx in inspect(engine).get_indexes(table) if idx.get("unique")]


def test_duplicate_items_cleared_before_unique_index(tmp_path):
    """Migration must clear duplicate (task_id, node_id) items before creating unique index."""
    engine = _create_task_db_with_duplicates(tmp_path / "dup.db")
    run_migrations(engine)
    unique = _unique_indexes(engine, "install_task_node")
    assert "uq_install_task_node_task_node" in unique, f"unique index missing, got {unique}"
    # duplicates must be gone: each (task_id, node_id) appears at most once
    with engine.connect() as conn:
        rows = conn.exec_driver_sql(
            "SELECT task_id, node_id, COUNT(*) FROM install_task_node GROUP BY task_id, node_id"
        ).fetchall()
        for task_id, node_id, cnt in rows:
            assert cnt == 1, f"duplicate remains: task {task_id} node {node_id} x{cnt}"
    engine.dispose()


def test_clean_db_gets_unique_index_without_duplicates(tmp_path):
    """Fresh table with no duplicates should get unique index directly."""
    engine = _create_task_db_with_duplicates(tmp_path / "clean.db")
    # remove duplicates to simulate clean data
    with engine.connect() as conn:
        conn.exec_driver_sql(
            "DELETE FROM install_task_node WHERE id IN (43, 44, 61)"
        )
        conn.commit()
    run_migrations(engine)
    unique = _unique_indexes(engine, "install_task_node")
    assert "uq_install_task_node_task_node" in unique
    engine.dispose()
