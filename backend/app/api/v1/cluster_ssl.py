"""SSL certificate management API endpoints."""

import json
import uuid
from typing import Optional
from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func

from app.core.database import get_db
from app.models.ssl import SslCertificate
from app.schemas.ssl import (
    SslCertificateCreate, SslCertificateUpdate, SslCertificateResponse,
    SslCertificateGenerateRequest, SslCertificateGenerateResponse,
    CaCertificateGenerateRequest, CommandLogEntry,
)
from app.models.cluster import Cluster, ConfigVersion, Node
from app.schemas.cluster import PublishRequest, DeleteClusterRequest
from app.services import edge_sync
from app.services.edge_client import EdgeClient
from app.services.edge_logger import get_edge_logger

router = APIRouter(prefix="/clusters/{cluster_id}/ssl", tags=["ssl"])
global_router = APIRouter(prefix="/ssl", tags=["ssl"])


@router.post("/ca", status_code=status.HTTP_201_CREATED)
async def create_ca_certificate(
    cluster_id: int,
    data: CaCertificateGenerateRequest,
    db: AsyncSession = Depends(get_db),
):
    """Generate an SM2 CA root certificate for a cluster."""
    cluster = await db.get(Cluster, cluster_id)
    if not cluster:
        raise HTTPException(status_code=404, detail="集群不存在")

    from app.services.cert_generator import (
        generate_ca_certificate, detect_openssl, CommandResult,
        log_cert_commands,
    )

    detect_logs: list[CommandResult] = []
    openssl_info = detect_openssl(detect_logs=detect_logs)
    if not openssl_info["path"]:
        from app.services.cert_generator import BUNDLED_OPENSSL_FIX
        raise HTTPException(
            status_code=400,
            detail=f"本地无可用 openssl（仅使用捆绑的 Tongsuo，不回退到系统 openssl）\n{BUNDLED_OPENSSL_FIX}",
        )
    if not openssl_info["sm2_supported"]:
        raise HTTPException(status_code=400, detail="本地 openssl 不支持 SM2 曲线")

    cn = data.common_name or data.name
    org = data.organization or "EMBRACE"
    ou = data.organizational_unit or "EDGE"
    try:
        result, gen_logs = generate_ca_certificate(
            openssl_path=openssl_info["path"],
            common_name=cn,
            validity_days=data.validity_days,
            flavor=openssl_info["flavor"],
            org=org,
            ou=ou,
        )
    except RuntimeError as e:
        raise HTTPException(status_code=500, detail=str(e))

    all_steps = detect_logs + gen_logs
    generate_log = [
        CommandLogEntry(
            step="检测 openssl 环境" if i < len(detect_logs) else "生成 CA 根证书",
            command=r.command,
            exit_code=r.returncode,
            stdout=r.stdout[:500] if r.stdout else "",
            stderr=r.stderr,
        )
        for i, r in enumerate(all_steps)
    ]

    cluster_obj = await db.get(Cluster, cluster_id)
    cluster_name = cluster_obj.display_name or cluster_obj.name or str(cluster_id) if cluster_obj else str(cluster_id)
    log_cert_commands(cluster_id, cluster_name, data.name, all_steps)

    cert = SslCertificate(
        cluster_id=cluster_id,
        name=data.name,
        sni=cn,
        cert=result["ca_cert"],
        private_key=result["ca_key"],
        cert_type="server",
        gm=True,
        algorithm="sm2",
        is_ca=True,
        organization=org,
        organizational_unit=ou,
        create_method="local_generate",
        generate_log=json.dumps(
            [log.model_dump() for log in generate_log],
            ensure_ascii=False,
        ),
    )
    db.add(cert)
    await db.commit()
    await db.refresh(cert)
    return SslCertificateResponse.model_validate(cert)


