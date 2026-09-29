"""安全评审缺陷修复回归测试（H2 / H3 / H4）。

H2: metrics_service 的 ClickHouse label 键经 f-string 拼接进 SQL（值已参数绑定、
    键没有）→ 键必须匹配安全字符集，不匹配时跳过该过滤条件。
H3: edge_client 硬编码默认 SM4/ADMIN 密钥缺生产启动守卫 → APP_ENV=production
    且密钥缺失或仍为默认值时拒绝启动；非 production 保持现状可用。
H4: database PG 启动 schema 自检失败时不得退化为 drop_all 全库重建 →
    自检失败 fail-fast 抛 RuntimeError；仅确认 sys_user 残留缺 id 列时才重建。

全部用例基于 monkeypatch，不触网、不触库。
"""

from pathlib import Path

import pytest

from app.services import metrics_service


# ── H2: ClickHouse label 键注入 ──────────────────────────────────────


class TestLabelKeySqlInjection:
    @pytest.fixture()
    def captured(self, monkeypatch):
        """捕获 metrics_service 发出的全部 SQL 与参数，返回空结果集。"""
        calls: list[tuple[str, dict | None]] = []

        def fake_execute_query(sql, params=None):
            calls.append((sql, params))
            return []

        monkeypatch.setattr(metrics_service, "execute_query", fake_execute_query)
        return calls

    @pytest.mark.parametrize(
        "label",
        [
            "a' OR '1'='1:v",   # 单引号闭合注入
            "a\\:v",            # 反斜杠
            "a b:v",            # 空格
            "a;b--:v",          # 分号 + 行注释
            "a/*:v",            # 块注释符
            "' UNION SELECT--:v",  # UNION 注入
        ],
    )
    def test_malicious_label_key_never_reaches_sql(self, captured, label):
        metrics_service.query_time_series("cpu_usage", label=label)
        assert captured, "应至少执行过计数器探测/主查询"
        key = label.split(":", 1)[0]
        for sql, params in captured:
            assert key not in sql, f"恶意 label 键进入了 SQL: {sql}"
            assert not (params or {}).get("label_val"), "恶意键不应产生 label 绑定参数"

    def test_no_label_keeps_query_unfiltered(self, captured):
        metrics_service.query_time_series("cpu_usage")
        main_sql, main_params = captured[-1]
        assert "label_val" not in main_sql
        assert "label_val" not in (main_params or {})

    @pytest.mark.parametrize(
        ("label", "key", "val"),
        [
            ("state:active", "state", "active"),
            ("service.name:gateway", "service.name", "gateway"),
            ("node_ip:192.168.0.13", "node_ip", "192.168.0.13"),
        ],
    )
    def test_valid_label_key_still_filters(self, captured, label, key, val):
        metrics_service.query_time_series("cpu_usage", label=label)
        main_sql, main_params = captured[-1]  # 最后一次调用是主查询
        assert f"Attributes['{key}']" in main_sql
        assert main_params["label_val"] == val

    def test_label_without_colon_is_ignored(self, captured):
        metrics_service.query_time_series("cpu_usage", label="justakey")
        _, main_params = captured[-1]
        assert "label_val" not in (main_params or {})


# ── H3: Edge 通道密钥生产守卫 ────────────────────────────────────────

_DEFAULT_SM4 = "a16bc20453da220f"
_DEFAULT_ADMIN = "f9357106bff442f89d4de7169c37c61e"


