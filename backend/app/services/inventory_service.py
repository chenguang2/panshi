"""Ansible inventory 解析/渲染/校验/保存服务。

供「Ansible 主机清单」界面使用：parse/render 支撑双模式切换，
validate + save 提供保存三重护栏（解析校验→结构校验→备份+原子写回）。
"""

from typing import Any

import os
import re
import shutil
import tempfile
from datetime import datetime
from pathlib import Path

import yaml

from app.services import ansible_service
from app.services.ansible_service import ip_sort_key

# 表格视图可维护的已知键（ip 为 parse 输出的 API 层字段，非文件键）。
# 清单外的键走 unknown_keys 保真提示，只能在源码模式维护。
KNOWN_HOST_KEYS = (
    "ip", "ansible_ssh_user", "ansible_ssh_pass", "ansible_port",
    "ansible_host", "ansible_connection", "ansible_python_interpreter",
    "ansible_become", "ansible_become_user", "ansible_become_pass",
    "ansible_ssh_private_key_file", "ansible_ssh_common_args",
)

_CRED_KEYS = ("ansible_ssh_user", "ansible_ssh_pass")

_EDGE_PATH = ["all", "children", "edge_cluster"]

# IPv4 / 主机名的宽松字符集校验（字母数字点横线下划线）
_HOST_KEY_RE = re.compile(r"^[A-Za-z0-9]([A-Za-z0-9._-]*[A-Za-z0-9])?$")

# hosts 层（8 空格缩进）的 "key: null" 行 —— 还原为运维手写的裸键格式
_NULL_HOST_LINE_RE = re.compile(r"^        ([^\s:]+): null$", flags=re.M)

_BACKUP_KEEP = 10


def _inventory_path() -> Path:
    """Resolve the inventory file path at call time (test-friendly)."""
    return Path(ansible_service._INVENTORY_PATH)


def _yaml_error_line(exc: yaml.YAMLError) -> int | None:
    """Extract 1-based line number from a YAML exception mark, if present."""
    mark = getattr(exc, "problem_mark", None)
    return mark.line + 1 if mark is not None else None


def _node_line(raw_text: str, path: list[str]) -> int | None:
    """Locate the 1-based line of the node at *path* in *raw_text*.

    Uses yaml.compose so structural validation errors can report exact line
    numbers. Returns None when the node does not exist.
    """
    try:
        node = yaml.compose(raw_text)
    except yaml.YAMLError:
        return None
    for seg in path:
        if not isinstance(node, yaml.MappingNode):
            return None
        child = None
        for key_node, value_node in node.value:
            if isinstance(key_node, yaml.ScalarNode) and key_node.value == seg:
                child = value_node
                break
        if child is None:
            return None
        node = child
    return node.start_mark.line + 1


def _fail(message: str) -> dict[str, Any]:
    return {"hosts": [], "vars": {}, "unknown_keys": [], "errors": [message]}