@global_router.get("/{cert_id}/ca-key")
async def download_ca_private_key(
    cert_id: int,
    db: AsyncSession = Depends(get_db),
):
    """Download CA private key (confirmation required from frontend)."""
    cert = await db.get(SslCertificate, cert_id)
    if not cert or not cert.is_ca:
        raise HTTPException(status_code=404, detail="CA 证书不存在")
    if not cert.private_key:
        raise HTTPException(status_code=400, detail="CA 私钥不可用")
    return {"private_key": cert.private_key}


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
    # 取消国密时清空签名证书数据
    if "gm" in update_data and not update_data["gm"]:
        cert.sign_cert = None
        cert.sign_key = None
        cert.client_ca = None
        cert.client_depth = None
        cert.skip_mtls_uri_regex = None
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

    if cert.is_ca:
        dependent = await db.execute(
            select(SslCertificate).where(
                SslCertificate.ca_cert_id == cert_id,
                SslCertificate.id != cert_id,
            ).limit(1)
        )
        if dependent.scalar_one_or_none():
            raise HTTPException(
                status_code=400,
                detail="该 CA 下存在签发的证书，请先删除关联的证书后再删除 CA",
            )

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

    if cert.cert_type == "client":
        raise HTTPException(status_code=400, detail="客户端证书不需要发布到 Edge 节点")
    if cert.is_ca:
        raise HTTPException(status_code=400, detail="CA 证书不需要发布到 Edge 节点")

    # DB stores SNI as comma-separated string (e.g., "qcg.com,abc.com").
    # Edge API expects a single domain in "sni" or an array in "snis".
    sni_list = [s.strip() for s in cert.sni.split(",") if s.strip()] if cert.sni else []
    config_data: dict = {
        "name": cert.name,
        "cert": cert.cert, "key": cert.private_key,
        "type": cert.cert_type,
    }
    if len(sni_list) == 1:
        config_data["sni"] = sni_list[0]
    elif len(sni_list) > 1:
        config_data["snis"] = sni_list
    if cert.ssl_protocols:
        try:
            config_data["ssl_protocols"] = json.loads(cert.ssl_protocols)
        except (json.JSONDecodeError, TypeError):
            pass
    if cert.gm:
        config_data["certs"] = [cert.sign_cert] if cert.sign_cert else []
        config_data["keys"] = [cert.sign_key] if cert.sign_key else []
        config_data["gm"] = True

        if cert.ca_cert_id:
            ca_record = await db.get(SslCertificate, cert.ca_cert_id)
            if ca_record:
                from app.services.cert_generator import get_cert_expiry, detect_openssl
                try:
                    openssl_info = detect_openssl()
                    if openssl_info["path"] and ca_record.cert:
                        if get_cert_expiry(openssl_info["path"], ca_record.cert) < date.today():
                            raise HTTPException(status_code=400, detail="签发该证书的 CA 已过期，无法发布")
                except Exception:
                    pass
                sign_pem = (cert.sign_cert or "").strip()
                ca_pem = (ca_record.cert or "").strip()
                if sign_pem and ca_pem:
                    config_data["cert_chain"] = sign_pem + "\n" + ca_pem

        # mTLS: add client object when client_ca is set
        if cert.gm and cert.client_ca:
            client = {"ca": cert.client_ca}
            if cert.client_depth is not None:
                client["depth"] = cert.client_depth
            if cert.skip_mtls_uri_regex:
                client["skip_mtls_uri_regex"] = cert.skip_mtls_uri_regex
            config_data["client"] = client

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


@router.post("/generate")
async def generate_ssl_certificate(
    cluster_id: int,
    req: SslCertificateGenerateRequest,
    db: AsyncSession = Depends(get_db),
):
    """Generate an SSL certificate (SM2 via CA, or RSA/ECC self-signed)."""
    cluster = await db.get(Cluster, cluster_id)
    if not cluster:
        raise HTTPException(status_code=404, detail="集群不存在")

    return await _generate_local(db, cluster_id, req)


