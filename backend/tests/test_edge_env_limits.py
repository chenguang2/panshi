"""edge.env 上传上限对齐（edge-upload-limit-alignment）纯函数测试。

契约（openspec/changes/edge-upload-limit-alignment/specs/edge-env-remote-editing）：
- 生效上限 = deploy.http.admin.client_max_body_size；缺失 → Edge pack server 级基线 32MB
  （http 级配置不参与判定——pack 的 nginx_server_monitor.conf 在 server 级自带 32m）；
- 部署前文本级对齐：缺失→写入、低于→抬高、高于→保留；除目标行外逐行不变（注释/缩进/顺序）；
- 定位范围仅限 http.admin（stream.admin 与 http 级都不算）。
"""

import pytest

from app.services.edge_env_limits import (
    EDGE_ADMIN_BASELINE_MB,
    ensure_admin_limit,
    effective_limit_mb,
    parse_admin_body_limit_mb,
)

# 真实节点形态（192.168.0.13 读取后裁剪）：http 级 132m、admin 段无该键、
# 注释块与 stream 段均保留，用于验证「只改目标行、其余逐行不变」
REAL = """deploy:
  prefix: edge
  worksite: edge_app

  ## http 模块，默认启用，禁用该模块，请删除该模块配置，或更改模块名，如 NOhttp
  http:
    #"log_format main": escape=default '...'
    client_max_body_size: 132m
    edge:
      #"access_log": logs/access.log main buffer=16384 flush=3
      listen:
        - addr: 0.0.0.0:16611
      NOstatic:
        include:
          - site/nginx_location_test.conf
    admin:
      listen:
        - addr: 0.0.0.0:16621
    custom:
      include:
        - site/nginx_server_81XX.conf

  ## stream 模块，默认禁用
  stream:
    edge:
      listen:
        - addr: 0.0.0.0:9999
    admin:
      listen:
        - addr: unix:conf/edge_stream_monitor.sock

ex_plugins:
  static_resource: true
"""

WITH_ADMIN_32 = REAL.replace(
    "    admin:\n      listen:\n        - addr: 0.0.0.0:16621\n",
    "    admin:\n      listen:\n        - addr: 0.0.0.0:16621\n      client_max_body_size: 32m\n",
)

WITH_ADMIN_256 = REAL.replace(
    "    admin:\n      listen:\n        - addr: 0.0.0.0:16621\n",
    "    admin:\n      listen:\n        - addr: 0.0.0.0:16621\n      client_max_body_size: 256m\n",
)

# pack 模板原始形态：http 级该项被注释掉（默认 32m 注释行仍在）
PACK_DEFAULT = REAL.replace(
    "    client_max_body_size: 132m\n", "    #client_max_body_size: 32m\n"
)


class TestParseAndEffective:
    def test_missing_admin_key_means_pack_baseline(self):
        assert parse_admin_body_limit_mb(REAL) is None
        assert effective_limit_mb(REAL) == EDGE_ADMIN_BASELINE_MB == 32

    def test_http_level_value_is_ignored(self):
        """http 级 132m 不能让生效值变 132——server 级 32m 覆盖它（2026-11-23 实测陷阱）。"""
        assert "client_max_body_size: 132m" in REAL  # 前提：http 级确有 132m
        assert effective_limit_mb(REAL) == 32

    @pytest.mark.parametrize("content,expected", [
        (WITH_ADMIN_32, 32),
        (WITH_ADMIN_256, 256),
    ])
    def test_admin_key_parsed(self, content, expected):
        assert parse_admin_body_limit_mb(content) == expected
        assert effective_limit_mb(content) == expected

    def test_uppercase_suffix_accepted(self):
        content = REAL.replace(
            "        - addr: 0.0.0.0:16621\n", "        - addr: 0.0.0.0:16621\n      client_max_body_size: 64M\n"
        )
        assert parse_admin_body_limit_mb(content) == 64

    def test_stream_admin_does_not_count(self):
        """stream.admin 的同类键不属于上传腿（http.admin 才是），仍按基线 32 判定。"""
        content = REAL.replace(
            "    admin:\n      listen:\n        - addr: unix:conf/edge_stream_monitor.sock\n",
            "    admin:\n      listen:\n        - addr: unix:conf/edge_stream_monitor.sock\n"
            "      client_max_body_size: 512m\n",
        )
        assert parse_admin_body_limit_mb(content) is None
        assert effective_limit_mb(content) == 32

    def test_unparsable_content_falls_back_to_baseline(self):
        assert parse_admin_body_limit_mb("key:\n\tval\n") is None
        assert effective_limit_mb("key:\n\tval\n") == EDGE_ADMIN_BASELINE_MB


