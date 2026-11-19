"""插件组引用判定（PLG-07 单一事实源）。

`Route.plugin_config_ids` 是 JSON TEXT，存的是插件组 **edge_uuid**（不是 id，约定见
`models/cluster.py`）。删除守卫、`GET .../plugin_configs/{id}/references` 与全局
`GET /plugin_configs` 的 `reference_count` 必须同语义，故解析规则收敛在本模块：

- 畸形 JSON / 非列表 → 视为「不含引用」，不抛错（与 cluster_backup 导入期清理一致）；
- 引用只在**同一集群**内成立（插件组是集群级资源），调用方负责按集群取路由。
"""

from __future__ import annotations

import json
from typing import Any, Iterable


def extract_refs(raw: Any) -> list[str]:
    """从 `Route.plugin_config_ids` 原始值解析出 edge_uuid 列表（畸形输入返回空列表）。"""
    if not raw:
        return []
    if isinstance(raw, list):  # 已被上层反序列化的场景
        return [str(x) for x in raw]
    try:
        refs = json.loads(raw) if isinstance(raw, str) else raw
    except (json.JSONDecodeError, TypeError):
        return []
    if not isinstance(refs, list):
        return []
    return [str(x) for x in refs]


def find_referencing(routes: Iterable[Any], edge_uuid: str) -> list[Any]:
    """返回引用了 `edge_uuid` 的路由对象清单。"""
    return [r for r in routes if edge_uuid in extract_refs(getattr(r, "plugin_config_ids", None))]


def count_by_uuid(raw_refs: Iterable[Any]) -> dict[str, int]:
    """一次扫描统计每个插件组 edge_uuid 被多少条路由引用。

    入参是 `Route.plugin_config_ids` 的**原始值**序列（列表端点直接 `select` 该列即可，
    无需实例化 ORM 对象）。用于批量补齐 `reference_count`——禁止按插件组逐条查询（N+1）。
    """
    counts: dict[str, int] = {}
    for raw in raw_refs:
        for uuid in extract_refs(raw):
            counts[uuid] = counts.get(uuid, 0) + 1
    return counts


def plugin_ref_like_pattern(name: str) -> str:
    """插件引用 JSON 键精确 LIKE 形态（plugin-ref-filter D1）。

    ``plugins`` TEXT 列存 JSON 对象（键 = 插件标识名）。序列化形态固定为
    ``"name":``（紧凑与带空格分隔符均以 ``"name":`` 开头），故以键形态做
    LIKE 精确匹配——冒号后缀天然规避前缀串碰撞（``jwt-auth`` 不会命中
    ``jwt-auth-v2`` 的引用行）；值位置出现同名串不会命中（值序列化无冒号）。
    对 name 做 LIKE 通配转义（防御未来目录出现 %/_）。
    """
    escaped = name.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
    return f'%"{escaped}":%'
