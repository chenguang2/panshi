"""Cluster JSON backup export/import (change: add-cluster-json-backup).

Design refs: openspec/changes/add-cluster-json-backup/design.md
- D1 file format, D2 scope/secrets/degradation, D3 single import mode,
  D6 hard validation vs auto-clean warnings.
"""
import base64
import json
import logging
import re
from datetime import date, datetime
from pathlib import Path

from pydantic import BaseModel
from sqlalchemy import inspect as sa_inspect, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.cluster import (
    Cluster, GlobalRule, Node, PluginConfig, PluginMetadata, Route,
    RoutePlugin, StreamProxy, Upstream, UpstreamTarget,
)
from app.models.static_resource import StaticResource
from app.models.ssl import SslCertificate

BACKUP_FORMAT = "panshi-cluster-backup"
BACKUP_VERSION = 1

# SSL 私密字段：仅在 include_secrets=True 时写入备份（D2）
_SSL_SECRET_FIELDS = ("cert", "key", "sign_cert", "sign_key", "client_ca")


class BackupOptions(BaseModel):
    include_secrets: bool = False
    include_files: bool = False


def _serialize(row) -> dict:
    """Dump an ORM row into a plain dict over ALL columns (ISO timestamps).

    Dict keys use DB column names (e.g. ``key``), values read via the
    ORM attribute (``private_key``) when the two differ.
    """
    out = {}
    for attr in sa_inspect(row).mapper.column_attrs:
        val = getattr(row, attr.key)
        if isinstance(val, (datetime, date)):
            val = val.isoformat()
        out[attr.columns[0].name] = val
    return out



async def _fetch_all(db: AsyncSession, model, **filters) -> list:
    q = select(model)
    for k, v in filters.items():
        q = q.where(getattr(model, k) == v)
    result = await db.execute(q)
    return list(result.scalars().all())


async def build_backup(
    db: AsyncSession,
    cluster_id: int,
    options: BackupOptions | None = None,
) -> dict:
    """Build the full backup document for one cluster (design D1/D2)."""
    options = options or BackupOptions()

    cluster = await db.get(Cluster, cluster_id)
    if cluster is None:
        raise ValueError(f"cluster {cluster_id} not found")

    nodes = await _fetch_all(db, Node, cluster_id=cluster_id)
    upstreams = await _fetch_all(db, Upstream, cluster_id=cluster_id)
    routes = await _fetch_all(db, Route, cluster_id=cluster_id)
    plugin_configs = await _fetch_all(db, PluginConfig, cluster_id=cluster_id)
    global_rules = await _fetch_all(db, GlobalRule, cluster_id=cluster_id)
    plugin_metadatas = await _fetch_all(db, PluginMetadata, cluster_id=cluster_id)
    stream_proxies = await _fetch_all(db, StreamProxy, cluster_id=cluster_id)
    static_resources = await _fetch_all(db, StaticResource, cluster_id=cluster_id)
    ssl_certificates = await _fetch_all(db, SslCertificate, cluster_id=cluster_id)

    # 子表内嵌（D1）
    up_ids = [u.id for u in upstreams]
    targets_map: dict[int, list] = {}
    if up_ids:
        rows = await _fetch_all_by_in(db, UpstreamTarget, "upstream_id", up_ids)
        for t in rows:
            targets_map.setdefault(t.upstream_id, []).append(_serialize(t))

    route_ids = [r.id for r in routes]
    plugins_map: dict[int, list] = {}
    if route_ids:
        rows = await _fetch_all_by_in(db, RoutePlugin, "route_id", route_ids)
        for p in rows:
            plugins_map.setdefault(p.route_id, []).append(_serialize(p))

    warnings: list[str] = []
    data = {
        "cluster": _serialize_without(cluster, ("admin_key",)),
        "nodes": [_serialize(n) for n in nodes],
        "upstreams": [
            {**_serialize(u), "targets": targets_map.get(u.id, [])}
            for u in upstreams
        ],
        "routes": [
            {**_serialize(r), "plugins": plugins_map.get(r.id, [])}
            for r in routes
        ],
        "plugin_configs": [_serialize(p) for p in plugin_configs],
        "global_rules": [_serialize(g) for g in global_rules],
        "plugin_metadatas": [_serialize(p) for p in plugin_metadatas],
        "stream_proxies": [_serialize(s) for s in stream_proxies],
        "static_resources": [_serialize(s) for s in static_resources],
        "ssl_certificates": [],
    }

    for cert in ssl_certificates:
        item = _serialize(cert)
        if not options.include_secrets:
            for field in _SSL_SECRET_FIELDS:
                item[field] = None
        data["ssl_certificates"].append(item)

    import base64
    from pathlib import Path

    sr_items = []
    for sr in static_resources:
        item = _serialize(sr)
        if options.include_files and sr.storage_path:
            path = Path(sr.storage_path)
            if path.is_file():
                item["content_base64"] = base64.b64encode(path.read_bytes()).decode()
            else:
                warnings.append(
                    f"静态资源文件缺失，仅导出元数据：{sr.name}（{sr.storage_path}）")
        sr_items.append(item)
    data["static_resources"] = sr_items

    return {
        "format": BACKUP_FORMAT,
        "version": BACKUP_VERSION,
        "created_at": datetime.now().isoformat(),
        "source_cluster": {"id": cluster.id, "name": cluster.name},
        "options": options.model_dump(),
        "warnings": warnings,
        "data": data,
    }


