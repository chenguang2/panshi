"""edge.env 上传上限对齐（edge-upload-limit-alignment）。

背景（2026-11-23 实测）：Edge pack 的 `conf/nginx_server_monitor.conf` 在 **server 级**
自带 `client_max_body_size 32m`，server 级覆盖 http 级 —— 因此在 edge.env 里写
`http.client_max_body_size: 132m` 对管理面（上传 zip 走的 :management_port）**无效**，
只有 `http.admin.client_max_body_size` 会被 `bin/edge init` 回写进该 server 块。

本模块是「生效上限判定」与「部署前文本级对齐」的唯一实现：
- 判定：admin 段有值 → 该值；缺失 → pack 基线 32MB（http 级不参与）；
- 对齐（2026-11-24 用户裁决 B）：**只在缺失时补写平台值；显式写下的一律保留**
  （更低值 = 运维刻意收紧，平台不得静默覆盖；由诊断/编辑提示/部署日志三处告警暴露
  「发布 >XMB 会 413」的落差）。**必须文本级**，不得 YAML round-trip
  （edge.env 带人工注释与顺序语义，yaml.dump 会全部毁掉）。
"""

import re

# Edge pack server 级基线（实测量：conf/nginx_server_monitor.conf 模板值）。
# pack 升级若改该默认值，需同步复核本常量与 AGENTS.md #50。
EDGE_ADMIN_BASELINE_MB = 32

_KEY = "client_max_body_size"

_RE_HTTP = re.compile(r"^(?P<indent>\s*)http:\s*(?:#.*)?$")
_RE_ADMIN = re.compile(r"^(?P<indent>\s*)admin:\s*(?:#.*)?$")
_RE_KEY = re.compile(r"^(?P<indent>\s*)(?P<key>client_max_body_size)\s*:\s*(?P<value>[^#\n]*?)\s*(?P<comment>#.*)?$")
_RE_SIZE = re.compile(r"^(?P<num>\d+)\s*(?P<unit>[kKmMgG])?$")


def _strip_comment(line: str) -> str:
    return line.split("#", 1)[0]


def _indent_of(line: str) -> int:
    return len(line) - len(line.lstrip(" "))


