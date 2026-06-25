from sqlalchemy import String, Integer, DateTime, Text, ForeignKey, Column, UniqueConstraint
from datetime import datetime
import uuid
from app.core.database import Base


class Cluster(Base):
    __tablename__ = "ps_cluster"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False)
    display_name = Column(String(200), nullable=True)
    admin_url = Column(String(500), nullable=True)
    admin_key = Column(String(255), nullable=True)
    description = Column(Text, nullable=True)
    group_name = Column(String(100), nullable=True)
    status = Column(Integer, nullable=False, default=1)
    creator_id = Column(Integer, nullable=True)
    current_version = Column(Integer, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class PluginEnabled(Base):
    """插件启用开关"""
    __tablename__ = "ps_plugin_enabled"

    id = Column(Integer, primary_key=True, index=True)
    plugin_name = Column(String(100), nullable=False, unique=True, index=True)
    enabled = Column(Integer, nullable=False, default=1)  # 1=启用 0=禁用
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class Upstream(Base):
    __tablename__ = "ps_upstream"
    __table_args__ = (
        UniqueConstraint("cluster_id", "edge_uuid", name="uq_upstream_cluster_edge"),
    )

    id = Column(Integer, primary_key=True, index=True)
    edge_uuid = Column(String(36), nullable=False, default=lambda: str(uuid.uuid4()))
    cluster_id = Column(Integer, ForeignKey("ps_cluster.id", ondelete="CASCADE"), nullable=False)
    name = Column(String(100), nullable=False)
    load_balance = Column(String(20), nullable=False, default="weighted_roundrobin")
    description = Column(Text, nullable=True)
    hash_on = Column(String(20), nullable=True)
    key = Column(String(100), nullable=True)
    checks = Column(Text, nullable=True)  # JSON string for health check config
    retries = Column(Integer, nullable=True)
    retry_timeout = Column(Integer, nullable=True)
    timeout = Column(Text, nullable=True)  # JSON: {"connect": N, "send": N, "read": N}
    pass_host = Column(String(20), nullable=True, default="pass")
    upstream_host = Column(String(255), nullable=True)
    scheme = Column(String(20), nullable=True, default="http")
    keepalive_pool = Column(Text, nullable=True)  # JSON: {"size": N, "idle_timeout": N, "requests": N}
    current_version = Column(Integer, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class UpstreamTarget(Base):
    __tablename__ = "ps_upstream_target"

    id = Column(Integer, primary_key=True, index=True)
    upstream_id = Column(Integer, ForeignKey("ps_upstream.id", ondelete="CASCADE"), nullable=False)
    target = Column(String(255), nullable=False)
    weight = Column(Integer, nullable=False, default=100)
    created_at = Column(DateTime, default=datetime.utcnow)


class Route(Base):
    __tablename__ = "ps_route"
    __table_args__ = (
        UniqueConstraint("cluster_id", "edge_uuid", name="uq_route_cluster_edge"),
    )

    id = Column(Integer, primary_key=True, index=True)
    edge_uuid = Column(String(36), nullable=False, default=lambda: str(uuid.uuid4()))
    cluster_id = Column(Integer, ForeignKey("ps_cluster.id", ondelete="CASCADE"), nullable=False)
    upstream_id = Column(Integer, ForeignKey("ps_upstream.id", ondelete="SET NULL"), nullable=True)
    name = Column(String(100), nullable=False)
    uri = Column(String(500), nullable=False)
    methods = Column(String(100), nullable=True)
    priority = Column(Integer, nullable=False, default=0)
    status = Column(Integer, nullable=False, default=1)
    description = Column(Text, nullable=True)
    current_version = Column(Integer, nullable=True)
    hosts = Column(String(500), nullable=True)
    remote_addrs = Column(String(500), nullable=True)
    vars = Column(Text, nullable=True)
    advanced_match_enabled = Column(Integer, nullable=False, default=0)
    plugin_config_ids = Column(Text, nullable=True)  # JSON array of plugin_config edge_uuids
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class RoutePlugin(Base):
    __tablename__ = "ps_route_plugin"

    id = Column(Integer, primary_key=True, index=True)
    route_id = Column(Integer, ForeignKey("ps_route.id", ondelete="CASCADE"), nullable=False)
    plugin_name = Column(String(50), nullable=False)
    config = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class Node(Base):
    __tablename__ = "ps_node"

    id = Column(Integer, primary_key=True, index=True)
    cluster_id = Column(Integer, ForeignKey("ps_cluster.id", ondelete="CASCADE"), nullable=False)
    ip = Column(String(50), nullable=False)
    service_port = Column(Integer, nullable=False, default=80)
    management_port = Column(Integer, nullable=False, default=9180)
    edge_path = Column(String(255), nullable=False)
    edge_install_path = Column(String(255), nullable=True)
    status = Column(Integer, nullable=False, default=1)
    status_detail = Column(Text, nullable=True)  # JSON: last ansible-runner execution result
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class ConfigVersion(Base):
    __tablename__ = "ps_config_version"

    id = Column(Integer, primary_key=True, index=True)
    cluster_id = Column(Integer, ForeignKey("ps_cluster.id", ondelete="CASCADE"), nullable=False)
    resource_type = Column(String(20), nullable=False)
    resource_id = Column(Integer, nullable=False)
    version = Column(Integer, nullable=False)
    config = Column(Text, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    created_by = Column(String(50), default="system")


class PluginMetadata(Base):
    __tablename__ = "ps_plugin_metadata"
    __table_args__ = (
        UniqueConstraint("cluster_id", "plugin_name", name="uq_cluster_plugin"),
    )

    id = Column(Integer, primary_key=True, index=True)
    cluster_id = Column(Integer, ForeignKey("ps_cluster.id", ondelete="CASCADE"), nullable=False)
    plugin_name = Column(String(50), nullable=False)
    config_data = Column(Text, nullable=False, default="{}")
    current_version = Column(Integer, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class PluginConfig(Base):
    __tablename__ = "ps_plugin_config"
    __table_args__ = (
        UniqueConstraint("cluster_id", "edge_uuid", name="uq_pc_cluster_edge"),
    )

    id = Column(Integer, primary_key=True, index=True)
    edge_uuid = Column(String(36), nullable=False, default=lambda: str(uuid.uuid4()))
    cluster_id = Column(Integer, ForeignKey("ps_cluster.id", ondelete="CASCADE"), nullable=False)
    name = Column(String(100), nullable=False)
    description = Column(Text, nullable=True)
    plugins = Column(Text, nullable=True)
    current_version = Column(Integer, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class GlobalRule(Base):
    __tablename__ = "ps_global_rule"
    __table_args__ = (
        UniqueConstraint("cluster_id", "edge_uuid", name="uq_gr_cluster_edge"),
    )

    id = Column(Integer, primary_key=True, index=True)
    edge_uuid = Column(String(36), nullable=False, default=lambda: str(uuid.uuid4()))
    cluster_id = Column(Integer, ForeignKey("ps_cluster.id", ondelete="CASCADE"), nullable=False)
    name = Column(String(100), nullable=False)
    description = Column(Text, nullable=True)
    plugins = Column(Text, nullable=True)
    current_version = Column(Integer, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class StreamProxy(Base):
    """四层代理（L4 TCP/UDP Stream Proxy）配置"""
    __tablename__ = "ps_stream_proxy"
    __table_args__ = (
        UniqueConstraint("cluster_id", "listen_port", name="uq_stream_proxy_cluster_port"),
    )

    id = Column(Integer, primary_key=True, index=True)
    edge_uuid = Column(String(36), nullable=False, default=lambda: str(uuid.uuid4()))
    cluster_id = Column(Integer, ForeignKey("ps_cluster.id", ondelete="CASCADE"), nullable=False)
    name = Column(String(100), nullable=False)
    description = Column(Text, nullable=True)
    listen_port = Column(Integer, nullable=False)
    load_balance = Column(String(20), nullable=False, default="weighted_roundrobin")
    scheme = Column(String(10), nullable=False, default="tcp")
    targets = Column(Text, nullable=True)       # JSON: [{"target":"ip:port", "weight":100}, ...]
    timeout = Column(Text, nullable=True)        # JSON: {"connect": N, "send": N, "read": N}
    keepalive_pool = Column(Text, nullable=True) # JSON: {"size": N, "idle_timeout": N, "requests": N}
    remote_addr = Column(String(100), nullable=True)  # CIDR
    sni = Column(String(255), nullable=True)          # TLS SNI
    status = Column(Integer, nullable=False, default=1)
    current_version = Column(Integer, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


