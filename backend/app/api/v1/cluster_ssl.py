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
    from app.services.cert_generator import (
        LocalProvider, CommandResult, log_cert_commands,
    )
    from app.schemas.ssl import CommandLogEntry
    from app.models.cluster import Cluster

    detect_logs: list[CommandResult] = []
    provider = LocalProvider(detect_logs=detect_logs)
    if not provider.openssl_path:
        raise HTTPException(
            status_code=400,
            detail="本地无可用 openssl，请使用远程生成方式",
        )

    try:
        cert_result, gen_logs = provider.generate_certificate(
            algorithm=req.algorithm,
            common_name=req.common_name,
            dns_sans=req.dns_sans or [],
            ip_sans=req.ip_sans or [],
            validity_days=req.validity_days,
            dual_cert=req.dual_cert,
        )
    except RuntimeError as e:
        raise HTTPException(status_code=500, detail=str(e))

    step_names = ["检测 openssl 环境"]
    alg = req.algorithm
    if alg == "sm2":
        if req.dual_cert:
            step_names = ["检测 openssl 环境", "生成加密密钥对", "生成加密 CSR", "签发加密证书", "生成签名密钥对", "生成签名 CSR", "签发签名证书"]
        else:
            step_names = ["检测 openssl 环境", "生成密钥对", "生成 CSR", "签发证书"]
    elif alg == "rsa":
        step_names = ["检测 openssl 环境", "生成 RSA 密钥对", "生成 CSR", "签发证书"]
    elif alg == "ecc":
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

    is_gm = req.algorithm == "sm2"
    sni_str = ",".join(req.dns_sans or [])
    cert = SslCertificate(
        cluster_id=cluster_id,
        name=req.name,
        sni=sni_str or req.common_name,
        cert=cert_result.get("cert", ""),
        private_key=cert_result.get("key", ""),
        cert_type=req.cert_type,
        gm=is_gm,
        algorithm=req.algorithm,
        sign_cert=cert_result.get("sign_cert") if is_gm else None,
        sign_key=cert_result.get("sign_key") if is_gm else None,
        create_method="local_generate",
        generate_log=json.dumps(
            [log.model_dump() for log in generate_log],
            ensure_ascii=False,
        ),
    )
    db.add(cert)
    await db.commit()
    await db.refresh(cert)

    resp = SslCertificateResponse.model_validate(cert)
    return resp