async def _fetch_all_by_in(db: AsyncSession, model, column: str, values: list):
    q = select(model).where(getattr(model, column).in_(values))
    result = await db.execute(q)
    return list(result.scalars().all())


def _serialize_without(row, skip: tuple[str, ...]) -> dict:
    return {k: v for k, v in _serialize(row).items() if k not in skip}


def compute_checksum(data) -> str:
    """Deterministic SHA-256 over the backup ``data`` section (design D1)."""
    import hashlib
    import json

    canonical = json.dumps(data, sort_keys=True, ensure_ascii=False)
    digest = hashlib.sha256(canonical.encode("utf-8")).hexdigest()
    return f"sha256:{digest}"


_DATA_KEYS = (
    "cluster", "nodes", "upstreams", "routes", "plugin_configs",
    "global_rules", "plugin_metadatas", "stream_proxies",
    "static_resources", "ssl_certificates",
)


# edge_uuid 会被拼进 data/static/<edge_uuid>/ 作为落盘目录（导入写盘与
# 删除端点 rmtree 均使用），必须是单段安全目录名：仅允许字母、数字与
# . _ -；拒绝空串、路径分隔符（/ \）与目录别名 . ..（防目录穿越写入/删除）。
_EDGE_UUID_PATTERN = re.compile(r"^[A-Za-z0-9._-]+$")


def validate_edge_uuid(edge_uuid) -> None:
    """静态资源 edge_uuid 安全校验：非法值抛 ValueError（2026-09 安全缺陷修复）。

    None（未生成 uuid）合法；写盘方会以 "imported" 兜底。
    """
    if edge_uuid is None:
        return
    if (not isinstance(edge_uuid, str)
            or not _EDGE_UUID_PATTERN.match(edge_uuid)
            or edge_uuid in (".", "..")):
        raise ValueError(
            f"edge_uuid 含非法字符，已拒绝：{edge_uuid!r}"
            "（仅允许字母、数字与 . _ -，禁止路径分隔符与目录别名）")


def validate_backup_document(doc: dict, expected_checksum: str | None = None) -> list[str]:
    """Hard validation (design D6). Returns aggregated error list; [] = valid."""
    errors: list[str] = []
    if not isinstance(doc, dict):
        return ["备份文件结构无效：顶层必须是 JSON 对象"]
    if doc.get("format") != BACKUP_FORMAT:
        errors.append(f"format 不匹配：期望 {BACKUP_FORMAT}，实际 {doc.get('format')!r}")
    version = doc.get("version")
    if not isinstance(version, int) or version > BACKUP_VERSION:
        errors.append(f"version 不支持：{version!r}（当前支持 ≤{BACKUP_VERSION}）")

    data = doc.get("data")
    if not isinstance(data, dict):
        errors.append("缺少 data 数据段")
        data = {}
    for key in _DATA_KEYS:
        if key not in data:
            errors.append(f"data 缺少必需段：{key}")

    if expected_checksum is not None:
        actual = compute_checksum(data)
        if actual != expected_checksum:
            errors.append(
                f"checksum 校验失败：期望 {expected_checksum}，实际 {actual}"
                "（文件可能损坏或被修改）")

    # 字段值安全校验：static_resources[].edge_uuid 会用作落盘目录名，
    # 恶意值（如 ../..）可导致任意路径写入/删除，必须在导入入口拒绝
    for item in data.get("static_resources") or []:
        if not isinstance(item, dict):
            continue
        try:
            validate_edge_uuid(item.get("edge_uuid"))
        except ValueError as exc:
            errors.append(str(exc))

    # 说明：不做"备份内名称唯一性"硬校验——导入采用旧ID→新ID精确映射，
    # 不依赖名称；源数据中的重名（历史数据常见）不应阻断导入。
    return errors


