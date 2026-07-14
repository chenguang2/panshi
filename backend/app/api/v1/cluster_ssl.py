"""SSL certificate management API endpoints."""

import json
import uuid
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func

from app.core.database import get_db
from app.models.ssl import SslCertificate
from app.schemas.ssl import SslCertificateCreate, SslCertificateUpdate, SslCertificateResponse
from app.models.cluster import Cluster, ConfigVersion, Node
from app.schemas.cluster import PublishRequest, DeleteClusterRequest
from app.services import edge_sync
from app.services.edge_client import EdgeClient
from app.services.edge_logger import get_edge_logger

router = APIRouter(prefix="/clusters/{cluster_id}/ssl", tags=["ssl"])
global_router = APIRouter(prefix="/ssl", tags=["ssl"])


@global_router.get("")
async def list_all_ssl_certificates(
    db: AsyncSession = Depends(get_db),
    page_size: int = Query(500, ge=1, le=500),
    group_name: str = Query("__all__"),
    cluster_id: Optional[int] = Query(None),
    search: Optional[str] = Query(None),
):
    query = select(SslCertificate)

    if cluster_id is not None:
        query = query.where(SslCertificate.cluster_id == cluster_id)

    from app.models.cluster import Cluster
    if group_name == "__ung__":
        query = query.join(Cluster, SslCertificate.cluster_id == Cluster.id).where(
            Cluster.group_name.is_(None) | (Cluster.group_name == "")
        )
    elif group_name != "__all__":
        query = query.join(Cluster, SslCertificate.cluster_id == Cluster.id).where(
            Cluster.group_name == group_name
        )

    if search:
        pattern = f"%{search}%"
        query = query.where(SslCertificate.name.ilike(pattern))

    count_query = select(func.count()).select_from(query.subquery())
    total = (await db.execute(count_query)).scalar() or 0

    query = query.order_by(SslCertificate.id).limit(page_size)
    result = await db.execute(query)
    items = result.scalars().all()
    return {
        "total": total,
        "items": [SslCertificateResponse.model_validate(c).model_dump() for c in items],
    }


@router.get("")
async def list_ssl_certificates(
    cluster_id: int,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(SslCertificate)
        .where(SslCertificate.cluster_id == cluster_id)
        .order_by(SslCertificate.id)
    )
    items = result.scalars().all()
    return {
        "total": len(items),
        "items": [SslCertificateResponse.model_validate(c).model_dump() for c in items],
    }


@router.post("", response_model=SslCertificateResponse, status_code=status.HTTP_201_CREATED)
async def create_ssl_certificate(
    cluster_id: int,
    data: SslCertificateCreate,
    db: AsyncSession = Depends(get_db),
):
    cert_data = data.model_dump()
    cert_data["edge_uuid"] = str(uuid.uuid4())
    cert_data["cluster_id"] = cluster_id
    cert = SslCertificate(**cert_data)
    db.add(cert)
    await db.commit()
    await db.refresh(cert)
    return SslCertificateResponse.model_validate(cert)


@router.get("/{cert_id}", response_model=SslCertificateResponse)
async def get_ssl_certificate(
    cluster_id: int,
    cert_id: int,
    db: AsyncSession = Depends(get_db),
):
    cert = await edge_sync.get_or_404(db, SslCertificate, id=cert_id, cluster_id=cluster_id, detail="SSL 证书不存在")
    return SslCertificateResponse.model_validate(cert)


@router.put("/{cert_id}", response_model=SslCertificateResponse)
async def update_ssl_certificate(
    cluster_id: int,
    cert_id: int,
    data: SslCertificateUpdate,
    db: AsyncSession = Depends(get_db),
):
    cert = await edge_sync.get_or_404(db, SslCertificate, id=cert_id, cluster_id=cluster_id, detail="SSL 证书不存在")
    update_data = data.model_dump(exclude_unset=True)
    for k, v in update_data.items():
        setattr(cert, k, v)
    await db.commit()
    await db.refresh(cert)
    return SslCertificateResponse.model_validate(cert)


@router.delete("/{cert_id}")
async def delete_ssl_certificate(
    cluster_id: int,
    cert_id: int,
    body: Optional[DeleteClusterRequest] = None,
    db: AsyncSession = Depends(get_db),
):
    cert = await edge_sync.get_or_404(db, SslCertificate, id=cert_id, cluster_id=cluster_id, detail="SSL 证书不存在")
    results = []

    if body and body.delete_edge:
        active_nodes = await edge_sync.get_active_nodes(cluster_id, db, body.node_ids if body.node_ids else None)
        edge_results = await edge_sync.delete_on_nodes(
            cluster_id, active_nodes, cert.edge_uuid,
            lambda client, uuid: client.api("ssl", "delete", uuid),
        )
        results.extend(edge_results)

    if not body or body.delete_db:
        await db.delete(cert)
        await db.commit()
        results.append({"scope": "database", "status": "success", "message": "数据库记录已删除"})

    return {"message": "SSL 证书已删除", "results": results}


