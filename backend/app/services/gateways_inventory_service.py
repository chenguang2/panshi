"""中继网关清单（inventory/gateways）派生渲染服务。

relay-gateway-inventory-ui：`relay_gateways` 表的 SSH 连接凭据是唯一权威源，
本服务负责把 DB 渲染为 YAML 清单写盘（按局分组 `gateways_<code>`），
并提供存量手工文件的一次性迁移（备份 → 回填 → 重渲染）与状态查询。

设计要点（openspec 同名 change D3/D4）：
- CRUD 保存即整组重写（原子写 tmp+rename），旧文件先备份 `gateways.bak.<ts>`（保留 10 份）；
- 写盘后 0600 收权（复用 relay_push.ensure_gateways_perms 的 M23 语义）；
- 文件头标注「由系统生成」——迁移以此判定幂等；
- 匹配不到注册网关的文件分组（孤儿）原样保留并在 inventory_status 暴露；
- relay_sshd 的行级临时注入机制不受影响：渲染只来自 DB 行，天然不含临时行。
"""
from datetime import datetime
from pathlib import Path

import yaml

from app.services.relay_push import ensure_gateways_perms

# 与 relay_push._GATEWAYS_INVENTORY 同路径；独立常量便于测试 monkeypatch 隔离
GATEWAYS_PATH = str(Path(__file__).resolve().parents[2] / "ansible" / "inventory" / "gateways")

GENERATED_HEADER = (
    "# 本文件由系统自动生成（relay-gateway-inventory-ui），勿手工修改。\n"
    "# 修改 SSH 连接信息请走界面：【运维管理】→【中继区域管理】→ 编辑网关。\n"
    "# 本文件是 relay_gateways 表的派生成品：任何网关 CRUD 都会整组重写本文件。\n"
)

_BACKUP_KEEP = 10

DEFAULT_SSH_COMMON_ARGS = "-o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null"


def is_generated(path: str | None = None) -> bool:
    p = Path(path or GATEWAYS_PATH)
    try:
        return p.read_text(encoding="utf-8").startswith(GENERATED_HEADER[:20])
    except FileNotFoundError:
        return False


def _host_block(gw) -> list[str]:
    """单个网关主机的 YAML 行块（缩进 4 层由调用方拼）。"""
    lines = [
        f"      ansible_user: {gw.ssh_user or ''}",
        f"      ansible_ssh_pass: {gw.ssh_password}",
    ]
    if not gw.ssh_password:
        lines = [lines[0]]  # 无口令 = 密钥认证，不渲染 ansible_ssh_pass
    port = gw.ssh_port or 22
    args = gw.ssh_common_args or DEFAULT_SSH_COMMON_ARGS
    lines.append(f"      ansible_port: {port}" if port != 22 else None)
    if gw.ansible_python_interpreter:
        lines.append(f"      ansible_python_interpreter: {gw.ansible_python_interpreter}")
    lines.append(f"      ansible_ssh_common_args: {args}")
    return [ln for ln in lines if ln]


def render_content(gateways: list, orphan_groups: list[str] | None = None) -> str:
    """按局分组渲染整份清单文本（gateways: 按 code 排序；孤儿分组原样缀后）。"""
    out = [GENERATED_HEADER]
    for gw in sorted(gateways, key=lambda g: g.code):
        out.append(f"gateways_{gw.code}:\n  hosts:")
        host_ip = _gateway_ip(gw)
        out.append(f"    {host_ip}:")
        for ln in _host_block(gw):
            out.append(ln)
        out.append("")
    for name, text in (orphan_groups or []):
        out.append(f"# 孤儿分组（文件存在但无对应网关注册，保留待处理）：{name}")
        out.append(text.rstrip())
        out.append("")
    return "\n".join(out)


def _gateway_ip(gw) -> str:
    """网关机 IP：从 ssh_jump（user@ip[:port]）解析；空 = code 本身（装机前占位）。"""
    jump = gw.ssh_jump or ""
    tail = jump.split("@", 1)[1] if "@" in jump else jump
    return tail.split(":", 1)[0] if tail else gw.code


def render_and_write(gateways: list, orphan_groups: list[str] | None = None,
                     previous_text_path: str | None = None) -> None:
    """渲染并原子写盘：备份旧文件 → tmp+rename → 0600。备份保留最近 _BACKUP_KEEP 份。"""
    p = Path(previous_text_path or GATEWAYS_PATH)
    text = render_content(gateways, orphan_groups)
    if p.exists() and not p.read_text(encoding="utf-8").startswith(GENERATED_HEADER[:20]):
        stamp = datetime.utcnow().strftime("%Y%m%d_%H%M%S_%f")
        backup = p.with_name(f"gateways.bak.{stamp}")
        backup.write_text(p.read_text(encoding="utf-8"), encoding="utf-8")
        _rotate_backups(p.parent)
    p.parent.mkdir(parents=True, exist_ok=True)
    tmp = p.with_name(f"{p.name}.tmp")
    tmp.write_text(text, encoding="utf-8")
    tmp.replace(p)
    ensure_gateways_perms(str(p))


