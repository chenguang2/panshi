"""last_publish_detail 字段共享定义（republish-failed-nodes 方案 B，D10/D11）。

五类资源模型持久化上次发布逐节点失败明细（TEXT 列存 JSON 字符串）。响应
schema 统一经 ``PublishDetailField``（str→dict 容错，#48 同款边界：TEXT 列
直读为字符串时先解析；损坏/为空返回 None），响应里永远是解析对象。

手动构造响应的端点（routes / plugin_metadata）用 ``parse_publish_detail``。
"""

from __future__ import annotations

import json
from typing import Annotated, Any, Optional

from pydantic import BeforeValidator


def parse_publish_detail(raw: Any) -> Optional[dict]:
    """last_publish_detail TEXT 列（JSON 字符串）→ 解析对象；损坏/为空返回 None。"""
    if not raw:
        return None
    if isinstance(raw, dict):
        return raw
    if isinstance(raw, str):
        try:
            parsed = json.loads(raw)
            return parsed if isinstance(parsed, dict) else None
        except (ValueError, TypeError):
            return None
    return None


PublishDetailField = Annotated[Optional[dict], BeforeValidator(parse_publish_detail)]
