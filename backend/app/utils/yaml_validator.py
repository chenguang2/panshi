from typing import Any, Tuple, Optional
import yaml

_PORT_RANGE_HINT = "端口须为 1-65535 的整数"


def _extract_port(addr: str) -> Optional[str]:
    """从 ``host:port`` 形态提取端口段；无冒号返回 None。兼容 IPv6 ``[::]:80``。"""
    idx = addr.rfind(":")
    if idx < 0:
        return None
    return addr[idx + 1:]


def _validate_listen_entries(side: str, listen: Any) -> Optional[str]:
    """校验单个 listen 列表的端口合法性，返回错误文案或 None。

    跳过：``unix:`` 前缀条目、无 ``addr`` 键的 dict 条目（未知扩展不误伤）。
    """
    if not isinstance(listen, list):
        return None
    path = f"deploy → http → {side} → listen"
    for i, entry in enumerate(listen, start=1):
        if isinstance(entry, dict):
            addr = entry.get("addr")
        else:
            addr = entry
        if not isinstance(addr, str) or addr.startswith("unix:"):
            continue
        port = _extract_port(addr)
        if port is None or not port.isdigit() or not (1 <= int(port) <= 65535):
            return f"{path} 第 {i} 项端口非法: {addr}（{_PORT_RANGE_HINT}）"
    return None


def _get(data: dict[str, Any], *keys: str) -> Any:
    """Safely traverse nested dict keys, returning None if any missing."""
    for k in keys:
        if not isinstance(data, dict):
            return None
        data = data.get(k)
    return data


def validate_edge_env(content: str) -> Tuple[bool, Optional[str]]:
    """Validate edge.env content for required fields.

    Checks YAML syntax first, then validates required structural fields:
    - ``deploy``
    - ``deploy.http``
    - ``deploy.http.edge.listen`` (non-empty list)
    - ``deploy.http.admin.listen`` (non-empty list)

    Returns:
        Tuple of (is_valid, error_message).
    """
    # Step 1: YAML syntax check
    ok, err = validate_yaml(content)
    if not ok:
        return False, err

    data = yaml.safe_load(content)
    if not isinstance(data, dict):
        return False, "配置内容必须是 YAML 对象"

    checks: list[tuple[str, ...]] = [
        ("deploy",),
        ("deploy", "http"),
    ]
    for path in checks:
        val = _get(data, *path)
        if val is None:
            return False, f"缺少必填字段: {' → '.join(path)}"

    # Check deploy.http.edge.listen — non-empty list
    edge_listen = _get(data, "deploy", "http", "edge", "listen")
    if not isinstance(edge_listen, list) or len(edge_listen) == 0:
        return False, "缺少必填字段或字段为空: deploy → http → edge → listen"

    # Check deploy.http.admin.listen — non-empty list
    admin_listen = _get(data, "deploy", "http", "admin", "listen")
    if not isinstance(admin_listen, list) or len(admin_listen) == 0:
        return False, "缺少必填字段或字段为空: deploy → http → admin → listen"

    # Check listen entry port validity (edge-env-port-validation)
    for side, listen in (("edge", edge_listen), ("admin", admin_listen)):
        port_err = _validate_listen_entries(side, listen)
        if port_err:
            return False, port_err

    return True, None


def validate_yaml(content: str) -> Tuple[bool, Optional[str]]:
    """Validate YAML syntax.

    Returns:
        Tuple of (is_valid: bool, error_message: Optional[str]).
        error_message is None when valid, contains details when invalid.
    """
    if not content or not content.strip():
        return False, "YAML content is empty"

    try:
        yaml.safe_load(content)
        return True, None
    except yaml.YAMLError as e:
        if hasattr(e, 'problem_mark'):
            mark = e.problem_mark
            msg = f"YAML syntax error at line {mark.line + 1}, column {mark.column + 1}"
            if e.problem:
                msg += f": {e.problem}"
            return False, msg
        return False, f"YAML parse error: {str(e)}"