# ── 导入（单一模式，design D3/D4/D6）─────────────────────────────────

import os

_BASE_STORAGE_DIR = os.path.join(
    # services/ 在 backend/app/services/，向上 3 级即 backend/；
    # 不能照搬 api/v1/ 的 4 级写法（会退到仓库根，见 test_cluster_backup_static_path.py）
    os.path.dirname(os.path.dirname(os.path.dirname(__file__))),
    "data", "static",
)

_DROP_KEYS = ("id", "cluster_id", "current_version", "created_at", "updated_at")
_NESTED_KEYS = ("targets", "plugins", "content_base64")

# 运行态发布状态列（static-resources-ux-close-loop 组 5）：新导入集群处于
# 未发布状态，SHALL NOT 继承源集群的发布痕迹（与节点 status 重置为离线、
# 集群 status=1 同语义）。这些列的时间值经导出序列化是 ISO 字符串，若原样
# 绑定 DateTime 列会在 commit 时炸出 StatementError（change:
# cluster-backup-restore-fix P0 根因），故在 static_resources 分支显式丢弃。
_RUNTIME_STATE_KEYS = ("last_publish_ok", "last_publish_detail", "last_published_at")


def _coerce_datetime_fields(kwargs: dict, model: type) -> dict:
    """按模型列类型矫正时间字段：DateTime/Date 列上的 ISO 字符串解析回原生类型。

    按类修（不逐列打补丁）：未来新增时间列自动免疫。解析失败或空值置 None
    并继续（不中断导入）。
    """
    from sqlalchemy import Date, DateTime

    mapper = sa_inspect(model)
    for col in mapper.columns:
        col_type = col.type.__class__
        if col_type not in (DateTime, Date):
            continue
        val = kwargs.get(col.name)
        if not isinstance(val, str):
            continue
        try:
            kwargs[col.name] = datetime.fromisoformat(val.replace("Z", "+00:00")) \
                .replace(tzinfo=None)
        except ValueError:
            kwargs[col.name] = None
    return kwargs


def _entity_kwargs(item: dict, cluster_id: int, model: type | None = None) -> dict:
    """Backup row → ORM kwargs: drop platform-managed fields, retarget cluster.

    model 传入时按 ORM 属性键白名单过滤（BAK-08 前向兼容）：新版本备份
    文件中本版本不认识的条目级字段直接丢弃，而非 `TypeError: invalid
    keyword argument` 使整个导入回滚。白名单含列名（mapper.columns）——
    SslCertificate.private_key 的列名是 "key"（约定 #23），须先以列名
    通过白名单、再由 _ssl_kwargs 改名为属性名。
    """
    kwargs = {k: v for k, v in item.items()
              if k not in _DROP_KEYS and k not in _NESTED_KEYS}
    kwargs["cluster_id"] = cluster_id
    if model is not None:
        mapper = sa_inspect(model)
        allowed = set(mapper.attrs.keys()) | {c.name for c in mapper.columns}
        kwargs = {k: v for k, v in kwargs.items() if k in allowed}
        kwargs = _coerce_datetime_fields(kwargs, model)
    return kwargs


def _ssl_kwargs(item: dict, cluster_id: int) -> dict:
    """SSL 证书行：cert/private_key 列为 NOT NULL，内容缺失时以空串占位，
    行本身照常导入并进入需补齐清单（design D6 降级策略）。"""
    kwargs = _entity_kwargs(item, cluster_id, model=SslCertificate)
    # SSL 证书列名 → ORM 属性名差异（ps_ssl_certificate."key"）
    if "key" in kwargs:
        kwargs["private_key"] = kwargs.pop("key")
    if kwargs.get("cert") is None:
        kwargs["cert"] = ""
    if kwargs.get("private_key") is None:
        kwargs["private_key"] = ""
    return kwargs


class BackupImportError(ValueError):
    """导入校验类失败（保持 400 语义直通）。

    继承 ValueError 兼容既有 API 层 `except ValueError → 400` 契约；
    非 BackupImportError 的 ValueError（如 binascii.Error）视为意外
    异常，走 stage 定位转译（D5）——否则解码失败会裸奔英文原始信息。
    """


def _static_file_path(edge_uuid: str | None, version) -> str:
    """静态资源落盘路径计算（edge_uuid 安全校验在此；不建目录不写盘）。"""
    validate_edge_uuid(edge_uuid)
    ver = version if isinstance(version, int) and version > 0 else 1
    return str(Path(_BASE_STORAGE_DIR) / (edge_uuid or "imported") / f"{ver}.zip")


