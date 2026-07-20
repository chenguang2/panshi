"""SSL certificate Pydantic schemas."""

import json
from pydantic import BaseModel, Field, field_validator, model_validator
from typing import Optional, List
from datetime import datetime


class CommandLogEntry(BaseModel):
    """A single command execution record during certificate generation."""

    step: str = Field(..., description="步骤名称，如'生成密钥对'、'生成 CSR'")
    command: str = Field(..., description="完整命令行")
    exit_code: int = Field(..., description="进程退出码，0 表示成功")
    stdout: str = Field(default="", description="标准输出（过长时截断前 500 字符）")
    stderr: str = Field(default="", description="标准错误输出")


class SslCertificateBase(BaseModel):
    name: str = ""
    cluster_id: int = Field(..., ge=1)
    cert_type: str = Field(default="server")
    sni: str = ""
    cert: str = ""
    private_key: str = Field(default="", alias="key")
    ssl_protocols: Optional[str] = None
    description: Optional[str] = None
    gm: bool = False
    algorithm: Optional[str] = None
    sign_cert: Optional[str] = None
    sign_key: Optional[str] = None
    create_method: str = "upload"
    is_ca: bool = False
    ca_cert_id: Optional[int] = None

    class Config:
        populate_by_name = True


class SslCertificateCreate(SslCertificateBase):
    name: str = Field(..., min_length=1, max_length=100)
    sni: str = Field(..., min_length=1)
    cert: str = Field(..., min_length=1)
    private_key: str = Field(..., min_length=1, alias="key")

    @field_validator("sign_cert", "sign_key")
    @classmethod
    def validate_gm_fields(cls, v, info):
        if info.data.get("gm") and not (v or "").strip():
            raise ValueError("国密模式下签名证书和签名私钥为必填")
        return v or ""

    @model_validator(mode="after")
    def auto_detect_algorithm(self):
        if not self.algorithm and self.cert:
            try:
                from app.services.cert_generator import detect_cert_algorithm
                algo = detect_cert_algorithm(self.cert)
                if algo:
                    self.algorithm = algo
            except Exception:
                pass
        return self


class SslCertificateUpdate(BaseModel):
    name: Optional[str] = None
    sni: Optional[str] = None
    cert: Optional[str] = None
    private_key: Optional[str] = Field(None, alias="key")
    cert_type: Optional[str] = None
    ssl_protocols: Optional[str] = None
    description: Optional[str] = None
    gm: Optional[bool] = None
    algorithm: Optional[str] = None
    sign_cert: Optional[str] = None
    sign_key: Optional[str] = None
    is_ca: Optional[bool] = None
    ca_cert_id: Optional[int] = None

    class Config:
        populate_by_name = True


class SslCertificateResponse(SslCertificateBase):
    id: int
    edge_uuid: str
    cluster_id: int
    current_version: Optional[int] = None
    status: int = 1
    generate_log: Optional[list[CommandLogEntry]] = None
    created_at: Optional[str] = None
    updated_at: Optional[str] = None

    @field_validator("created_at", "updated_at", mode="before")
    @classmethod
    def convert_datetime(cls, v):
        if isinstance(v, datetime):
            return v.isoformat() + "Z"
        return v

    @field_validator("generate_log", mode="before")
    @classmethod
    def convert_generate_log(cls, v):
        if isinstance(v, str):
            try:
                return [CommandLogEntry(**item) for item in json.loads(v)]
            except (json.JSONDecodeError, TypeError, ValueError):
                return None
        return v

    @model_validator(mode="after")
    def mask_ca_private_key(self):
        """Mask private_key for CA certificates in responses."""
        if self.is_ca:
            self.private_key = ""
        return self

    class Config:
        from_attributes = True


class CaCertificateGenerateRequest(BaseModel):
    """Request schema for CA root certificate generation."""

    name: str = Field(..., min_length=1, max_length=100, description="CA 证书显示名称")
    common_name: Optional[str] = Field(default=None, description="CA 证书 CN，默认取 name")
    validity_days: int = Field(default=3650, ge=1, le=36500, description="CA 有效期（天）")


class SslCertificateGenerateRequest(BaseModel):
    """Request schema for certificate generation."""

    name: str = Field(..., min_length=1, max_length=100)
    common_name: str = Field(..., min_length=1)
    dns_sans: list[str] = Field(default_factory=list)
    ip_sans: list[str] = Field(default_factory=list)
    validity_days: int = Field(default=365, ge=1, le=36500)
    dual_cert: bool = True
    cert_type: str = Field(default="server", pattern=r"^(server|client)$")
    algorithm: str = Field(default="sm2", pattern=r"^(sm2|rsa|ecc)$")
    ca_cert_id: int | None = Field(default=None, description="SM2 必填，引用已有 CA")
    generate_client_certs: bool = Field(default=False, description="SM2 可选，是否同时生成客户端双证书")


class SslCertificateGenerateResponse(BaseModel):
    """Response schema for certificate generation.

    Wraps server cert record and optional client cert record.
    """

    server: SslCertificateResponse
    client: Optional[SslCertificateResponse] = None