def _rotate_backups(directory: Path) -> None:
    backups = sorted(
        directory.glob("gateways.bak.*"), key=lambda f: f.stat().st_mtime, reverse=True
    )
    for old in backups[_BACKUP_KEEP:]:
        old.unlink(missing_ok=True)


async def migrate_gateways_file(db) -> dict:
    """一次性迁移手工清单：备份 → 按 IP+用户回填 DB → 重渲染（幂等，见 D4）。"""
    p = Path(GATEWAYS_PATH)
    if not p.exists() or is_generated(p):
        return {"migrated": False, "reason": "missing_or_generated"}

    from sqlalchemy import select

    from app.models.relay import RelayGateway

    legacy_text = p.read_text(encoding="utf-8")
    try:
        doc = yaml.safe_load(legacy_text) or {}
    except yaml.YAMLError:
        return {"migrated": False, "reason": "yaml_error"}

    rows = (await db.execute(select(RelayGateway))).scalars().all()
    by_ip: dict[str, RelayGateway] = {}
    for gw in rows:
        by_ip.setdefault(_gateway_ip(gw), gw)

    registered_codes = {f"gateways_{gw.code}" for gw in rows}
    orphan_groups: list[tuple[str, str]] = []
    matched = 0
    for group_name, group in (doc or {}).items():
        if not isinstance(group, dict):
            continue
        hosts = (group.get("hosts") or {}) if isinstance(group.get("hosts"), dict) else {}
        if group_name not in registered_codes:
            orphan_groups.append((group_name, yaml.safe_dump({group_name: group}, allow_unicode=True)))
            continue
        for ip, conf in hosts.items():
            gw = by_ip.get(str(ip))
            if gw is None or not isinstance(conf, dict):
                continue
            if gw.ssh_user:
                continue  # 已有凭据（重复迁移/并发），不覆盖
            gw.ssh_user = str(conf.get("ansible_user") or "")
            gw.ssh_password = str(conf.get("ansible_ssh_pass")) if conf.get("ansible_ssh_pass") else None
            port = conf.get("ansible_port")
            gw.ssh_port = int(port) if port else 22
            interp = conf.get("ansible_python_interpreter")
            gw.ansible_python_interpreter = str(interp) if interp else None
            args = conf.get("ansible_ssh_common_args")
            gw.ssh_common_args = str(args) if args else None
            matched += 1
    await db.commit()

    render_and_write(rows, orphan_groups=orphan_groups)
    return {"migrated": True, "matched": matched, "orphan_groups": [n for n, _ in orphan_groups]}


async def collect_orphans(db, path: str | None = None) -> list[tuple[str, str]]:
    """读取现存文件，返回无对应网关注册的分组（原样保留用）：[(组名, YAML 文本)]。"""
    p = Path(path or GATEWAYS_PATH)
    if not p.exists():
        return []
    try:
        doc = yaml.safe_load(p.read_text(encoding="utf-8")) or {}
    except yaml.YAMLError:
        return []

    from sqlalchemy import select

    from app.models.relay import RelayGateway

    rows = (await db.execute(select(RelayGateway))).scalars().all()
    registered = {f"gateways_{gw.code}" for gw in rows}
    orphans = []
    for name, group in (doc or {}).items():
        if (
            isinstance(name, str)
            and name.startswith("gateways_")
            and name not in registered
            and isinstance(group, dict)
        ):
            orphans.append((name, yaml.safe_dump({name: group}, allow_unicode=True)))
    return orphans


async def inventory_status(db) -> dict:
    """清单健康状态：是否派生成品 / 孤儿分组名 / 各局主机组缺失（配合列表行标志）。"""
    p = Path(GATEWAYS_PATH)
    generated = is_generated(p)
    orphans: list[str] = []
    if p.exists():
        try:
            doc = yaml.safe_load(p.read_text(encoding="utf-8")) or {}
        except yaml.YAMLError:
            doc = {}
        from sqlalchemy import select

        from app.models.relay import RelayGateway

        rows = (await db.execute(select(RelayGateway))).scalars().all()
        registered = {f"gateways_{gw.code}" for gw in rows}
        orphans = [g for g in doc if isinstance(g, str) and g.startswith("gateways_") and g not in registered]
    return {"generated": generated, "orphan_groups": orphans}
