"""源码守卫：publish 端点候选载荷构造必须与发布差异预览同源（publish-diff-preview）。

publish_resource 实发的载荷与发布差异预览展示的「待发布值」必须出自同一构造单点
（publish_preview.build_candidate）——预览展示的内容与发布实际发送的内容逐字段一致
是 spec 硬约束；端点函数体内不得保留内联 convert_* 载荷构造（两套口径漂移风险）。
模式同 test_publish_response.py（纯文本检查）。
"""

import re


def _check_publish_uses_shared_candidate(filepath: str, func_name: str, convert_fn: str):
    with open(filepath, encoding="utf-8") as f:
        source = f.read()
    pattern = rf"async def {func_name}\(.*?\):\n(.*?)(?=\n@router|\nasync def |\Z)"
    match = re.search(pattern, source, re.DOTALL)
    assert match, f"找不到函数 {func_name}"
    body = match.group(1)
    assert "publish_preview.build_candidate" in body, (
        f"函数 {func_name} 未走 publish_preview.build_candidate 共享候选构造"
        "（预览与发布将出现两套口径，spec: 候选载荷与发布同源）"
    )
    assert convert_fn not in body, (
        f"函数 {func_name} 仍保留内联 {convert_fn} 载荷构造，应改由共享候选构造单点产出"
    )


UPSTREAMS = "app/api/v1/cluster_upstreams.py"
ROUTES = "app/api/v1/cluster_routes.py"


class TestPublishCandidateSingleSource:

    def test_publish_upstream(self):
        _check_publish_uses_shared_candidate(UPSTREAMS, "publish_upstream", "convert_upstream_to_edge_format")

    def test_publish_route(self):
        _check_publish_uses_shared_candidate(ROUTES, "publish_route", "convert_route_to_edge_format")
