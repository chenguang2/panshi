"""SSL certificate Pydantic schemas."""

import json
import ipaddress
from pydantic import BaseModel, Field, field_validator, model_validator
from typing import Optional, List
from datetime import datetime

from app.services.ssl_pem import RESERVED_SNIS


class CommandLogEntry(BaseModel):
    """A single command execution record during certificate generation."""

    step: str = Field(..., description="步骤名称，如'生成密钥对'、'生成 CSR'")
    command: str = Field(..., description="完整命令行")
    exit_code: int = Field(..., description="进程退出码，0 表示成功")
    stdout: str = Field(default="", description="标准输出（过长时截断前 500 字符）")
    stderr: str = Field(default="", description="标准错误输出")


class SslCertificateBase(BaseModel):
    name: str = ""
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
    organization: Optional[str] = None
    organizational_unit: Optional[str] = None
    client_ca: Optional[str] = None
    client_depth: Optional[int] = None
    skip_mtls_uri_regex: Optional[str] = None

    class Config:
        populate_by_name = True


class SslCertificateCreate(SslCertificateBase):
    name: str = Field(..., min_length=1, max_length=100)
    sni: str = Field(..., min_length=1)
    cert: str = Field(..., min_length=1)
    private_key: str = Field(..., min_length=1, alias="key")
    # ssl-ux-review-fixes 8.1：URL 中的 cluster_id 为权威来源；body 值仅用于一致性校验（不一致 422），可不传
    cluster_id: Optional[int] = Field(default=None, ge=1)

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
    organization: Optional[str] = None
    organizational_unit: Optional[str] = None
    client_ca: Optional[str] = None
    client_depth: Optional[int] = None
    skip_mtls_uri_regex: Optional[str] = None

    class Config:
        populate_by_name = True


class SslCertificateResponse(SslCertificateBase):
    id: int
    edge_uuid: str
    cluster_id: int
    current_version: Optional[int] = None
    # 最近发布时间（ConfigVersion 回查回填，非模型列；None=从未发布）
    published_at: Optional[str] = None
    # 待发布（ssl-ux-review-fixes D1：经 edge_sync.derive_pending_publish 单点推导，端点回填；
    # 前端 MUST NOT 按时间戳自行实现）
    pending_publish: bool = False
    status: int = 1
    generate_log: Optional[list[CommandLogEntry]] = None
    created_at: Optional[str] = None
    updated_at: Optional[str] = None
    # 证书到期信息（ux-review H2：序列化期从 cert PEM 解析，非模型列；None=解析失败如国密双证书）
    expire_at: Optional[str] = None
    expire_days: Optional[int] = None
    # 证书 SAN（uapm 案例：IP SAN 只烧在证书体里，平台此前从不透出 → 卡片/编辑无法显示；
    # 同 expire_at 模式：序列化期从 cert PEM 解析，非模型列，解析失败降级空列表）
    dns_sans: List[str] = Field(default_factory=list)
    ip_sans: List[str] = Field(default_factory=list)
    # ssl-cert-rollback-consistency：匹配名单与证书 SAN 不一致（PEM 解析失败恒 False——无法判定不告警）
    sni_mismatch: bool = False
    # 私钥在位布尔（ssl-ux-review-fixes 9.1：响应掩码后由布尔表达「是否有私钥」）
    has_private_key: bool = False
    has_sign_key: bool = False

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

    @model_validator(mode="after")
    def derive_expiry(self):
        """ux-review H2：从 cert PEM 解析 notAfter，输出 expire_at/expire_days。

        解析失败（国密双证书等非标准 PEM）优雅降级为 None，不影响响应。
        ssl-ux-review-fixes 10.1：解析逻辑收敛到 services/ssl_pem.parse_cert_pem
        （与 POST /ssl/preview 共用，禁止两份 x509 解析）。
        """
        if self.expire_at is not None and self.dns_sans and self.ip_sans:
            return self
        from app.services.ssl_pem import parse_cert_pem

        info = parse_cert_pem(getattr(self, "cert", None))
        if info is None:
            return self
        if self.expire_at is None:
            self.expire_at = info["not_after"]
            self.expire_days = info["expire_days"]
        if not self.dns_sans:
            self.dns_sans = info.get("dns_sans", [])
        if not self.ip_sans:
            self.ip_sans = info.get("ip_sans", [])
        # ssl-cert-rollback-consistency：规范化集合比对（PEM SAN 为事实源）。
        # 系统保留项（edge.local）由平台强制管理、允许单侧存在，两侧都剔除后再比对。
        sni_set = {s.strip() for s in (self.sni or "").split(",") if s.strip()} - set(RESERVED_SNIS)
        san_set = (set(info["dns_sans"]) | set(info["ip_sans"])) - set(RESERVED_SNIS)
        self.sni_mismatch = sni_set != san_set
        return self

    class Config:
        from_attributes = True


class SslPemCertPreview(BaseModel):
    """ssl-ux-review-fixes 10.1：证书 PEM 预览项（非法输入不会出现在响应里，见 Response）。"""

    ok: bool = True
    subject_cn: Optional[str] = None
    san: list[str] = []
    not_after: Optional[str] = None
    algorithm: Optional[str] = None
    expire_days: Optional[int] = None


class SslPemKeyPreview(BaseModel):
    ok: bool


class SslPemPreviewRequest(BaseModel):
    """POST /clusters/{id}/ssl/preview 请求体；cert/key 均可选。"""

    cert: Optional[str] = None
    key: Optional[str] = None


class SslPemPreviewResponse(BaseModel):
    """分字段预览：非法/缺失 → cert=None；key 缺失=None、非法=ok:false；key_match 仅双 ok 时返回。"""

    cert: Optional[SslPemCertPreview] = None
    key: Optional[SslPemKeyPreview] = None
    key_match: Optional[bool] = None


class CaCertificateGenerateRequest(BaseModel):
    """Request schema for CA root certificate generation."""

    name: str = Field(..., min_length=1, max_length=100, description="CA 证书显示名称")
    common_name: Optional[str] = Field(default=None, description="CA 证书 CN，默认取 name")
    organization: Optional[str] = Field(default=None, description="组织 (O)，默认 EMBRACE")
    organizational_unit: Optional[str] = Field(default=None, description="组织单位 (OU)，默认 EDGE")
    validity_days: int = Field(default=3650, ge=1, le=36500, description="CA 有效期（天）")
    algorithm: str = Field(default="sm2", pattern=r"^(sm2|rsa|ecc)$", description="证书算法")


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
    organization: Optional[str] = Field(default=None, description="组织 (O)，证书主体中的组织名称")
    organizational_unit: Optional[str] = Field(default=None, description="组织单位 (OU)，证书主体中的部门名称")
    client_ca: Optional[str] = Field(default=None, description="双向认证 CA 证书 PEM")
    client_depth: Optional[int] = Field(default=None, description="双向认证证书链深度")
    skip_mtls_uri_regex: Optional[str] = Field(default=None, description="跳过双向认证的 URI 正则")

    @field_validator("ip_sans")
    @classmethod
    def validate_ip_sans(cls, v):
        cleaned = []
        for ip in v or []:
            stripped = ip.strip()
            try:
                ipaddress.ip_address(stripped)
            except ValueError:
                raise ValueError(f"无效的 IP 地址: {ip}")
            cleaned.append(stripped)
        return cleaned


class SslCertificateGenerateResponse(BaseModel):
    """Response schema for certificate generation.

    Wraps server cert record and optional client cert record.
    """

    server: SslCertificateResponse
    client: Optional[SslCertificateResponse] = None
