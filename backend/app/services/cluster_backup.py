"""Cluster JSON backup export/import (change: add-cluster-json-backup).

Design refs: openspec/changes/add-cluster-json-backup/design.md
- D1 file format, D2 scope/secrets/degradation, D3 single import mode,
  D6 hard validation vs auto-clean warnings.
"""
import json
from datetime import date, datetime

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

    # 说明：不做"备份内名称唯一性"硬校验——导入采用旧ID→新ID精确映射，
    # 不依赖名称；源数据中的重名（历史数据常见）不应阻断导入。
    return errors


# ── 导入（单一模式，design D3/D4/D6）─────────────────────────────────

import os

_BASE_STORAGE_DIR = os.path.join(
    os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(__file__)))),
    "data", "static",
)

_DROP_KEYS = ("id", "cluster_id", "current_version", "created_at", "updated_at")
_NESTED_KEYS = ("targets", "plugins", "content_base64")


def _entity_kwargs(item: dict, cluster_id: int) -> dict:
    """Backup row → ORM kwargs: drop platform-managed fields, retarget cluster."""
    kwargs = {k: v for k, v in item.items()
              if k not in _DROP_KEYS and k not in _NESTED_KEYS}
    kwargs["cluster_id"] = cluster_id
    return kwargs


def _ssl_kwargs(item: dict, cluster_id: int) -> dict:
    """SSL 证书行：cert/private_key 列为 NOT NULL，内容缺失时以空串占位，
    行本身照常导入并进入需补齐清单（design D6 降级策略）。"""
    kwargs = _entity_kwargs(item, cluster_id)
    # SSL 证书列名 → ORM 属性名差异（ps_ssl_certificate."key"）
    if "key" in kwargs:
        kwargs["private_key"] = kwargs.pop("key")
    if kwargs.get("cert") is None:
        kwargs["cert"] = ""
    if kwargs.get("private_key") is None:
        kwargs["private_key"] = ""
    return kwargs


def _write_static_file(edge_uuid: str | None, version, content_b64: str) -> str:
    import base64
    from pathlib import Path

    ver = version if isinstance(version, int) and version > 0 else 1
    target_dir = Path(_BASE_STORAGE_DIR) / (edge_uuid or "imported")
    target_dir.mkdir(parents=True, exist_ok=True)
    path = target_dir / f"{ver}.zip"
    path.write_bytes(base64.b64decode(content_b64))
    return str(path)


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
    try:
        data = doc["data"]
        warnings: list[str] = []
        pending_items: list[dict] = []

        # 与创建集群相同的命名规则（schemas/cluster.py）
        from app.schemas.cluster import NAME_ERROR_MSG, NAME_PATTERN

        if not NAME_PATTERN.match(target_cluster_name or ""):
            raise ValueError(NAME_ERROR_MSG)

        dup = await db.execute(
            select(Cluster).where(Cluster.name == target_cluster_name))
        if dup.scalar_one_or_none():
            raise ValueError(f"目标集群名已存在：{target_cluster_name}")

        src = data["cluster"]
        cluster = Cluster(
            name=target_cluster_name,
            display_name=src.get("display_name"),
            description=src.get("description"),
            group_name=src.get("group_name"),
            admin_url=src.get("admin_url"),
            status=1,
            creator_id=creator_id,
        )
        db.add(cluster)
        await db.flush()
        cid = cluster.id

        # 节点：旧id → 新id；运行态重置为离线（D3 步骤6）
        node_map: dict[int, int] = {}
        for item in data["nodes"]:
            row = Node(**_entity_kwargs(item, cid))
            row.status = 0
            db.add(row)
            await db.flush()
            node_map[item["id"]] = row.id

        # SSL 证书：先 CA 后服务器，ca_cert_id 按旧id映射
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
        upstream_map: dict[int, int] = {}
        for item in data["upstreams"]:
            row = Upstream(**_entity_kwargs(item, cid))
            db.add(row)
            await db.flush()
            upstream_map[item["id"]] = row.id
            for t in item.get("targets") or []:
                tkw = {k: v for k, v in t.items()
                       if k not in ("id", "upstream_id", "created_at")}
                tkw["upstream_id"] = row.id
                db.add(UpstreamTarget(**tkw))

        # 插件组（edge_uuid 原值保留）
        pc_edge_uuids = {p.get("edge_uuid") for p in data["plugin_configs"]}
        for item in data["plugin_configs"]:
            db.add(PluginConfig(**_entity_kwargs(item, cid)))
        await db.flush()

        # 路由 + 路由插件
        route_map: dict[int, int] = {}
        for item in data["routes"]:
            kwargs = _entity_kwargs(item, cid)
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

        for item in data["global_rules"]:
            db.add(GlobalRule(**_entity_kwargs(item, cid)))
        for item in data["plugin_metadatas"]:
            db.add(PluginMetadata(**_entity_kwargs(item, cid)))

        # 四层代理：ref_node_id 重映射
        for item in data["stream_proxies"]:
            kwargs = _entity_kwargs(item, cid)
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

        # 静态资源：route_id 映射；有内容则落盘，无内容进需补齐清单
        for item in data["static_resources"]:
            kwargs = _entity_kwargs(item, cid)
            old_rt = item.get("route_id")
            kwargs["route_id"] = route_map.get(old_rt) if old_rt else None
            content = item.get("content_base64")
            if content:
                kwargs["storage_path"] = _write_static_file(
                    item.get("edge_uuid"), item.get("current_version"), content)
            else:
                kwargs["storage_path"] = None
                pending_items.append({
                    "name": item.get("name"), "type": "static_resource",
                    "reason": "静态资源缺少文件内容，需重新上传 ZIP 文件"})
            db.add(StaticResource(**kwargs))

        await db.commit()
        return {
            "cluster_id": cid,
            "warnings": warnings,
            "pending_items": pending_items,
        }
    except Exception:
        await db.rollback()
        raise