class TestEnsureAdminLimit:
    def test_inserted_when_missing(self):
        new, action, old = ensure_admin_limit(REAL, 132)
        assert (action, old) == ("inserted", None)
        assert "client_max_body_size: 132m" in new
        # 其余逐行不变：旧内容每一行都仍在新内容里，且只多一行
        old_lines = REAL.splitlines()
        new_lines = new.splitlines()
        assert len(new_lines) == len(old_lines) + 1
        assert [l for l in new_lines if l not in old_lines] == ["      client_max_body_size: 132m"]

    def test_inserted_directly_under_admin_block(self):
        """插入行必须落在 http.admin 内（在 admin: 之后、custom: 之前）。"""
        new = ensure_admin_limit(REAL, 132)[0]
        lines = new.splitlines()
        i_admin = lines.index("    admin:")
        i_custom = lines.index("    custom:")
        i_new = lines.index("      client_max_body_size: 132m")
        assert i_admin < i_new < i_custom

    def test_raised_when_lower(self):
        new, action, old = ensure_admin_limit(WITH_ADMIN_32, 132)
        assert (action, old) == ("raised", 32)
        assert "client_max_body_size: 132m" in new
        assert "client_max_body_size: 32m" not in new
        # 只差一行
        diff = [l for l in WITH_ADMIN_32.splitlines() if l not in new.splitlines()]
        assert diff == ["      client_max_body_size: 32m"]

    def test_kept_when_higher(self):
        new, action, old = ensure_admin_limit(WITH_ADMIN_256, 132)
        assert (action, old) == ("kept", 256)
        assert new == WITH_ADMIN_256

    def test_kept_when_equal(self):
        new, action, old = ensure_admin_limit(WITH_ADMIN_32, 32)
        assert (action, old) == ("kept", 32)
        assert new == WITH_ADMIN_32

    def test_pack_default_comment_preserved(self):
        """pack 原始模板的 `#client_max_body_size: 32m` 注释行不得被误改。"""
        new = ensure_admin_limit(PACK_DEFAULT, 132)[0]
        assert "    #client_max_body_size: 32m" in new
        assert new.count("client_max_body_size: 132m") == 1

    def test_indent_variants(self):
        """admin 子键缩进 6/8 空格都能正确插入与解析（YAML 允许任意一致缩进）。"""
        six = "deploy:\n  http:\n    admin:\n      listen:\n        - addr: 0.0.0.0:3\n"
        eight = "deploy:\n  http:\n    admin:\n        listen:\n            - addr: 0.0.0.0:4\n"
        cases = [
            (six, "      client_max_body_size: 132m"),
            (eight, "        client_max_body_size: 132m"),
        ]
        for content, expected_line in cases:
            new, action, _old = ensure_admin_limit(content, 132)
            assert action == "inserted", (action, new)
            assert expected_line in new.splitlines()
            assert parse_admin_body_limit_mb(new) == 132

    def test_unlocatable_admin_returns_absent(self):
        """无 http.admin 结构（校验层已拦，纯函数仍须不改内容）。"""
        content = "deploy:\n  http:\n    edge:\n      listen:\n        - addr: 0.0.0.0:1\n"
        new, action, old = ensure_admin_limit(content, 132)
        assert (action, old) == ("absent", None)
        assert new == content
