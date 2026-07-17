"""SSL certificate Pydantic schemas."""

from pydantic import BaseModel, Field, field_validator
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