def _to_mb(value: str) -> int | None:
    """解析 nginx 尺寸值 → MB（无单位按字节）。无法解析返回 None。"""
    m = _RE_SIZE.match((value or "").strip())
    if not m:
        return None
    num = int(m.group("num"))
    unit = (m.group("unit") or "").lower()
    if unit == "m":
        return num
    if unit == "g":
        return num * 1024
    if unit == "k":
        return max(1, num // 1024) if num else 0
    # 无单位 = 字节
    return num // (1024 * 1024)


def _split_lines(content: str) -> tuple[list[str], str, bool]:
    """拆行并保留换行风格与「是否以换行结尾」。"""
    nl = "\r\n" if "\r\n" in content else "\n"
    trailing = content.endswith(("\n", "\r\n"))
    lines = content.replace("\r\n", "\n").split("\n")
    if trailing and lines and lines[-1] == "":
        lines.pop()
    return lines, nl, trailing


def _join_lines(lines: list[str], nl: str, trailing: bool) -> str:
    body = nl.join(lines)
    return body + nl if trailing else body


def _find_block(lines: list[str], pattern: re.Pattern, start: int = 0, min_indent: int = 0):
    """在 lines[start:] 中找首个匹配 pattern 且缩进 ≥ min_indent 的行索引。"""
    for i in range(start, len(lines)):
        line = lines[i]
        if not line.strip() or line.lstrip().startswith("#"):
            continue
        m = pattern.match(line)
        if m and _indent_of(line) >= min_indent:
            return i, _indent_of(line)
    return None, 0


def _block_end(lines: list[str], start: int, indent: int) -> int:
    """返回块结束索引（首个非空/非注释且缩进 ≤ indent 的行）。"""
    for i in range(start + 1, len(lines)):
        line = lines[i]
        if not line.strip() or line.lstrip().startswith("#"):
            continue
        if _indent_of(line) <= indent:
            return i
    return len(lines)


def _locate_admin(lines: list[str]) -> tuple[int, int] | None:
    """定位 `deploy.http.admin`（返回 (行索引, 缩进)）；只有 http 下的 admin 算。"""
    i_http, http_indent = _find_block(lines, _RE_HTTP)
    if i_http is None:
        return None
    http_end = _block_end(lines, i_http, http_indent)
    i_admin, admin_indent = _find_block(lines, _RE_ADMIN, start=i_http + 1, min_indent=http_indent + 1)
    if i_admin is None or i_admin >= http_end:
        return None
    return i_admin, admin_indent


def parse_admin_body_limit_mb(content: str) -> int | None:
    """解析 `deploy.http.admin.client_max_body_size`（缺失/不可解析 → None）。"""
    lines, _nl, _trailing = _split_lines(content)
    located = _locate_admin(lines)
    if located is None:
        return None
    i_admin, admin_indent = located
    admin_end = _block_end(lines, i_admin, admin_indent)
    for i in range(i_admin + 1, admin_end):
        line = lines[i]
        if not line.strip() or line.lstrip().startswith("#"):
            continue
        m = _RE_KEY.match(line)
        if m and _indent_of(line) > admin_indent:
            return _to_mb(m.group("value"))
    return None


def effective_limit_mb(content: str) -> int:
    """Edge 管理面实际生效的上传上限（MB）：admin 段值，缺失则 pack 基线。"""
    value = parse_admin_body_limit_mb(content)
    return EDGE_ADMIN_BASELINE_MB if value is None else value


def ensure_admin_limit(content: str, platform_mb: int) -> tuple[str, str, int | None]:
    """admin 段上限对齐（文本级）：只在缺失时补写平台值，显式值一律保留。

    用户裁决 B（2026-11-24）：显式写下的更低值是运维的刻意收紧，平台不得静默覆盖；
    落差由调用方以告警形式暴露（「发布 X–YMB 的 zip 会 413」）。

    Returns:
        (new_content, action, current_mb)
        action: inserted（原缺失，已补写平台值）/ kept（已存在，原样保留）
                 / absent（定位不到 deploy.http.admin，内容原样返回）
    """
    lines, nl, trailing = _split_lines(content)
    located = _locate_admin(lines)
    if located is None:
        return content, "absent", None
    i_admin, admin_indent = located
    admin_end = _block_end(lines, i_admin, admin_indent)

    target = f"{platform_mb}m"
    for i in range(i_admin + 1, admin_end):
        line = lines[i]
        if not line.strip() or line.lstrip().startswith("#"):
            continue
        m = _RE_KEY.match(line)
        if not m or _indent_of(line) <= admin_indent:
            continue
        # 已显式配置：原样保留（高低都不动），落差交调用方告警
        return content, "kept", _to_mb(m.group("value"))

    # 未配置：插入到 admin: 之后，缩进取 admin 子行缩进（无子行则 +2）
    child_indent = admin_indent + 2
    for i in range(i_admin + 1, admin_end):
        if lines[i].strip() and not lines[i].lstrip().startswith("#"):
            child_indent = _indent_of(lines[i])
            break
    lines.insert(i_admin + 1, f"{' ' * child_indent}{_KEY}: {target}")
    return _join_lines(lines, nl, trailing), "inserted", None


def parse_http_body_limit_mb(content: str) -> int | None:
    """解析 `deploy.http` **本级**的 client_max_body_size（admin 子块里的不算）。

    用途：诊断文案点明「http 级写了 X MB 也不生效」——Edge pack 的 server 级
    32m 只认 admin 段，运维常在 http 级白写一行（2026-11-24 实测再次出现）。
    """
    lines, _nl, _trailing = _split_lines(content)
    i_http, http_indent = _find_block(lines, _RE_HTTP)
    if i_http is None:
        return None
    http_end = _block_end(lines, i_http, http_indent)
    # http 块的直接子键缩进：取第一个子行缩进
    child_indent = None
    for i in range(i_http + 1, http_end):
        line = lines[i]
        if not line.strip() or line.lstrip().startswith("#"):
            continue
        child_indent = _indent_of(line)
        break
    if child_indent is None:
        return None
    for i in range(i_http + 1, http_end):
        line = lines[i]
        if not line.strip() or line.lstrip().startswith("#"):
            continue
        if _indent_of(line) != child_indent:
            continue
        m = _RE_KEY.match(line)
        if m:
            return _to_mb(m.group("value"))
    return None
