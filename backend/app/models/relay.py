"""跨中心区域注册表模型（openspec: add-relay-gateway / relay-region-registry）。"""
from datetime import datetime

from sqlalchemy import Column, DateTime, Integer, String

from app.core.database import Base


class RelayGateway(Base):
    """区域注册表：一个路局中心一条记录。

    - code: 区域码（集群 region_code 挂接、fleet 组名与渲染文件名使用），创建后不可变
    - http_base_url / ssh_jump: 该局网关两腿路由；均为空 = 直连区域（如武清本地）
    - openresty_prefix: 该局网关 OpenResty 安装前缀（init/push 定位 conf/sbin；空 = 标准路径）
    - status: enabled / disabled（单局摘除，回退直连）
    """

    __tablename__ = "relay_gateways"

    id = Column(Integer, primary_key=True, index=True)
    code = Column(String(32), nullable=False, unique=True, index=True)
    name = Column(String(100), nullable=False)
    http_base_url = Column(String(255), nullable=True)
    ssh_jump = Column(String(255), nullable=True)
    openresty_prefix = Column(String(255), nullable=True)
    status = Column(String(16), nullable=False, default="enabled")
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
