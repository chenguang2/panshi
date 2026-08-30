"""ClickHouse 连接配置管理 API（openspec: add-clickhouse-config-page）。

- 命名连接 CRUD + 激活切换，存储于 backend/clickhouse.yaml（与 clickhouse_client 共享路径/失效）。
- 密码一律 Fernet 密文落盘（password_enc，密钥与 db_config 同源）；API 永不回显；编辑留空=保留。
- 写操作成功后统一 clickhouse_client.invalidate()：指标查询免重启即时生效；并写审计。
- 权限：路由级登录 + clickhouse_config 资源权限（无 feature 开关，约定 #19 双端注册）。
"""

import asyncio
import secrets
from typing import Optional

import yaml
from clickhouse_driver import Client
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.db_config import decrypt_password, encrypt_password
from app.core.deps import get_current_user, require_permission
from app.models.user import User
from app.services import clickhouse_client as ch
from app.services.audit import log_audit

router = APIRouter(
    prefix="/clickhouse",
    tags=["clickhouse-config"],
    dependencies=[Depends(get_current_user), Depends(require_permission("clickhouse_config"))],
)


class ConnIn(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    host: str = Field(min_length=1, max_length=255)
    port: int = Field(default=9000, ge=1, le=65535)
    database: str = Field(default="esapm_metrics", max_length=128)
    user: str = Field(default="default", max_length=128)
    password: Optional[str] = Field(default=None, max_length=512)
    connect_timeout: int = Field(default=5, ge=1, le=60)
    id: Optional[str] = None  # 仅 test 端点用：密码留空时取该已存连接的密码


class ActivateIn(BaseModel):
    id: str


class TestSavedIn(BaseModel):
    password: Optional[str] = Field(default=None, max_length=512)


# ── 文件读写（归一化为 {active, connections[]}；password_enc 密文形态） ──

_FIELDS = ("name", "host", "port", "database", "user", "connect_timeout")


def _read_struct() -> dict:
    p = ch._CONFIG_PATH
    if not p.exists():
        p = ch._LEGACY_CONFIG_PATH
    if not p.exists():
        return {"active": None, "connections": []}
    try:
        raw = yaml.safe_load(p.read_text(encoding="utf-8")) or {}
    except Exception:
        return {"active": None, "connections": []}
    if not isinstance(raw, dict):
        return {"active": None, "connections": []}

    conns = raw.get("connections")
    if isinstance(conns, list) and conns:
        out = []
        for c in conns:
            if not isinstance(c, dict):
                continue
            c = dict(c)
            # 旧明文键迁移：读入即转密文（写盘在下次保存时自然完成）
            if c.get("password") is not None and not c.get("password_enc"):
                c["password_enc"] = encrypt_password(str(c.pop("password")))
            elif "password" in c:
                c.pop("password")
            out.append(c)
        active = raw.get("active")
        if not any(c.get("id") == active for c in out):
            active = out[0].get("id") if out else None
        return {"active": active, "connections": out}

    # 旧单连接明文格式 → 归一化为一条"默认"连接
    if "host" in raw:
        conn = {"id": "ck_default", "name": "默认"}
        for k in _FIELDS[1:]:
            if raw.get(k) is not None:
                conn[k] = raw[k]
        if raw.get("password"):
            conn["password_enc"] = encrypt_password(str(raw["password"]))
        return {"active": "ck_default", "connections": [conn]}
    return {"active": None, "connections": []}


def _write_struct(struct: dict) -> None:
    data = {"active": struct.get("active"),
            "connections": [{k: v for k, v in c.items() if v is not None} for c in struct["connections"]]}
    ch._CONFIG_PATH.parent.mkdir(parents=True, exist_ok=True)
    ch._CONFIG_PATH.write_text("# ClickHouse 连接配置（由「系统管理 → ClickHouse 配置」页维护）\n"
                               + yaml.safe_dump(data, allow_unicode=True, sort_keys=False),
                               encoding="utf-8")


def _public(conn: dict, active_id: Optional[str]) -> dict:
    item = {"id": conn.get("id"), "is_active": conn.get("id") == active_id,
            "password_set": bool(conn.get("password_enc"))}
    item.update({k: conn.get(k) for k in _FIELDS})
    return item


def _find(struct: dict, cid: str) -> dict:
    conn = next((c for c in struct["connections"] if c.get("id") == cid), None)
    if conn is None:
        raise HTTPException(status_code=404, detail="连接不存在")
    return conn


async def _try_connect(host: str, port: int, database: str, user: str,
                       password: str, connect_timeout: int) -> dict:
    def _run() -> dict:
        client = None
        try:
            # clickhouse-driver Client 构造即建连；SELECT 1 验证可用性
            client = Client(host=host, port=port, database=database, user=user,
                            password=password, connect_timeout=connect_timeout,
                            settings={"connect_timeout": connect_timeout})
            client.execute("SELECT 1")
            return {"ok": True, "error": None}
        except Exception as exc:
            return {"ok": False, "error": str(exc)}
        finally:
            if client is not None:
                try:
                    client.disconnect()
                except Exception:
                    pass

    return await asyncio.to_thread(_run)


# ── 端点 ─────────────────────────────────────────────────────────────

@router.get("/connections")
async def list_connections():
    struct = _read_struct()
    return {"active": struct["active"],
            "items": [_public(c, struct["active"]) for c in struct["connections"]]}


@router.post("/connections")
async def create_connection(
    body: ConnIn,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    struct = _read_struct()
    cid = "ck_" + secrets.token_hex(4)
    conn = {"id": cid, **{k: getattr(body, k) for k in _FIELDS}}
    if body.password:
        conn["password_enc"] = encrypt_password(body.password)
    struct["connections"].append(conn)
    if not struct.get("active"):
        struct["active"] = cid  # 首条自动激活
    _write_struct(struct)
    ch.invalidate()
    log_audit(db, user=current_user, action="update_clickhouse_config",
              resource="clickhouse_config", resource_id=cid,
              detail=f"新建 ClickHouse 连接「{body.name}」{body.host}:{body.port}")
    await db.commit()
    return _public(conn, struct["active"])


@router.post("/connections/test")
async def test_connection_form(body: ConnIn):
    """未保存表单试连（不落盘、不失效）。密码留空且带 id 时用已存密码。"""
    password = body.password or ""
    if not password and body.id:
        struct = _read_struct()
        stored = next((c for c in struct["connections"] if c.get("id") == body.id), None)
        if stored and stored.get("password_enc"):
            password = decrypt_password(stored["password_enc"])
    return await _try_connect(body.host, body.port, body.database, body.user,
                              password, body.connect_timeout)


@router.put("/connections/{conn_id}")
async def update_connection(
    conn_id: str,
    body: ConnIn,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    struct = _read_struct()
    conn = _find(struct, conn_id)
    for k in _FIELDS:
        conn[k] = getattr(body, k)
    if body.password:  # 留空=保留原密码
        conn["password_enc"] = encrypt_password(body.password)
    _write_struct(struct)
    ch.invalidate()
    log_audit(db, user=current_user, action="update_clickhouse_config",
              resource="clickhouse_config", resource_id=conn_id,
              detail=f"更新 ClickHouse 连接「{body.name}」{body.host}:{body.port}")
    await db.commit()
    return _public(conn, struct["active"])


@router.delete("/connections/{conn_id}")
async def delete_connection(
    conn_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    struct = _read_struct()
    conn = _find(struct, conn_id)
    if struct.get("active") == conn_id:
        raise HTTPException(status_code=400, detail="当前激活连接不可删除，请先切换到其他连接")
    struct["connections"].remove(conn)
    _write_struct(struct)
    ch.invalidate()
    log_audit(db, user=current_user, action="update_clickhouse_config",
              resource="clickhouse_config", resource_id=conn_id,
              detail=f"删除 ClickHouse 连接「{conn.get('name')}」")
    await db.commit()
    return {"ok": True}


@router.post("/activate")
async def activate_connection(
    body: ActivateIn,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    struct = _read_struct()
    conn = _find(struct, body.id)
    struct["active"] = body.id
    _write_struct(struct)
    ch.invalidate()
    log_audit(db, user=current_user, action="update_clickhouse_config",
              resource="clickhouse_config", resource_id=body.id,
              detail=f"激活 ClickHouse 连接「{conn.get('name')}」{conn.get('host')}:{conn.get('port')}")
    await db.commit()
    return {"ok": True, "active": body.id}


@router.post("/connections/{conn_id}/test")
async def test_connection_saved(conn_id: str, body: TestSavedIn | None = None):
    """按已存连接试连（body.password 非空可临时覆盖，均不落盘）。"""
    struct = _read_struct()
    conn = _find(struct, conn_id)
    password = (body.password if body and body.password else
                (decrypt_password(conn["password_enc"]) if conn.get("password_enc") else ""))
    return await _try_connect(conn.get("host", "127.0.0.1"), int(conn.get("port", 9000)),
                              conn.get("database", "esapm_metrics"), conn.get("user", "default"),
                              password, int(conn.get("connect_timeout", 5)))