@router.post("/{cert_id}/publish")
async def publish_ssl_certificate(
    cluster_id: int,
    cert_id: int,
    req: Optional[PublishRequest] = None,
    db: AsyncSession = Depends(get_db),
):
    cert = await edge_sync.get_or_404(db, SslCertificate, id=cert_id, cluster_id=cluster_id, detail="SSL 证书不存在")

    config_data = {
        "name": cert.name, "sni": cert.sni,
        "cert": cert.cert, "key": cert.private_key,
        "type": cert.cert_type,
    }
    if cert.ssl_protocols:
        try:
            config_data["ssl_protocols"] = json.loads(cert.ssl_protocols)
        except (json.JSONDecodeError, TypeError):
            pass

    new_version = await edge_sync.create_config_version(db, "ssl", cert_id, cluster_id, config_data, cert)

    cluster = await db.get(Cluster, cluster_id)
    active_nodes = await edge_sync.get_active_nodes(cluster_id, db, req.node_ids if req else None)
    if not active_nodes:
        return {"status": "error", "message": "集群中没有活跃的 edge 节点", "version": new_version, "results": []}

    edge_logger = get_edge_logger()
    results, success_count, fail_count = await edge_sync.publish_to_nodes(
        cluster_id, active_nodes, config_data,
        publish_fn=lambda client: client.api("ssl", "update", cert.edge_uuid, config_data),
        log_fn=lambda node_result, response, error, encrypted: edge_logger.log_publish_result(
            resource_type="ssl",
            cluster_id=cluster_id,
            cluster_name=cluster.display_name or cluster.name or str(cluster_id) if cluster else str(cluster_id),
            resource_id=cert_id,
            resource_name=cert.name,
            method="PUT",
            path=f"/edge/admin/ssl/{cert.edge_uuid}",
            request_body=config_data,
            encrypted_body=encrypted,
            response_status=201,
            response_body=response,
            error=error,
        ),
    )

    return edge_sync.build_publish_response(results, success_count, fail_count, len(active_nodes), f"SSL 证书 {cert.name} ", new_version)


@router.post("/{cert_id}/rollback/{version}")
async def rollback_ssl_certificate(
    cluster_id: int,
    cert_id: int,
    version: int,
    db: AsyncSession = Depends(get_db),
):
    cert = await edge_sync.get_or_404(db, SslCertificate, id=cert_id, cluster_id=cluster_id, detail="SSL 证书不存在")

    config_version = await edge_sync.get_or_404(
        db, ConfigVersion,
        resource_type="ssl", resource_id=cert_id, version=version,
        detail="版本不存在",
    )

    config_data = json.loads(config_version.config)
    if "name" in config_data:
        cert.name = config_data["name"]
    if "sni" in config_data:
        cert.sni = config_data["sni"]
    if "cert" in config_data:
        cert.cert = config_data["cert"]
    if "key" in config_data:
        cert.private_key = config_data["key"]
    if "type" in config_data:
        cert.cert_type = config_data["type"]
    if "ssl_protocols" in config_data:
        cert.ssl_protocols = json.dumps(config_data["ssl_protocols"]) if isinstance(config_data["ssl_protocols"], list) else config_data["ssl_protocols"]
    cert.current_version = version
    await db.commit()

    return {"status": "ok", "message": f"SSL 证书已切换到版本 v{version}", "version": version}


@router.get("/{cert_id}/history")
async def get_ssl_certificate_history(
    cluster_id: int,
    cert_id: int,
    db: AsyncSession = Depends(get_db),
):
    from app.schemas.cluster import ConfigVersionResponse, ConfigVersionListResponse

    await edge_sync.get_or_404(db, SslCertificate, id=cert_id, cluster_id=cluster_id, detail="SSL 证书不存在")

    versions = (
        await db.execute(
            select(ConfigVersion)
            .where(ConfigVersion.resource_type == "ssl", ConfigVersion.resource_id == cert_id)
            .order_by(ConfigVersion.version.desc())
        )
    ).scalars().all()

    return ConfigVersionListResponse(
        total=len(versions),
        items=[ConfigVersionResponse.model_validate(v) for v in versions],
        current_version=(await db.get(SslCertificate, cert_id)).current_version,
    )


@router.delete("/{cert_id}/history/{history_id}")
async def delete_ssl_certificate_history(
    cluster_id: int,
    cert_id: int,
    history_id: int,
    db: AsyncSession = Depends(get_db),
):
    config_version = await edge_sync.get_or_404(
        db, ConfigVersion,
        id=history_id, resource_type="ssl", resource_id=cert_id,
        detail="版本不存在",
    )
    await db.delete(config_version)
    await db.commit()
    return {"status": "ok", "message": "历史版本已删除"}
