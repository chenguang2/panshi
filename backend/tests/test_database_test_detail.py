"""_do_test_sync 失败 detail 中文分类转译（database-mgmt-ux-review-fixes 1.4）。

背景：原实现失败 detail = str(e)（英文异常串直出，非技术用户不可读）。
转译分类：连接拒绝 / 认证失败 / 库不存在 / 超时；无法分类加「连接失败：」前缀。
"""
from unittest.mock import patch

import pytest

from app.api.v1.database import _do_test_sync
from app.core.db_config import ConnectionConfig


def _conn() -> ConnectionConfig:
    return ConnectionConfig(
        id="c1", type="postgres", name="t", host="10.255.255.1",
        port=5432, database="db", username="u", password_enc=None, ssl=False,
    )


@pytest.mark.parametrize(
    "raw,expected",
    [
        ("connection refused", "连接被拒绝（数据库服务未启动或端口错误）"),
        ("(psycopg2 OperationalError) connection to server at x failed: Connection refused",
         "连接被拒绝（数据库服务未启动或端口错误）"),
        ("password authentication failed for user \"u\"", "用户名或密码错误"),
        ('pq: database "nope" does not exist', "数据库不存在"),
        ("timeout expired", "连接超时"),
        ("some weird driver crash", "连接失败：some weird driver crash"),
    ],
)
def test_failure_detail_translated(raw: str, expected: str):
    with patch("app.api.v1.database.build_sync_engine_for", side_effect=Exception(raw)):
        ok, detail = _do_test_sync(_conn())
    assert ok is False
    assert detail == expected


def test_success_detail_unchanged():
    class FakeEngine:
        def connect(self):
            return self

        def __enter__(self):
            return self

        def __exit__(self, *a):
            return False

        def execute(self, q):
            pass

        def dispose(self):
            pass

    with patch("app.api.v1.database.build_sync_engine_for", return_value=FakeEngine()):
        ok, detail = _do_test_sync(_conn())
    assert ok is True
    assert detail == "连接成功"
