"""SSL certificate Pydantic schemas."""

from pydantic import BaseModel, Field, field_validator
from typing import Optional, List
from datetime import datetime


class SslCertificateBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    cluster_id: int = Field(..., ge=1)
    cert_type: str = Field(default="server")
    sni: str = Field(..., min_length=1)
    cert: str = Field(..., min_length=1)
    private_key: str = Field(..., min_length=1, alias="key")
    ssl_protocols: Optional[str] = None
    description: Optional[str] = None

    class Config:
        populate_by_name = True


class SslCertificateCreate(SslCertificateBase):
    pass


class SslCertificateUpdate(BaseModel):
    name: Optional[str] = None
    sni: Optional[str] = None
    cert: Optional[str] = None
    private_key: Optional[str] = Field(None, alias="key")
    cert_type: Optional[str] = None
    ssl_protocols: Optional[str] = None
    description: Optional[str] = None

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
