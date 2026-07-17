"""SSL certificate Pydantic schemas."""

from pydantic import BaseModel, Field, field_validator, model_validator
from typing import Optional, List
from datetime import datetime


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
    sign_cert: Optional[str] = None
    sign_key: Optional[str] = None
    create_method: str = "upload"

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


class SslCertificateUpdate(BaseModel):
    name: Optional[str] = None
    sni: Optional[str] = None
    cert: Optional[str] = None
    private_key: Optional[str] = Field(None, alias="key")
    cert_type: Optional[str] = None
    ssl_protocols: Optional[str] = None
    description: Optional[str] = None
    gm: Optional[bool] = None
    sign_cert: Optional[str] = None
    sign_key: Optional[str] = None

    class Config:
        populate_by_name = True


class SslCertificateResponse(SslCertificateBase):
    id: int
    edge_uuid: str
    cluster_id: int
    current_version: Optional[int] = None
    status: int = 1
    created_at: Optional[str] = None
    updated_at: Optional[str] = None

    @field_validator("created_at", "updated_at", mode="before")
    @classmethod
    def convert_datetime(cls, v):
        if isinstance(v, datetime):
            return v.isoformat() + "Z"
        return v

    class Config:
        from_attributes = True


class SslCertificateGenerateRequest(BaseModel):
    """Request schema for SM2 certificate generation."""

    name: str = Field(..., min_length=1, max_length=100)
    common_name: str = Field(..., min_length=1)
    dns_sans: list[str] = Field(default_factory=list)
    ip_sans: list[str] = Field(default_factory=list)
    validity_days: int = Field(default=365, ge=1, le=36500)
    dual_cert: bool = True
    cert_type: str = Field(default="server", pattern=r"^(server|client)$")
    mode: str = Field(..., pattern=r"^(local|remote)$")
    node_id: int | None = Field(default=None)

    @model_validator(mode="after")
    def validate_remote_node_id(self):
        if self.mode == "remote" and self.node_id is None:
            raise ValueError("远程生成时必须指定节点 (node_id)")
        return self