async def _generate_remote(
    db: AsyncSession,
    cluster_id: int,
    req: SslCertificateGenerateRequest,
):
    """Generate certificate using remote node's openssl (via SSH)."""
    from app.models.cluster import Node
    from app.schemas.ssl import CommandLogEntry

    node = await db.get(Node, req.node_id)
    if not node or node.cluster_id != cluster_id:
        raise HTTPException(status_code=400, detail="指定节点不属于该集群")

    from app.services.ansible_service import (
        get_ssh_user, get_ssh_password, _run_ssh_with_fallback,
    )

    ssh_user = get_ssh_user(node.ip)
    ssh_password = get_ssh_password(node.ip)
    remote_openssl = f"{node.edge_install_path}/bin/openssl" if node.edge_install_path else "openssl"

    all_logs: list[CommandLogEntry] = []

    check_cmd = f"{remote_openssl} version 2>&1 || true"
    rc, stdout, stderr = await _run_ssh_with_fallback(
        node.ip, ssh_user, check_cmd, password=ssh_password,
    )
    all_logs.append(CommandLogEntry(
        step="检测远程 openssl",
        command=check_cmd,
        exit_code=rc,
        stderr=stderr,
    ))
    if not stdout or "openssl" not in stdout.lower():
        raise HTTPException(
            status_code=400,
            detail=f"节点 {node.ip} 的 openssl 不可用",
        )

    flavor = "tongsuo" if "tongsuo" in stdout.lower() or "babassl" in stdout.lower() else "standard"

    if req.algorithm == "sm2":
        sm2_check = f"{remote_openssl} ecparam -list_curves 2>&1 | grep SM2 || true"
        rc, sm2_stdout, _ = await _run_ssh_with_fallback(
            node.ip, ssh_user, sm2_check, password=ssh_password,
        )
        all_logs.append(CommandLogEntry(
            step="检测 SM2 曲线支持",
            command=sm2_check,
            exit_code=rc,
        ))
        if "SM2" not in sm2_stdout:
            raise HTTPException(
                status_code=400,
                detail=f"节点 {node.ip} 的 openssl 不支持 SM2 曲线",
            )

    try:
        if req.algorithm == "sm2" and req.dual_cert:
            result, remote_logs = await _remote_generate_dual(
                node.ip, ssh_user, ssh_password, remote_openssl,
                req.common_name, req.dns_sans or [], req.ip_sans or [],
                req.validity_days, flavor,
            )
        else:
            result, remote_logs = await _remote_generate_single(
                node.ip, ssh_user, ssh_password, remote_openssl,
                req.common_name, req.dns_sans or [], req.ip_sans or [],
                req.validity_days, flavor,
                algorithm=req.algorithm,
            )
        _REMOTE_STEP_NAMES = {
            "genkey": "生成密钥对 / genkey",
            "csr": "生成 CSR / csr",
            "sign": "签发证书 / sign",
            "enc_genkey": "生成加密密钥对 / enc_genkey",
            "enc_csr": "生成加密 CSR / enc_csr",
            "enc_sign": "签发加密证书 / enc_sign",
            "sign_genkey": "生成签名密钥对 / sign_genkey",
            "sign_csr": "生成签名 CSR / sign_csr",
            "sign_sign": "签发签名证书 / sign_sign",
        }
        for rl in remote_logs:
            raw_step = rl["step"]
            display_step = _REMOTE_STEP_NAMES.get(raw_step, raw_step)
            all_logs.append(CommandLogEntry(
                step=display_step,
                command=rl["command"],
                exit_code=rl["exit_code"],
            ))
    except RuntimeError as e:
        raise HTTPException(status_code=500, detail=str(e))

    is_gm = req.algorithm == "sm2"
    sni_str = ",".join(req.dns_sans or [])
    cert = SslCertificate(
        cluster_id=cluster_id,
        name=req.name,
        sni=sni_str or req.common_name,
        cert=result.get("cert", ""),
        private_key=result.get("key", ""),
        cert_type=req.cert_type,
        gm=is_gm,
        algorithm=req.algorithm,
        sign_cert=result.get("sign_cert") if is_gm else None,
        sign_key=result.get("sign_key") if is_gm else None,
        create_method="remote_generate",
        generate_log=json.dumps(
            [log.model_dump() for log in all_logs],
            ensure_ascii=False,
        ),
    )
    cluster_obj = await db.get(Cluster, cluster_id)
    cluster_name = cluster_obj.display_name or cluster_obj.name or str(cluster_id) if cluster_obj else str(cluster_id)
    from app.services.cert_generator import CommandResult as RemoteCommandResult, log_cert_commands as remote_log_cert
    local_logs = [
        RemoteCommandResult(command=le.command, returncode=le.exit_code, stdout=le.stdout or "", stderr=le.stderr or "")
        for le in all_logs
    ]
    remote_log_cert(cluster_id, cluster_name, req.name, local_logs)
    db.add(cert)
    await db.commit()
    await db.refresh(cert)
    resp = SslCertificateResponse.model_validate(cert)
    return resp


import re

_STEP_PATTERN = re.compile(r'===PASHI_STEP:(\w+)===')
_EXIT_PATTERN = re.compile(r'===PASHI_EXIT:(\d+)===')


