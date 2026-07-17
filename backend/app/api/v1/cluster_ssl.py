"""SSL certificate management API endpoints."""

import json
import os
import shlex
import uuid
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func

from app.core.database import get_db
from app.models.ssl import SslCertificate
from app.schemas.ssl import (
    SslCertificateCreate, SslCertificateUpdate, SslCertificateResponse,
    SslCertificateGenerateRequest,
)
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
    # 取消国密时清空签名证书数据
    if "gm" in update_data and not update_data["gm"]:
        cert.sign_cert = None
        cert.sign_key = None
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
    """Generate an SM2 certificate (local or remote)."""
    # Verify cluster exists
    cluster = await db.get(Cluster, cluster_id)
    if not cluster:
        raise HTTPException(status_code=404, detail="集群不存在")

    if req.mode == "local":
        return await _generate_local(db, cluster_id, req)
    else:
        return await _generate_remote(db, cluster_id, req)


async def _generate_local(
    db: AsyncSession,
    cluster_id: int,
    req: SslCertificateGenerateRequest,
):
    """Generate certificate using local openssl."""
    from app.services.cert_generator import LocalProvider

    provider = LocalProvider()
    if not provider.sm2_supported:
        raise HTTPException(
            status_code=400,
            detail="本地 openssl 不支持 SM2 曲线，请使用远程生成方式",
        )

    try:
        if req.dual_cert:
            result = provider.generate_dual_certificates(
                common_name=req.common_name,
                dns_sans=req.dns_sans or [],
                ip_sans=req.ip_sans or [],
                validity_days=req.validity_days,
            )
        else:
            from app.services.cert_generator import (
                generate_sm2_keypair, generate_csr, self_sign_certificate,
            )
            key_pem = generate_sm2_keypair(provider.openssl_path)
            csr_pem = generate_csr(
                provider.openssl_path, key_pem,
                req.common_name, req.dns_sans or [], req.ip_sans or [],
                provider.flavor,
            )
            cert_pem = self_sign_certificate(
                provider.openssl_path, csr_pem, key_pem,
                req.validity_days, provider.flavor,
            )
            result = {"cert": cert_pem, "key": key_pem}

    except RuntimeError as e:
        raise HTTPException(status_code=500, detail=str(e))

    # Save to database
    sni_str = ",".join(req.dns_sans or [])
    cert = SslCertificate(
        cluster_id=cluster_id,
        name=req.name,
        sni=sni_str or req.common_name,
        cert=result.get("cert", ""),
        private_key=result.get("key", ""),
        cert_type=req.cert_type,
        gm=True,
        sign_cert=result.get("sign_cert"),
        sign_key=result.get("sign_key"),
        create_method="local_generate",
    )
    db.add(cert)
    await db.commit()
    await db.refresh(cert)
    return SslCertificateResponse.model_validate(cert)


async def _generate_remote(
    db: AsyncSession,
    cluster_id: int,
    req: SslCertificateGenerateRequest,
):
    """Generate certificate using remote node's openssl (via SSH)."""
    from app.models.cluster import Node

    # Get node
    node = await db.get(Node, req.node_id)
    if not node or node.cluster_id != cluster_id:
        raise HTTPException(status_code=400, detail="指定节点不属于该集群")

    # Build remote openssl commands
    from app.services.ansible_service import (
        get_ssh_user, get_ssh_password, _run_ssh_with_fallback,
    )

    ssh_user = get_ssh_user(node.ip)
    ssh_password = get_ssh_password(node.ip)
    remote_openssl = f"{node.edge_install_path}/bin/openssl" if node.edge_install_path else "openssl"

    # First check SM2 support
    check_cmd = f"{remote_openssl} ecparam -list_curves 2>&1 | grep SM2 || true"
    rc, stdout, stderr = await _run_ssh_with_fallback(
        node.ip, ssh_user, check_cmd, password=ssh_password,
    )
    if "SM2" not in stdout:
        raise HTTPException(
            status_code=400,
            detail=f"节点 {node.ip} 的 openssl 不支持 SM2 曲线",
        )

    # Get openssl version for flavor detection
    ver_cmd = f"{remote_openssl} version"
    rc, ver_stdout, _ = await _run_ssh_with_fallback(
        node.ip, ssh_user, ver_cmd, password=ssh_password,
    )
    flavor = "tongsuo" if "tongsuo" in ver_stdout.lower() or "babassl" in ver_stdout.lower() else "standard"

    try:
        if req.dual_cert:
            result = await _remote_generate_dual(
                node.ip, ssh_user, ssh_password, remote_openssl,
                req.common_name, req.dns_sans or [], req.ip_sans or [],
                req.validity_days, flavor,
            )
        else:
            result = await _remote_generate_single(
                node.ip, ssh_user, ssh_password, remote_openssl,
                req.common_name, req.dns_sans or [], req.ip_sans or [],
                req.validity_days, flavor,
            )
    except RuntimeError as e:
        raise HTTPException(status_code=500, detail=str(e))

    # Save to database
    sni_str = ",".join(req.dns_sans or [])
    cert = SslCertificate(
        cluster_id=cluster_id,
        name=req.name,
        sni=sni_str or req.common_name,
        cert=result.get("cert", ""),
        private_key=result.get("key", ""),
        cert_type=req.cert_type,
        gm=True,
        sign_cert=result.get("sign_cert"),
        sign_key=result.get("sign_key"),
        create_method="remote_generate",
    )
    db.add(cert)
    await db.commit()
    await db.refresh(cert)
    return SslCertificateResponse.model_validate(cert)


