"""区域注册表 schemas（openspec: add-relay-gateway / relay-region-registry）。"""
import re
from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field, field_validator

CODE_PATTERN = re.compile(r"^[a-z][a-z0-9-]{1,31}$")
CODE_ERROR_MSG = "区域code格式错误: 以小写字母开头，仅含小写字母/数字/中划线，长度2-32"
STATUS_VALUES = ("enabled", "disabled")
# 路由字段格式硬校验（openspec: relay-region-ux-optimization D4）：坏配置的代价（init
# 静默失败/探测误报）远大于填写成本，前端 inline + 后端 400/422 双层硬失败。
HTTP_BASE_URL_PATTERN = re.compile(r"^https?://[A-Za-z0-9.\-]+(:\d{1,5})?$")
HTTP_BASE_URL_ERROR_MSG = "网关 HTTP 腿格式错误: 须以 http:// 或 https:// 开头且不含路径，如 http://10.10.1.1:8443"
SSH_JUMP_PATTERN = re.compile(r"^[A-Za-z0-9._\-]+@[A-Za-z0-9.\-]+(:\d{1,5})?$")
SSH_JUMP_ERROR_MSG = "SSH 跳板格式错误: 须为 账号@主机[:端口]，如 tunnel@10.10.1.1:22"
OPENRESTY_PREFIX_ERROR_MSG = "OpenResty 前缀格式错误: 须为以 / 开头的绝对路径，如 /work/jboss/tunnel/openresty-1.21.4.1/nginx"


def _validate_http_base_url(v: Optional[str]) -> Optional[str]:
    if v is not None and not HTTP_BASE_URL_PATTERN.match(v):
        raise ValueError(HTTP_BASE_URL_ERROR_MSG)
    return v


def _validate_ssh_jump(v: Optional[str]) -> Optional[str]:
    if v is not None and not SSH_JUMP_PATTERN.match(v):
        raise ValueError(SSH_JUMP_ERROR_MSG)
    return v


def _validate_openresty_prefix(v: Optional[str]) -> Optional[str]:
    if v is not None and not v.startswith("/"):
        raise ValueError(OPENRESTY_PREFIX_ERROR_MSG)
    return v


class RelayGatewayCreate(BaseModel):
    code: str = Field(..., min_length=2, max_length=32)
    name: str = Field(..., min_length=1, max_length=100)
    http_base_url: Optional[str] = Field(None, max_length=255)
    ssh_jump: Optional[str] = Field(None, max_length=255)
    openresty_prefix: Optional[str] = Field(None, max_length=255)
    status: str = "enabled"
    # relay-region-topology-view D8/D6：ssh_user 放宽为可空——新建区域最小必填仅
    # code+name，SSH 账号在登记 SSH 腿时收集；执行前置由 init/push 端点守卫承接。
    ssh_user: Optional[str] = Field(None, max_length=64)
    ssh_password: Optional[str] = Field(None, max_length=255)
    ssh_port: int = Field(22, ge=1, le=65535)
    ansible_python_interpreter: Optional[str] = Field(None, max_length=255)
    ssh_common_args: str = Field(
        "-o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null",
        max_length=255,
    )

    @field_validator("code")
    @classmethod
    def validate_code(cls, v: str) -> str:
        if not CODE_PATTERN.match(v):
            raise ValueError(CODE_ERROR_MSG)
        return v

    @field_validator("status")
    @classmethod
    def validate_status(cls, v: str) -> str:
        if v not in STATUS_VALUES:
            raise ValueError("status 仅允许 enabled/disabled")
        return v

    @field_validator("http_base_url", "ssh_jump", "openresty_prefix")
    @classmethod
    def strip_path_fields(cls, v: Optional[str]) -> Optional[str]:
        """路径/URL 字段去首尾空白：前导空格曾让 init 的 nginx 探测静默失败（2026-10-03 kjc 实发）。"""
        if v is None:
            return None
        v = v.strip()
        return v or None

    # 格式校验定义在 strip 之后（Pydantic 按定义顺序运行）：先去空白再校验格式
    @field_validator("http_base_url")
    @classmethod
    def validate_http_base_url(cls, v: Optional[str]) -> Optional[str]:
        return _validate_http_base_url(v)

    @field_validator("ssh_jump")
    @classmethod
    def validate_ssh_jump(cls, v: Optional[str]) -> Optional[str]:
        return _validate_ssh_jump(v)

    @field_validator("openresty_prefix")
    @classmethod
    def validate_openresty_prefix(cls, v: Optional[str]) -> Optional[str]:
        return _validate_openresty_prefix(v)


class RelayGatewayUpdate(BaseModel):
    """code 字段存在仅为显式拒绝修改（必须与现值一致）；其余字段按提交更新。"""

    code: Optional[str] = Field(None, min_length=2, max_length=32)
    name: Optional[str] = Field(None, min_length=1, max_length=100)
    http_base_url: Optional[str] = Field(None, max_length=255)
    ssh_jump: Optional[str] = Field(None, max_length=255)
    openresty_prefix: Optional[str] = Field(None, max_length=255)
    status: Optional[str] = None
    ssh_user: Optional[str] = Field(None, max_length=64)
    ssh_password: Optional[str] = Field(None, max_length=255)
    ssh_port: Optional[int] = Field(None, ge=1, le=65535)
    ansible_python_interpreter: Optional[str] = Field(None, max_length=255)
    ssh_common_args: Optional[str] = Field(None, max_length=255)

    @field_validator("code")
    @classmethod
    def validate_code(cls, v: Optional[str]) -> Optional[str]:
        if v is not None and not CODE_PATTERN.match(v):
            raise ValueError(CODE_ERROR_MSG)
        return v

    @field_validator("status")
    @classmethod
    def validate_status(cls, v: Optional[str]) -> Optional[str]:
        if v is not None and v not in STATUS_VALUES:
            raise ValueError("status 仅允许 enabled/disabled")
        return v

    @field_validator("http_base_url", "ssh_jump", "openresty_prefix")
    @classmethod
    def strip_path_fields(cls, v: Optional[str]) -> Optional[str]:
        """同 Create：路径/URL 字段去首尾空白（None 透传，空串归 None）。"""
        if v is None:
            return None
        v = v.strip()
        return v or None

    # 同 Create：格式校验在 strip 之后
    @field_validator("http_base_url")
    @classmethod
    def validate_http_base_url(cls, v: Optional[str]) -> Optional[str]:
        return _validate_http_base_url(v)

    @field_validator("ssh_jump")
    @classmethod
    def validate_ssh_jump(cls, v: Optional[str]) -> Optional[str]:
        return _validate_ssh_jump(v)

    @field_validator("openresty_prefix")
    @classmethod
    def validate_openresty_prefix(cls, v: Optional[str]) -> Optional[str]:
        return _validate_openresty_prefix(v)