def parse_inventory(raw_text: str) -> dict[str, Any]:
    """Parse inventory YAML text into a structured document.

    Returns ``{"hosts": [...], "vars": {...}, "unknown_keys": [...], "errors": []}``.
    Hosts entries carry their full field dicts (full fidelity) plus an ``ip``
    key; on any error ``errors`` holds one message with line number and the
    other fields are empty.
    """
    # 运维编辑器常留下行尾制表符，PyYAML 会拒绝（"found character '\\t' that
    # cannot start any token"）导致整个文件解析失败。行尾空白对 YAML 无语义，
    # 剥离后再解析；不影响引号内内容，也不改变行号（不增删行）。
    raw_text = "\n".join(line.rstrip() for line in raw_text.split("\n"))
    try:
        data = yaml.safe_load(raw_text)
    except yaml.YAMLError as exc:
        line = _yaml_error_line(exc)
        problem = getattr(exc, "problem", None) or str(exc)
        loc = f"第 {line} 行" if line else "未知位置"
        return _fail(f"YAML 解析失败（{loc}）: {problem}")

    if data is None:
        data = {}
    if not isinstance(data, dict):
        line = _node_line(raw_text, ["all"]) or 1
        return _fail(f"结构错误（第 {line} 行）: YAML 顶层必须是映射")

    edge = data.get("all", {}).get("children", {}).get("edge_cluster")
    if edge is not None and not isinstance(edge, dict):
        line = _node_line(raw_text, _EDGE_PATH) or 1
        return _fail(f"结构错误（第 {line} 行）: all.children.edge_cluster 必须是映射")

    hosts = (edge or {}).get("hosts") if isinstance(edge, dict) else None
    if not isinstance(hosts, dict):
        line = _node_line(raw_text, [*_EDGE_PATH, "hosts"])
        if line is None:
            line = _node_line(raw_text, _EDGE_PATH) or 1
        return _fail(
            f"结构错误（第 {line} 行）: all.children.edge_cluster.hosts 必须是映射"
        )

    vars_ = (edge or {}).get("vars") if isinstance(edge, dict) else None
    if vars_ is not None and not isinstance(vars_, dict):
        line = _node_line(raw_text, [*_EDGE_PATH, "vars"])
        if line is None:
            line = _node_line(raw_text, _EDGE_PATH) or 1
        return _fail(f"结构错误（第 {line} 行）: all.children.edge_cluster.vars 必须是映射")

    host_list: list[dict[str, Any]] = []
    unknown_keys: list[str] = []
    for ip, entry in hosts.items():
        item: dict[str, Any] = {"ip": str(ip)}
        if isinstance(entry, dict):
            item.update(entry)
        host_list.append(item)

    for entry in host_list:
        for key in entry:
            if key != "ip" and key not in KNOWN_HOST_KEYS and key not in unknown_keys:
                unknown_keys.append(key)

    return {
        "hosts": host_list,
        "vars": dict(vars_) if isinstance(vars_, dict) else {},
        "unknown_keys": unknown_keys,
        "errors": [],
    }


_ADVANCED_KEYS = KNOWN_HOST_KEYS[3:]  # 除 ip/凭据外的高级字段
_BOOL_STRINGS = {"yes": True, "no": False, "true": True, "false": False}


def normalize_hosts(hosts: list[dict[str, Any]]) -> tuple[list[dict[str, Any]], list[str]]:
    """Normalize advanced connection fields for structured saves (design D2).

    - ``ansible_port``: int or numeric string -> int; range 1-65535;
    - ``ansible_become``: bool or yes/no/true/false -> bool;
    - empty-string values on known keys are dropped (key not written);
    - other keys pass through untouched; errors aggregate across hosts.
    """
    normalized: list[dict[str, Any]] = []
    errors: list[str] = []

    for item in hosts:
        ip = str(item.get("ip", ""))
        out: dict[str, Any] = {}
        bad = False
        for key, value in item.items():
            if key in _ADVANCED_KEYS and isinstance(value, str) and value.strip() == "":
                continue  # 空串 = 删除该键
            if key == "ansible_port":
                try:
                    port = int(value)
                except (TypeError, ValueError):
                    errors.append(f"主机 {ip}: ansible_port 必须为 1-65535 的整数，当前为 {value!r}")
                    bad = True
                    continue
                if not 1 <= port <= 65535:
                    errors.append(f"主机 {ip}: ansible_port 必须为 1-65535 的整数，当前为 {value!r}")
                    bad = True
                    continue
                out[key] = port
            elif key == "ansible_become":
                if isinstance(value, bool):
                    out[key] = value
                elif isinstance(value, str) and value.strip().lower() in _BOOL_STRINGS:
                    out[key] = _BOOL_STRINGS[value.strip().lower()]
                else:
                    errors.append(
                        f"主机 {ip}: ansible_become 必须为布尔或 yes/no/true/false，当前为 {value!r}")
                    bad = True
            else:
                out[key] = value
        if not bad:
            normalized.append(out)
    return normalized, errors