def _sigopt_flag(flavor: str) -> str:
    """Return -sigopt flag for tongsuo, empty string otherwise."""
    if flavor == "tongsuo":
        return "-sigopt sm2_id:1234567812345678"
    return ""


def _san_arg(dns_sans: list[str], ip_sans: list[str]) -> str:
    """Build -addext argument for subjectAltName."""
    parts = []
    for d in dns_sans:
        parts.append(f"DNS:{d}")
    for ip in ip_sans:
        parts.append(f"IP:{ip}")
    if parts:
        return "-addext " + shlex.quote(f"subjectAltName={','.join(parts)}")
    return ""


async def _remote_generate_single(
    ip: str, ssh_user: str, ssh_password: str | None,
    openssl: str, common_name: str,
    dns_sans: list[str], ip_sans: list[str],
    validity_days: int, flavor: str,
) -> dict:
    """Generate a single SM2 certificate remotely via SSH."""
    sigopt = _sigopt_flag(flavor)
    san_opt = _san_arg(dns_sans, ip_sans)
    tmpdir = f"/tmp/panshi_gen_{os.urandom(4).hex()}"

    script = f"""set -e
mkdir -p {tmpdir}
cd {tmpdir}
{openssl} ecparam -genkey -name SM2 -out key.pem
cat > openssl.cnf << 'CNF'
[ req ]
distinguished_name = req_distinguished_name
string_mask = utf8only
default_md = sm3
prompt = no
[ req_distinguished_name ]
commonName = {shlex.quote(common_name)}
CNF
{openssl} req -new -key key.pem -out request.csr -sm3 -subj {shlex.quote(f"/CN={common_name}")} -config openssl.cnf -nodes {sigopt} {san_opt}
{openssl} x509 -req -in request.csr -signkey key.pem -out cert.crt -sm3 -days {validity_days} {sigopt}
cat cert.crt
echo "---KEY---"
cat key.pem
rm -rf {tmpdir}
"""
    from app.services.ansible_service import _run_ssh_with_fallback
    rc, stdout, stderr = await _run_ssh_with_fallback(
        ip, ssh_user, script, password=ssh_password,
    )
    if rc != 0:
        raise RuntimeError(f"Remote cert generation failed: {stderr.strip()[:500]}")

    parts = stdout.split("---KEY---")
    cert_pem = parts[0].strip()
    key_pem = parts[1].strip() if len(parts) > 1 else ""
    return {"cert": cert_pem, "key": key_pem}


async def _remote_generate_dual(
    ip: str, ssh_user: str, ssh_password: str | None,
    openssl: str, common_name: str,
    dns_sans: list[str], ip_sans: list[str],
    validity_days: int, flavor: str,
) -> dict:
    """Generate dual SM2 certificates (enc + sign) remotely via SSH."""
    sigopt = _sigopt_flag(flavor)
    san_opt = _san_arg(dns_sans, ip_sans)
    tmpdir = f"/tmp/panshi_gen_{os.urandom(4).hex()}"
    cn_quoted = shlex.quote(common_name)
    subj = shlex.quote(f"/CN={common_name}")

    script = f"""set -e
mkdir -p {tmpdir}
cd {tmpdir}
cat > openssl.cnf << 'CNF'
[ req ]
distinguished_name = req_distinguished_name
string_mask = utf8only
default_md = sm3
prompt = no
[ req_distinguished_name ]
commonName = {cn_quoted}
CNF
{openssl} ecparam -genkey -name SM2 -out enc.key
{openssl} req -new -key enc.key -out enc.csr -sm3 -subj {subj} -config openssl.cnf -nodes {sigopt} {san_opt}
{openssl} x509 -req -in enc.csr -signkey enc.key -out enc.crt -sm3 -days {validity_days} {sigopt}
{openssl} ecparam -genkey -name SM2 -out sign.key
{openssl} req -new -key sign.key -out sign.csr -sm3 -subj {subj} -config openssl.cnf -nodes {sigopt} {san_opt}
{openssl} x509 -req -in sign.csr -signkey sign.key -out sign.crt -sm3 -days {validity_days} {sigopt}
cat enc.crt
echo "---ENC_KEY---"
cat enc.key
echo "---SIGN_CERT---"
cat sign.crt
echo "---SIGN_KEY---"
cat sign.key
rm -rf {tmpdir}
"""
    from app.services.ansible_service import _run_ssh_with_fallback
    rc, stdout, stderr = await _run_ssh_with_fallback(
        ip, ssh_user, script, password=ssh_password,
    )
    if rc != 0:
        raise RuntimeError(f"Remote dual cert generation failed: {stderr.strip()[:500]}")

    parts = stdout.split("---SIGN_KEY---")
    rest = parts[0]
    sign_key = parts[1].strip() if len(parts) > 1 else ""

    parts2 = rest.split("---SIGN_CERT---")
    rest2 = parts2[0]
    sign_cert = parts2[1].strip() if len(parts2) > 1 else ""

    parts3 = rest2.split("---ENC_KEY---")
    enc_cert = parts3[0].strip()
    enc_key = parts3[1].strip() if len(parts3) > 1 else ""

    return {"cert": enc_cert, "key": enc_key, "sign_cert": sign_cert, "sign_key": sign_key}
