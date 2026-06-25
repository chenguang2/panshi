from typing import Any, Tuple, Optional
import yaml


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
