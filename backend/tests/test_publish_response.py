"""测试发布接口返回的 version 字段完整性 — 纯文本检查。"""

import pytest
import re


def _check_returns_contain_version(filepath: str, func_name: str):
    with open(filepath, encoding="utf-8") as f:
        source = f.read()
    pattern = rf"async def {func_name}\(.*?\):\n(.*?)(?=\n@router|\nasync def |\Z)"
    match = re.search(pattern, source, re.DOTALL)
    assert match, f"找不到函数 {func_name}"
    body = match.group(1)
    # 检查 new_version 传入了 build_publish_response（重构后的模式）
    # 或者 'version' 出现在 return 语句中（重构前的模式）
    has_build = "build_publish_response" in body
    has_version_in_return = False
    for line in body.split("\n"):
        s = line.strip()
        if s.startswith("return ") and ("'version'" in s or '"version"' in s):
            has_version_in_return = True
            break
    assert has_build or has_version_in_return, \
        f"函数 {func_name} 既没有调用 build_publish_response(new_version)，也没有直接 return version"


UPSTREAMS = "app/api/v1/cluster_upstreams.py"
PLUGIN_CONFIGS = "app/api/v1/cluster_plugin_configs.py"
GLOBAL_RULES = "app/api/v1/cluster_global_rules.py"
ROUTES = "app/api/v1/cluster_routes.py"


class TestPublishResponseHasVersion:

    def test_publish_upstream(self):
        _check_returns_contain_version(UPSTREAMS, "publish_upstream")

    def test_publish_plugin_config(self):
        _check_returns_contain_version(PLUGIN_CONFIGS, "publish_plugin_config")

    def test_publish_global_rule(self):
        _check_returns_contain_version(GLOBAL_RULES, "publish_global_rule")

    def test_publish_route(self):
        _check_returns_contain_version(ROUTES, "publish_route")