async def _generate_local(
    db: AsyncSession,
    cluster_id: int,
    req: SslCertificateGenerateRequest,
):
    """Generate certificate using local openssl."""
    from app.services.cert_generator import (
        LocalProvider, CommandResult, generate_dual_certificates,
        generate_ca_certificate, log_cert_commands,
    )
    from app.models.cluster import Cluster

    detect_logs: list[CommandResult] = []
    provider = LocalProvider(detect_logs=detect_logs)
    if not provider.openssl_path:
        from app.services.cert_generator import BUNDLED_OPENSSL_FIX
        raise HTTPException(
            status_code=400,
            detail=f"本地无可用 openssl（仅使用捆绑的 Tongsuo，不回退到系统 openssl）\n{BUNDLED_OPENSSL_FIX}",
        )

    ca_cert_pem = None
    ca_key_pem = None
    is_sm2 = req.algorithm == "sm2"

    if is_sm2:
        # SM2 requires CA
        if req.ca_cert_id is None:
            # Check if cluster has any CA at all for better error message
            ca_exists = await db.execute(
                select(SslCertificate).where(
                    SslCertificate.cluster_id == cluster_id,
                    SslCertificate.is_ca == True,
                ).limit(1)
            )
            if ca_exists.scalar_one_or_none():
                raise HTTPException(
                    status_code=400,
                    detail="SM2 证书生成必须指定 CA 根证书 (ca_cert_id)",
                )
            else:
                raise HTTPException(
                    status_code=400,
                    detail="该集群没有 CA 根证书，请先创建 CA (POST /clusters/{id}/ssl/ca)",
                )

        ca_record = await db.get(SslCertificate, req.ca_cert_id)
        if not ca_record or not ca_record.is_ca:
            raise HTTPException(status_code=400, detail="指定的 CA 证书无效")
        if ca_record.cluster_id != cluster_id:
            raise HTTPException(status_code=400, detail="CA 证书不属于该集群")

        ca_cert_pem = ca_record.cert
        ca_key_pem = ca_record.private_key

    org = req.organization or "EMBRACE"
    ou = req.organizational_unit or "EDGE"
    try:
        if is_sm2:
            cert_result, gen_logs = generate_dual_certificates(
                openssl_path=provider.openssl_path,
                common_name=req.common_name,
                dns_sans=req.dns_sans or [],
                ip_sans=req.ip_sans or [],
                validity_days=req.validity_days,
                flavor=provider.flavor,
                ca_cert_pem=ca_cert_pem,
                ca_key_pem=ca_key_pem,
                org=org, ou=ou,
            )
        else:
            cert_result, gen_logs = provider.generate_certificate(
                algorithm=req.algorithm,
                common_name=req.common_name,
                dns_sans=req.dns_sans or [],
                ip_sans=req.ip_sans or [],
                validity_days=req.validity_days,
                dual_cert=req.dual_cert,
                org=org, ou=ou,
            )
    except RuntimeError as e:
        raise HTTPException(status_code=500, detail=str(e))

    step_names = ["检测 openssl 环境"]
    if is_sm2:
        step_names = [
            "检测 openssl 环境", "生成加密密钥对", "生成加密 CSR",
            "签发加密证书", "生成签名密钥对", "生成签名 CSR", "签发签名证书",
        ]
    elif req.algorithm == "rsa":
        step_names = ["检测 openssl 环境", "生成 RSA 密钥对", "生成 CSR", "签发证书"]
    elif req.algorithm == "ecc":
        step_names = ["检测 openssl 环境", "生成 ECC 密钥对", "生成 CSR", "签发证书"]

    all_steps = detect_logs + gen_logs
    generate_log = [
        CommandLogEntry(
            step=step_names[min(i, len(step_names) - 1)],
            command=r.command,
            exit_code=r.returncode,
            stdout=r.stdout[:500] if r.stdout else "",
            stderr=r.stderr,
        )
        for i, r in enumerate(all_steps)
    ]

    cluster = await db.get(Cluster, cluster_id)
    cluster_name = cluster.display_name or cluster.name or str(cluster_id) if cluster else str(cluster_id)
    log_cert_commands(cluster_id, cluster_name, req.name, all_steps)

    sni_str = ",".join(req.dns_sans or [])
    server_cert = SslCertificate(
        cluster_id=cluster_id,
        name=req.name,
        sni=sni_str,
        cert=cert_result.get("cert", ""),
        private_key=cert_result.get("key", ""),
        cert_type=req.cert_type,
        gm=is_sm2,
        algorithm=req.algorithm,
        sign_cert=cert_result.get("sign_cert") if is_sm2 else None,
        sign_key=cert_result.get("sign_key") if is_sm2 else None,
        ca_cert_id=req.ca_cert_id if is_sm2 else None,
        organization=org,
        organizational_unit=ou,
        client_ca=req.client_ca,
        client_depth=req.client_depth,
        skip_mtls_uri_regex=req.skip_mtls_uri_regex,
        create_method="local_generate",
        generate_log=json.dumps(
            [log.model_dump() for log in generate_log],
            ensure_ascii=False,
        ),
    )
    db.add(server_cert)
    await db.flush()

    client_cert_record = None
    if is_sm2 and req.generate_client_certs:
        cn_client = f"{req.common_name}-client"
        client_result, client_logs = _generate_client_dual_certs(
            provider, cn_client, req.dns_sans, req.ip_sans,
            req.validity_days, ca_cert_pem, ca_key_pem,
            org=org, ou=ou,
        )
        client_cert_record = SslCertificate(
            cluster_id=cluster_id,
            name=f"{req.name}-client",
            sni=sni_str or cn_client,
            cert=client_result["cert"],
            private_key=client_result["key"],
            cert_type="client",
            gm=True,
            algorithm="sm2",
            sign_cert=client_result["sign_cert"],
            sign_key=client_result["sign_key"],
            ca_cert_id=req.ca_cert_id,
            organization=org,
            organizational_unit=ou,
            create_method="local_generate",
        )
        db.add(client_cert_record)

    await db.commit()
    await db.refresh(server_cert)
    if client_cert_record:
        await db.refresh(client_cert_record)

    server_resp = SslCertificateResponse.model_validate(server_cert)
    client_resp = (
        SslCertificateResponse.model_validate(client_cert_record)
        if client_cert_record else None
    )
    return SslCertificateGenerateResponse(server=server_resp, client=client_resp)


def _generate_client_dual_certs(
    provider, common_name, dns_sans, ip_sans, validity_days,
    ca_cert_pem, ca_key_pem, org="EMBRACE", ou="EDGE",
) -> tuple[dict, list]:
    """Generate client dual certs (sign+enc) using the given CA."""
    from app.services.cert_generator import generate_dual_certificates
    result, logs = generate_dual_certificates(
        openssl_path=provider.openssl_path,
        common_name=common_name,
        dns_sans=dns_sans or [],
        ip_sans=ip_sans or [],
        validity_days=validity_days,
        flavor=provider.flavor,
        ca_cert_pem=ca_cert_pem,
        ca_key_pem=ca_key_pem,
        org=org, ou=ou,
    )
    return result, logs



