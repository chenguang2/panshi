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
    returns = []
    for line in body.split("\n"):
        s = line.strip()
        if s.startswith("return ") and "results" in s:
            returns.append(s)
    assert returns, f"函数 {func_name} 中没有带 results 的 return"
    for r in returns:
        assert "'version'" in r or '"version"' in r, \
            f"{func_name} 的 return 缺少 version 字段: {r[:80]}"


CLUSTERS = "app/api/v1/clusters.py"
ROUTES = "app/api/v1/routes.py"


class TestPublishResponseHasVersion:

    def test_publish_upstream(self):
        _check_returns_contain_version(CLUSTERS, "publish_upstream")

    def test_publish_plugin_config(self):
        _check_returns_contain_version(CLUSTERS, "publish_plugin_config")

    def test_publish_global_rule(self):
        _check_returns_contain_version(CLUSTERS, "publish_global_rule")

    def test_publish_route(self):
        _check_returns_contain_version(ROUTES, "publish_route")