class TestEdgeSecretsProductionGuard:
    @staticmethod
    def _guard():
        from app.services.edge_client import ensure_edge_secrets_configured

        return ensure_edge_secrets_configured

    def test_production_missing_both_env_raises(self, monkeypatch):
        guard = self._guard()
        monkeypatch.setenv("APP_ENV", "production")
        monkeypatch.delenv("EDGE_SM4_KEY", raising=False)
        monkeypatch.delenv("EDGE_ADMIN_KEY", raising=False)
        with pytest.raises(RuntimeError) as ei:
            guard()
        msg = str(ei.value)
        assert "EDGE_SM4_KEY" in msg and "EDGE_ADMIN_KEY" in msg

    def test_production_default_values_raise(self, monkeypatch):
        guard = self._guard()
        monkeypatch.setenv("APP_ENV", "production")
        monkeypatch.setenv("EDGE_SM4_KEY", _DEFAULT_SM4)
        monkeypatch.setenv("EDGE_ADMIN_KEY", _DEFAULT_ADMIN)
        with pytest.raises(RuntimeError) as ei:
            guard()
        assert "EDGE_SM4_KEY" in str(ei.value)
        assert "EDGE_ADMIN_KEY" in str(ei.value)

    def test_production_single_default_value_raises(self, monkeypatch):
        guard = self._guard()
        monkeypatch.setenv("APP_ENV", "production")
        monkeypatch.setenv("EDGE_SM4_KEY", "0f9e8d7c11223344")
        monkeypatch.setenv("EDGE_ADMIN_KEY", _DEFAULT_ADMIN)  # 只有一个仍是默认值
        with pytest.raises(RuntimeError, match="EDGE_ADMIN_KEY"):
            guard()

    def test_production_explicit_custom_values_pass(self, monkeypatch):
        guard = self._guard()
        monkeypatch.setenv("APP_ENV", "production")
        monkeypatch.setenv("EDGE_SM4_KEY", "0f9e8d7c11223344")
        monkeypatch.setenv("EDGE_ADMIN_KEY", "custom-admin-key-9876")
        guard()  # 不抛

    def test_development_missing_env_passes(self, monkeypatch):
        guard = self._guard()
        monkeypatch.setenv("APP_ENV", "development")
        monkeypatch.delenv("EDGE_SM4_KEY", raising=False)
        monkeypatch.delenv("EDGE_ADMIN_KEY", raising=False)
        guard()  # 开发环境保持现状完全可用

    def test_default_env_is_not_production(self, monkeypatch):
        guard = self._guard()
        monkeypatch.delenv("APP_ENV", raising=False)
        monkeypatch.delenv("EDGE_SM4_KEY", raising=False)
        monkeypatch.delenv("EDGE_ADMIN_KEY", raising=False)
        guard()  # APP_ENV 未设置视为开发环境，不抛

    def test_lifespan_invokes_guard(self):
        """启动守卫必须挂在 main.py 的启动路径上（源码守卫，同 test_publish_response 风格）。"""
        import app.main as main_module

        src = Path(main_module.__file__).read_text(encoding="utf-8")
        assert "ensure_edge_secrets_configured" in src, "main.py 启动路径未调用 Edge 密钥守卫"


# ── H4: PG schema 自检 fail-fast，绝不误删全库 ───────────────────────


class _FakeInspector:
    def __init__(self, has_table=True, columns=("id", "username", "created_at")):
        self._has_table = has_table
        self._columns = [{"name": c} for c in columns]

    def has_table(self, table_name):
        return self._has_table

    def get_columns(self, table_name):
        if not self._has_table:
            raise AssertionError("表不存在时不应再查询列")
        return self._columns


class _BoomInspector:
    """模拟 inspect 因瞬时连接/权限问题失败。"""

    def has_table(self, table_name):
        raise RuntimeError("connection lost during inspect")


class TestPgSchemaCheckFailFast:
    @pytest.fixture()
    def db_module(self):
        from app.core import database

        return database

    @pytest.fixture()
    def drop_spy(self, monkeypatch, db_module):
        calls: list[object] = []
        monkeypatch.setattr(db_module.Base.metadata, "drop_all", lambda engine: calls.append(engine))
        return calls

    @pytest.fixture()
    def engine_sentinel(self):
        return object()

    def _patch_inspect(self, monkeypatch, db_module, inspector):
        monkeypatch.setattr(db_module, "inspect", lambda engine: inspector)

    def test_inspect_failure_raises_and_never_drops(self, monkeypatch, db_module, drop_spy, engine_sentinel):
        self._patch_inspect(monkeypatch, db_module, _BoomInspector())
        with pytest.raises(RuntimeError):
            db_module._ensure_pg_schema(engine_sentinel)
        assert drop_spy == [], "自检失败时绝不允许 drop_all"

    def test_missing_id_column_triggers_rebuild(self, monkeypatch, db_module, drop_spy, engine_sentinel):
        self._patch_inspect(monkeypatch, db_module, _FakeInspector(columns=("username", "created_at")))
        db_module._ensure_pg_schema(engine_sentinel)
        assert drop_spy == [engine_sentinel], "sys_user 残留缺 id 列应定向重建"

    def test_complete_schema_is_noop(self, monkeypatch, db_module, drop_spy, engine_sentinel):
        self._patch_inspect(monkeypatch, db_module, _FakeInspector(columns=("id", "username")))
        db_module._ensure_pg_schema(engine_sentinel)
        assert drop_spy == []

    def test_absent_table_is_noop(self, monkeypatch, db_module, drop_spy, engine_sentinel):
        self._patch_inspect(monkeypatch, db_module, _FakeInspector(has_table=False))
        db_module._ensure_pg_schema(engine_sentinel)
        assert drop_spy == []

    def test_init_db_call_site_uses_helper(self, db_module):
        """init_db 调用点必须走可测辅助函数（源码守卫）。"""
        src = Path(db_module.__file__).read_text(encoding="utf-8")
        assert "_ensure_pg_schema(sync_engine)" in src
