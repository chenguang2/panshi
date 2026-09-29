"""源码守卫（openspec/changes/edge-client-async）：阻塞 IO 必须经 asyncio.to_thread 卸载。

模式参照 test_publish_response.py：正则抽函数体做文本断言，断言清单与
design.md 咽喉点清单一一对应，漂移即红：

- edge_sync.publish_to_nodes / delete_on_nodes —— 逐节点 Edge 发布/删除编排
- cluster_static_resources.publish_static_resource —— 逐节点 raw_put zip
- cluster_ssl._generate_local / create_ca_certificate —— openssl 子进程证书生成
- database.export_archive / import_archive —— 归档打包/导入
- clusters.delete_cluster —— 七类资源 per-node 删除批次
- api/v1/edge_client.py —— 构造 EdgeClient 的 async 端点必须经 run_edge_sync
  执行，且无裸 client.<method>(...) 直调（纯解析方法豁免，见 _PARSE_ONLY_METHODS）
"""

import re
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent.parent

EDGE_SYNC = "app/services/edge_sync.py"
STATIC_RESOURCES = "app/api/v1/cluster_static_resources.py"
SSL = "app/api/v1/cluster_ssl.py"
DATABASE = "app/api/v1/database.py"
CLUSTERS = "app/api/v1/clusters.py"
EDGE_CLIENT_API = "app/api/v1/edge_client.py"

# 「await asyncio.to_thread(...)」真实调用形态（非仅出现 to_thread 字样）
_TO_THREAD_CALL = re.compile(r"await\s+asyncio\.to_thread\s*\(")

# 裸 client 方法直调形态（含赋值与 return 两种）
_BARE_CLIENT_CALL = re.compile(r"client\.(\w+)\s*\(")

# 纯解析/无网络 IO 的 client 方法豁免（不做 httpx 请求，不阻塞事件循环）
_PARSE_ONLY_METHODS = {"_parse_node_list"}


# 函数体抽取：签名兼容「):」与「) -> 返回注解:」两种收尾（publish_to_nodes 等
# 带 -> tuple[...] 注解，若只匹配 '):\n' 会越过函数体落到后续函数）；
# 函数体止于下一个装饰器或列 0 的 def（嵌套 def 缩进，不受影响）。
def _function_body(filepath: str, func_name: str) -> str:
    source = (BACKEND_DIR / filepath).read_text(encoding="utf-8")
    pattern = (
        rf"async def {func_name}\(.*?\)(?:\s*->\s*[^\n:]+)?:\n"
        rf"(.*?)(?=\n@router|\nasync def |\ndef |\Z)"
    )
    match = re.search(pattern, source, re.DOTALL)
    assert match, f"找不到函数 {func_name}"
    return match.group(1)


def _assert_offloaded(filepath: str, func_name: str) -> None:
    body = _function_body(filepath, func_name)
    assert _TO_THREAD_CALL.search(body), (
        f"{filepath}::{func_name} 函数体缺少 await asyncio.to_thread(...) 调用形态："
        f"阻塞的 Edge/openssl/归档调用必须卸载到线程"
        f"（见 openspec/changes/edge-client-async/design.md）"
    )


def _edge_client_endpoint_bodies():
    source = (BACKEND_DIR / EDGE_CLIENT_API).read_text(encoding="utf-8")
    pattern = r"async def (\w+)\(.*?\)(?:\s*->\s*[^\n:]+)?:\n(.*?)(?=\n@router|\nasync def |\ndef |\Z)"
    for match in re.finditer(pattern, source, re.DOTALL):
        yield match.group(1), match.group(2)


class TestEdgeSyncOrchestrationOffloading:

    def test_publish_to_nodes_uses_to_thread(self):
        _assert_offloaded(EDGE_SYNC, "publish_to_nodes")

    def test_delete_on_nodes_uses_to_thread(self):
        _assert_offloaded(EDGE_SYNC, "delete_on_nodes")


class TestSameShapedLegsOffloading:

    def test_publish_static_resource_uses_to_thread(self):
        _assert_offloaded(STATIC_RESOURCES, "publish_static_resource")

    def test_generate_local_uses_to_thread(self):
        _assert_offloaded(SSL, "_generate_local")

    def test_create_ca_certificate_uses_to_thread(self):
        _assert_offloaded(SSL, "create_ca_certificate")

    def test_export_archive_uses_to_thread(self):
        _assert_offloaded(DATABASE, "export_archive")

    def test_import_archive_uses_to_thread(self):
        _assert_offloaded(DATABASE, "import_archive")

    def test_delete_cluster_batch_uses_to_thread(self):
        _assert_offloaded(CLUSTERS, "delete_cluster")


class TestEdgeClientApiOffloading:

    def test_every_client_constructing_endpoint_uses_run_edge_sync(self):
        offenders = []
        for name, body in _edge_client_endpoint_bodies():
            if "EdgeClient(" in body and "run_edge_sync" not in body:
                offenders.append(name)
        assert not offenders, (
            f"以下端点构造了 EdgeClient 却未经 run_edge_sync 卸载: {offenders}"
        )

    def test_no_bare_client_direct_calls(self):
        offenders: dict[str, list[str]] = {}
        for name, body in _edge_client_endpoint_bodies():
            bad = []
            for line in body.split("\n"):
                for m in _BARE_CLIENT_CALL.finditer(line):
                    if m.group(1) in _PARSE_ONLY_METHODS:
                        continue
                    if "run_edge_sync" in line:
                        continue
                    bad.append(m.group(0).rstrip("("))
            if bad:
                offenders[name] = bad
        assert not offenders, (
            f"以下端点存在未卸载的裸 client 方法直调（须经 run_edge_sync）: {offenders}"
        )