def _write_static_file_at(path: str, content_b64: str) -> str:
    """按既定路径落盘 zip 内容（解码失败抛异常，由调用方统一回滚清理）。"""
    target = Path(path)
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(base64.b64decode(content_b64))
    return str(target)


def _write_static_file(edge_uuid: str | None, version, content_b64: str) -> str:
    """兼容入口：路径计算 + 落盘一步完成。"""
    return _write_static_file_at(
        _static_file_path(edge_uuid, version), content_b64)


logger = logging.getLogger(__name__)


async def import_backup(
    db: AsyncSession,
    doc: dict,
    target_cluster_name: str,
    creator_id: int | None = None,
) -> dict:
    """Single-mode import: create a NEW cluster from a backup document.

    All platform IDs are reassigned by the database; FKs are rebuilt via
    old-id → new-id maps captured during insertion (equivalent to the
    name/ip:port mapping in design D3, exact within one backup).
    """
    # stage：失败时定位出错资源段（错误可读性，D5）；written_files：回滚后
    # 需清理的已落盘文件（失败即无副作用，D4）——两者必须在 try 前初始化。
    stage = "准备"
    written_files: list[str] = []
    try:
        data = doc["data"]
        warnings: list[str] = []
        pending_items: list[dict] = []

        # 与创建集群相同的命名规则（schemas/cluster.py）
        from app.schemas.cluster import NAME_ERROR_MSG, NAME_PATTERN

        if not NAME_PATTERN.match(target_cluster_name or ""):
            raise BackupImportError(NAME_ERROR_MSG)

        dup = await db.execute(
            select(Cluster).where(Cluster.name == target_cluster_name))
        if dup.scalar_one_or_none():
            raise BackupImportError(f"目标集群名已存在：{target_cluster_name}")

        stage = "集群"
        src = data["cluster"]
        # Cluster 导入模型感知（change: cluster-backup-restore-fix D3）：
        # 业务列（含 region_code 区域绑定）随备份迁移；平台管理字段显式钉死。
        ckwargs = _entity_kwargs(src, 0, model=Cluster)
        ckwargs["name"] = target_cluster_name
        ckwargs["status"] = 1
        ckwargs["creator_id"] = creator_id
        ckwargs.pop("admin_key", None)  # 导出侧已排除，双保险
        cluster = Cluster(**ckwargs)
        db.add(cluster)
        await db.flush()
        cid = cluster.id

        # 节点：旧id → 新id；运行态重置为离线（D3 步骤6）
        stage = "节点"
        node_map: dict[int, int] = {}
        for item in data["nodes"]:
            row = Node(**_entity_kwargs(item, cid, model=Node))
            row.status = 0
            db.add(row)
            await db.flush()
            node_map[item["id"]] = row.id

        # SSL 证书：先 CA 后服务器，ca_cert_id 按旧id映射
        stage = "SSL 证书"
        cert_map: dict[int, int] = {}
        for item in data["ssl_certificates"]:
            if not item.get("is_ca"):
                continue
            row = SslCertificate(**_ssl_kwargs(item, cid))
            db.add(row)
            await db.flush()
            cert_map[item["id"]] = row.id
            if not item.get("cert"):
                pending_items.append({
                    "name": item["name"], "type": "ssl_certificate",
                    "reason": "证书缺少内容，需重新生成或导入证书文件"})
        for item in data["ssl_certificates"]:
            if item.get("is_ca"):
                continue
            kwargs = _ssl_kwargs(item, cid)
            old_ca = item.get("ca_cert_id")
            kwargs["ca_cert_id"] = cert_map.get(old_ca) if old_ca else None
            row = SslCertificate(**kwargs)
            db.add(row)
            await db.flush()
            cert_map[item["id"]] = row.id
            if not item.get("cert"):
                pending_items.append({
                    "name": item["name"], "type": "ssl_certificate",
                    "reason": "证书缺少内容，需重新生成或导入证书文件"})

        # 上游 + 目标节点
        stage = "上游"
        upstream_map: dict[int, int] = {}
        for item in data["upstreams"]:
            row = Upstream(**_entity_kwargs(item, cid, model=Upstream))
            db.add(row)
            await db.flush()
            upstream_map[item["id"]] = row.id
            for t in item.get("targets") or []:
                tkw = {k: v for k, v in t.items()
                       if k not in ("id", "upstream_id", "created_at")}
                tkw["upstream_id"] = row.id
                db.add(UpstreamTarget(**tkw))

        # 插件组（edge_uuid 原值保留）
        stage = "插件组"
        pc_edge_uuids = {p.get("edge_uuid") for p in data["plugin_configs"]}
        for item in data["plugin_configs"]:
            db.add(PluginConfig(**_entity_kwargs(item, cid, model=PluginConfig)))
        await db.flush()

        # 路由 + 路由插件
        stage = "路由"
        route_map: dict[int, int] = {}
        for item in data["routes"]:
            kwargs = _entity_kwargs(item, cid, model=Route)
            old_up = item.get("upstream_id")
            kwargs["upstream_id"] = upstream_map.get(old_up) if old_up else None
            ids_raw = item.get("plugin_config_ids")
            if ids_raw:
                try:
                    refs = json.loads(ids_raw)
                except (json.JSONDecodeError, TypeError):
                    refs = []
                valid = [r for r in refs if r in pc_edge_uuids]
                if valid != refs:
                    missing = [r for r in refs if r not in pc_edge_uuids]
                    warnings.append(
                        f"路由 {item.get('name')} 的插件组引用已清理，"
                        f"失效项：{missing}")
                    kwargs["plugin_config_ids"] = json.dumps(valid)
            row = Route(**kwargs)
            db.add(row)
            await db.flush()
            route_map[item["id"]] = row.id
            for p in item.get("plugins") or []:
                pkw = {k: v for k, v in p.items()
                       if k not in ("id", "route_id", "created_at", "updated_at")}
                pkw["route_id"] = row.id
                db.add(RoutePlugin(**pkw))

        stage = "全局规则"
        for item in data["global_rules"]:
            db.add(GlobalRule(**_entity_kwargs(item, cid, model=GlobalRule)))
        for item in data["plugin_metadatas"]:
            db.add(PluginMetadata(**_entity_kwargs(item, cid, model=PluginMetadata)))

        # 四层代理：ref_node_id 重映射
        stage = "四层代理"
        for item in data["stream_proxies"]:
            kwargs = _entity_kwargs(item, cid, model=StreamProxy)
            old_ref = item.get("ref_node_id")
            if old_ref is not None:
                if old_ref in node_map:
                    kwargs["ref_node_id"] = node_map[old_ref]
                else:
                    kwargs["ref_node_id"] = None
                    warnings.append(
                        f"四层代理 {item.get('name')} 的参考节点引用无效，"
                        f"已置空（ref_node_id={old_ref}）")
            db.add(StreamProxy(**kwargs))

        # 静态资源：route_id 映射；运行态发布状态丢弃（未发布语义）；
        # 文件延迟到全部行 flush 成功后统一落盘（失败即无副作用，D4）
        stage = "静态资源"
        pending_file_writes: list[tuple[str, str]] = []
        for item in data["static_resources"]:
            kwargs = _entity_kwargs(item, cid, model=StaticResource)
            for rk in _RUNTIME_STATE_KEYS:
                kwargs.pop(rk, None)
            old_rt = item.get("route_id")
            kwargs["route_id"] = route_map.get(old_rt) if old_rt else None
            content = item.get("content_base64")
            if content:
                target_path = _static_file_path(
                    item.get("edge_uuid"), item.get("current_version"))
                kwargs["storage_path"] = target_path
                pending_file_writes.append((target_path, content))
            else:
                kwargs["storage_path"] = None
                pending_items.append({
                    "name": item.get("name"), "type": "static_resource",
                    "reason": "静态资源缺少文件内容，需重新上传 ZIP 文件"})
            db.add(StaticResource(**kwargs))

        # 全部 DB 行构造/flush 无异常后，才真正落盘文件并提交；
        # 任一写盘失败 → rollback + 清理已写文件，磁盘不留孤儿 zip。
        written_files: list[str] = []
        for target_path, content_b64 in pending_file_writes:
            written_files.append(
                _write_static_file_at(target_path, content_b64))

        await db.commit()
        return {
            "cluster_id": cid,
            "warnings": warnings,
            "pending_items": pending_items,
        }
    except Exception as exc:
        await db.rollback()
        for path in written_files:
            try:
                os.unlink(path)
            except OSError:
                pass
        if isinstance(exc, BackupImportError):
            raise
        # 写库/解码等意外异常 → 可读 400（API 层 except ValueError 承接），
        # 原始堆栈仍记服务端日志（不吞错）。
        logger.exception("集群备份导入失败（target=%s, stage=%s）",
                         target_cluster_name, stage)
        brief = str(exc).strip()
        if len(brief) > 160:
            brief = brief[:160] + "…"
        raise ValueError(
            f"导入失败（{stage}段）：备份数据与当前数据模型不兼容，"
            f"请确认备份文件由当前版本平台导出（{type(exc).__name__}: {brief}）"
        ) from None