class RelayStatusUpdate(BaseModel):
    status: str

    @field_validator("status")
    @classmethod
    def validate_status(cls, v: str) -> str:
        if v not in STATUS_VALUES:
            raise ValueError("status 仅允许 enabled/disabled")
        return v


class RelayPushDrift(BaseModel):
    """下发漂移（列表端点计算注入，非库列）：当前启用节点集合相对快照的差集。

    - added: 现有快照无 → 本次将新增
    - removed: 快照有现无 → 本次将移除（全量替换会从网关白名单拿掉）
    """

    added: list[str] = []
    removed: list[str] = []


class RelayGatewayOut(BaseModel):
    id: int
    code: str
    name: str
    http_base_url: Optional[str] = None
    ssh_jump: Optional[str] = None
    openresty_prefix: Optional[str] = None
    status: str
    # SSH 连接（relay-gateway-inventory-ui）：口令不出列表（单查端点 + 审计）
    ssh_user: Optional[str] = None
    ssh_port: Optional[int] = None
    ansible_python_interpreter: Optional[str] = None
    ssh_common_args: Optional[str] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    # 清单漂移标记（列表端点计算注入，非库列）：True = inventory/gateways 缺该局主机组
    inventory_group_missing: Optional[bool] = None
    # 区域节点计数（列表端点聚合注入，非库列）：下发确认弹窗展示白名单规模
    enabled_node_count: int = 0
    total_node_count: int = 0
    # 挂接集群计数（relay-gateways-ux-redesign：>0 时删除菜单禁用，先解挂再删）
    attached_cluster_count: int = 0
    # 下发快照（relay-push-drift-preview）：last_pushed_at 来自库列；
    # push_drift 无快照为 null（区别于「一致」的空差集）
    last_pushed_at: Optional[datetime] = None
    push_drift: Optional[RelayPushDrift] = None

    class Config:
        from_attributes = True


class RelayPushConfigRequest(BaseModel):
    """下发白名单请求体。

    ``allow_empty``：该区域 0 启用节点时，默认 409 拒绝（防静默清空网关白名单，
    openspec: relay-push-empty-whitelist-guard）；显式置 true 放行（区域下线清空场景）。
    """

    allow_empty: bool = False


class RelayConfigFile(BaseModel):
    """一份待写入网关机的配置文件内容（只读预览，供界面复制/手工配置兜底）。"""

    path: str
    content: str
    purpose: str


class RelayConfigPreview(BaseModel):
    """区域配置预览：init 的 nginx 配置 + push 的白名单内容（不触网、不改远端）。"""

    region_code: str
    openresty_prefix: str
    listen_port: int
    files: list[RelayConfigFile]
    notes: list[str]


class RelaySshdSetupRequest(BaseModel):
    """以 root 在网关机配置 sshd 跳板转发（凭据仅本次使用，不保存、不落库）。"""

    root_user: str = Field(default="root", description="root 账号")
    root_password: str = Field(..., min_length=1, description="root 密码（仅本次使用，不保存）")


# ── 拓扑数据端点（relay-region-topology-view design D4：只读聚合，无模型/列改动） ──


class RelayTopologyNode(BaseModel):
    """拓扑节点行：whitelist_state 为服务端单点派生（design D3），前端不重复推导。"""

    ip: str
    management_port: int
    status: int
    whitelist_state: str


class RelayTopologyCluster(BaseModel):
    """拓扑集群卡：区域内挂接的集群及其节点明细。"""

    id: int
    name: str
    display_name: Optional[str] = None
    nodes: list[RelayTopologyNode] = []


class RelayTopologyRegion(BaseModel):
    """拓扑链路卡的区域块：含两腿与 SSH 连接摘要（阶段机/连接摘要需要；口令永不回传）。"""

    id: int
    code: str
    name: str
    status: str
    http_base_url: Optional[str] = None
    ssh_jump: Optional[str] = None
    ssh_user: Optional[str] = None
    ssh_port: Optional[int] = None
    openresty_prefix: Optional[str] = None
    last_pushed_at: Optional[datetime] = None
    clusters: list[RelayTopologyCluster] = []


class RelayTopologyClusterRef(BaseModel):
    """可挂接候选轻量引用（detachable）：全部集群，前端按区域自行过滤。"""

    id: int
    name: str
    display_name: Optional[str] = None
    region_code: Optional[str] = None


class RelayTopologyOut(BaseModel):
    """GET /relay/topology 响应：区域→集群→节点聚合 + 悬空区域码。"""

    regions: list[RelayTopologyRegion] = []
    detachable: list[RelayTopologyClusterRef] = []
    unregistered_bound_codes: list[str] = []