def render_inventory(hosts: list[dict[str, Any]], vars_: dict[str, Any] | None) -> str:
    """Render structured hosts/vars back into inventory YAML text.

    Stable ordering (host IPs sorted numerically) and full fidelity: every
    key on a host entry — including unknown custom keys — is written back.
    Entries with no fields render as bare hosts inheriting group ``vars``.
    """
    hosts_map: dict[str, Any] = {}
    for h in hosts:
        ip = str(h.get("ip", "")).strip()
        if not ip:
            continue
        entry = {k: v for k, v in h.items() if k != "ip"}
        hosts_map[ip] = entry or None

    edge: dict[str, Any] = {
        "hosts": {ip: hosts_map[ip] for ip in sorted(hosts_map, key=ip_sort_key)}
    }
    if vars_:
        edge["vars"] = dict(vars_)

    doc = {"all": {"children": {"edge_cluster": edge}}}
    text = yaml.safe_dump(doc, allow_unicode=True, sort_keys=False)
    # 裸主机还原为 "ip:" 裸键行（YAML 语义与 ": null" 等价，格式对齐运维手写风格）
    return _NULL_HOST_LINE_RE.sub(r"        \1:", text)


def validate_structure(
    doc: dict[str, Any], platform_node_ips: list[str] | None = None
) -> list[str]:
    """Structural validation + deletion protection for a parsed inventory doc.

    Returns a list of error messages (empty when valid):
    - host key must look like an IPv4 address or hostname;
    - host value must be a mapping or null (inherit group vars);
    - deletion protection: platform node IPs absent from the submitted hosts
      are listed so the caller can reject the save (400).
    """
    errors: list[str] = []

    edge = doc.get("all", {}).get("children", {}).get("edge_cluster")
    hosts = edge.get("hosts") if isinstance(edge, dict) else None
    if not isinstance(hosts, dict):
        return ["结构错误: all.children.edge_cluster.hosts 必须是映射"]

    submitted_ips: set[str] = set()
    for raw_key, entry in hosts.items():
        key = str(raw_key)
        if not _HOST_KEY_RE.match(key):
            errors.append(f"主机键不合法（须为 IPv4 或主机名）: {key}")
            continue
        submitted_ips.add(key)
        if entry is not None and not isinstance(entry, dict):
            errors.append(
                f"主机 {key} 的值必须是映射或空（空值继承组级默认凭据）"
            )

    missing = sorted(ip for ip in (platform_node_ips or []) if ip not in submitted_ips)
    if missing:
        errors.append(
            "删除保护：以下平台节点 IP 已从清单中移除，但节点管理仍存在记录："
            + "、".join(missing)
            + "。请先在节点管理删除或停用这些节点，再保存清单"
        )
    return errors


def _rotate_backups(directory: Path, keep: int) -> None:
    """Delete oldest ``host.bak.*`` files so only the newest *keep* remain."""
    baks = sorted(directory.glob("host.bak.*"))
    for old in baks[:-keep]:
        old.unlink(missing_ok=True)


def save_inventory(new_text: str) -> None:
    """Persist *new_text* as the inventory file with safety rails.

    Reuses ``ansible_service._inventory_lock`` (shared with runtime port/SSH
    injection), copies the current file to ``host.bak.<YYYYMMDDHHmmss>``
    (keeping the newest 10 backups), and atomically replaces the file via
    tmp + ``os.replace``. Creates parent dirs / file when missing.
    """
    path = _inventory_path()
    with ansible_service._inventory_lock:
        path.parent.mkdir(parents=True, exist_ok=True)
        if path.exists():
            ts = datetime.now().strftime("%Y%m%d%H%M%S")
            shutil.copy2(path, path.parent / f"host.bak.{ts}")
            _rotate_backups(path.parent, keep=_BACKUP_KEEP)
        fd, tmp_name = tempfile.mkstemp(dir=str(path.parent), prefix=".host.tmp")
        try:
            with os.fdopen(fd, "w", encoding="utf-8") as f:
                f.write(new_text)
            os.replace(tmp_name, path)
        except BaseException:
            try:
                os.unlink(tmp_name)
            finally:
                raise