def _parse_remote_markers(stdout: str) -> list[dict]:
    """Parse SSH stdout with ===PASHI_STEP/EXIT markers into step logs.

    Returns list of dicts with keys: step, command, exit_code.
    The command text is extracted between STEP and EXIT markers.
    EXIT marker flushes the current step with its exit code.
    """
    steps: list[dict] = []
    lines = stdout.splitlines()
    current_step: str | None = None
    command_lines: list[str] = []

    def flush_step(exit_code: int = 0):
        nonlocal current_step, command_lines
        if current_step is not None:
            steps.append({
                "step": current_step,
                "command": "\n".join(command_lines).strip(),
                "exit_code": exit_code,
            })
            current_step = None
            command_lines = []

    for line in lines:
        step_match = _STEP_PATTERN.search(line)
        if step_match:
            flush_step()
            current_step = step_match.group(1)
            command_lines = []
            continue

        exit_match = _EXIT_PATTERN.search(line)
        if exit_match:
            flush_step(exit_code=int(exit_match.group(1)))
            continue

        if current_step is not None:
            command_lines.append(line)

    flush_step()
    return steps


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
    algorithm: str = "sm2",
) -> tuple[dict, list[dict]]:
    """Generate a single certificate remotely via SSH. Returns (cert_dict, step_logs)."""
    san_opt = _san_arg(dns_sans, ip_sans)
    tmpdir = f"/tmp/panshi_gen_{os.urandom(4).hex()}"
    cn_quoted = shlex.quote(common_name)
    subj = shlex.quote(f"/CN={common_name}")
    sigopt = _sigopt_flag(flavor) if algorithm == "sm2" else ""

    if algorithm == "sm2":
        script = f"""set -e
mkdir -p {tmpdir}
cd {tmpdir}
set +e
echo "===PASHI_STEP:genkey==="
echo "+ {openssl} ecparam -genkey -name SM2 -out key.pem"
{openssl} ecparam -genkey -name SM2 -out key.pem
echo "===PASHI_EXIT:$?==="
cat > openssl.cnf << 'CNF'
[ req ]
distinguished_name = req_distinguished_name
string_mask = utf8only
default_md = sm3
prompt = no
[ req_distinguished_name ]
commonName = {cn_quoted}
CNF
echo "===PASHI_STEP:csr==="
echo "+ {openssl} req -new -key key.pem -out request.csr -sm3 -subj {subj} -config openssl.cnf -nodes {sigopt} {san_opt}"
{openssl} req -new -key key.pem -out request.csr -sm3 -subj {subj} -config openssl.cnf -nodes {sigopt} {san_opt}
echo "===PASHI_EXIT:$?==="
echo "===PASHI_STEP:sign==="
echo "+ {openssl} x509 -req -in request.csr -signkey key.pem -out cert.crt -sm3 -days {validity_days} {sigopt}"
{openssl} x509 -req -in request.csr -signkey key.pem -out cert.crt -sm3 -days {validity_days} {sigopt}
echo "===PASHI_EXIT:$?==="
echo "===PASHI_RESULT==="
cat cert.crt
echo "---KEY---"
cat key.pem
set -e
rm -rf {tmpdir}
"""
    elif algorithm == "rsa":
        script = f"""set -e
mkdir -p {tmpdir}
cd {tmpdir}
cat > openssl.cnf << 'CNF'
[ req ]
distinguished_name = req_distinguished_name
string_mask = utf8only
default_md = sha256
prompt = no
[ req_distinguished_name ]
commonName = {cn_quoted}
CNF
set +e
echo "===PASHI_STEP:genkey==="
echo "+ {openssl} genrsa -out key.pem 2048"
{openssl} genrsa -out key.pem 2048
echo "===PASHI_EXIT:$?==="
echo "===PASHI_STEP:sign==="
echo "+ {openssl} req -new -x509 -key key.pem -out cert.crt -days {validity_days} -subj {subj} -sha256 -config openssl.cnf {san_opt}"
{openssl} req -new -x509 -key key.pem -out cert.crt -days {validity_days} -subj {subj} -sha256 -config openssl.cnf {san_opt}
echo "===PASHI_EXIT:$?==="
echo "===PASHI_RESULT==="
cat cert.crt
echo "---KEY---"
cat key.pem
set -e
rm -rf {tmpdir}
"""
    else:
        script = f"""set -e
mkdir -p {tmpdir}
cd {tmpdir}
cat > openssl.cnf << 'CNF'
[ req ]
distinguished_name = req_distinguished_name
string_mask = utf8only
default_md = sha256
prompt = no
[ req_distinguished_name ]
commonName = {cn_quoted}
CNF
set +e
echo "===PASHI_STEP:genkey==="
echo "+ {openssl} ecparam -genkey -name prime256v1 -out key.pem"
{openssl} ecparam -genkey -name prime256v1 -out key.pem
echo "===PASHI_EXIT:$?==="
echo "===PASHI_STEP:sign==="
echo "+ {openssl} req -new -x509 -key key.pem -out cert.crt -days {validity_days} -subj {subj} -sha256 -config openssl.cnf {san_opt}"
{openssl} req -new -x509 -key key.pem -out cert.crt -days {validity_days} -subj {subj} -sha256 -config openssl.cnf {san_opt}
echo "===PASHI_EXIT:$?==="
echo "===PASHI_RESULT==="
cat cert.crt
echo "---KEY---"
cat key.pem
set -e
rm -rf {tmpdir}
"""
    from app.services.ansible_service import _run_ssh_with_fallback
    rc, stdout, stderr = await _run_ssh_with_fallback(
        ip, ssh_user, script, password=ssh_password,
    )
    if rc != 0:
        raise RuntimeError(f"Remote cert generation failed: {stderr.strip()[:500]}")

    step_logs = _parse_remote_markers(stdout)
    parts = stdout.split("---KEY---")
    cert_pem = parts[0].strip()
    key_pem = parts[1].strip() if len(parts) > 1 else ""
    return {"cert": cert_pem, "key": key_pem}, step_logs


async def _remote_generate_dual(
    ip: str, ssh_user: str, ssh_password: str | None,
    openssl: str, common_name: str,
    dns_sans: list[str], ip_sans: list[str],
    validity_days: int, flavor: str,
) -> tuple[dict, list[dict]]:
    """Generate dual SM2 certificates (enc + sign) remotely via SSH. Returns (cert_dict, step_logs)."""
    sigopt = _sigopt_flag(flavor)
    san_opt = _san_arg(dns_sans, ip_sans)
    tmpdir = f"/tmp/panshi_gen_{os.urandom(4).hex()}"
    cn_quoted = shlex.quote(common_name)
    subj = shlex.quote(f"/CN={common_name}")

    enc_genkey_cmd = f"{openssl} ecparam -genkey -name SM2 -out enc.key"
    enc_csr_cmd = f"{openssl} req -new -key enc.key -out enc.csr -sm3 -subj {subj} -config openssl.cnf -nodes {sigopt} {san_opt}"
    enc_sign_cmd = f"{openssl} x509 -req -in enc.csr -signkey enc.key -out enc.crt -sm3 -days {validity_days} {sigopt}"
    sign_genkey_cmd = f"{openssl} ecparam -genkey -name SM2 -out sign.key"
    sign_csr_cmd = f"{openssl} req -new -key sign.key -out sign.csr -sm3 -subj {subj} -config openssl.cnf -nodes {sigopt} {san_opt}"
    sign_sign_cmd = f"{openssl} x509 -req -in sign.csr -signkey sign.key -out sign.crt -sm3 -days {validity_days} {sigopt}"

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
set +e
echo "===PASHI_STEP:enc_genkey==="
echo "+ {enc_genkey_cmd}"
{enc_genkey_cmd}
echo "===PASHI_EXIT:$?==="
echo "===PASHI_STEP:enc_csr==="
echo "+ {enc_csr_cmd}"
{enc_csr_cmd}
echo "===PASHI_EXIT:$?==="
echo "===PASHI_STEP:enc_sign==="
echo "+ {enc_sign_cmd}"
{enc_sign_cmd}
echo "===PASHI_EXIT:$?==="
echo "===PASHI_STEP:sign_genkey==="
echo "+ {sign_genkey_cmd}"
{sign_genkey_cmd}
echo "===PASHI_EXIT:$?==="
echo "===PASHI_STEP:sign_csr==="
echo "+ {sign_csr_cmd}"
{sign_csr_cmd}
echo "===PASHI_EXIT:$?==="
echo "===PASHI_STEP:sign_sign==="
echo "+ {sign_sign_cmd}"
{sign_sign_cmd}
echo "===PASHI_EXIT:$?==="
echo "===PASHI_RESULT==="
cat enc.crt
echo "---ENC_KEY---"
cat enc.key
echo "---SIGN_CERT---"
cat sign.crt
echo "---SIGN_KEY---"
cat sign.key
set -e
rm -rf {tmpdir}
"""
    from app.services.ansible_service import _run_ssh_with_fallback
    rc, stdout, stderr = await _run_ssh_with_fallback(
        ip, ssh_user, script, password=ssh_password,
    )
    if rc != 0:
        raise RuntimeError(f"Remote dual cert generation failed: {stderr.strip()[:500]}")

    step_logs = _parse_remote_markers(stdout)

    parts = stdout.split("---SIGN_KEY---")
    rest = parts[0]
    sign_key = parts[1].strip() if len(parts) > 1 else ""

    parts2 = rest.split("---SIGN_CERT---")
    rest2 = parts2[0]
    sign_cert = parts2[1].strip() if len(parts2) > 1 else ""

    parts3 = rest2.split("---ENC_KEY---")
    enc_cert = parts3[0].strip()
    enc_key = parts3[1].strip() if len(parts3) > 1 else ""

    return {"cert": enc_cert, "key": enc_key, "sign_cert": sign_cert, "sign_key": sign_key}, step_logs
