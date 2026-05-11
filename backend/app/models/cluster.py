from sqlalchemy import String, Integer, DateTime, Text, ForeignKey, Column, UniqueConstraint
from sqlalchemy.orm import relationship
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
    status = Column(Integer, nullable=False, default=1)
    creator_id = Column(Integer, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class Upstream(Base):
    __tablename__ = "ps_upstream"

    id = Column(Integer, primary_key=True, index=True)
    edge_uuid = Column(String(36), unique=True, nullable=False, default=lambda: str(uuid.uuid4()))
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

    id = Column(Integer, primary_key=True, index=True)
    edge_uuid = Column(String(36), unique=True, nullable=False, default=lambda: str(uuid.uuid4()))
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
    status = Column(Integer, nullable=False, default=1)
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


class ClusterPluginMetadata(Base):
    __tablename__ = "ps_cluster_plugin_metadata"

    id = Column(Integer, primary_key=True, index=True)
    cluster_id = Column(Integer, ForeignKey("ps_cluster.id", ondelete="CASCADE"), nullable=False)
    plugin_name = Column(String(50), nullable=False)
    config_data = Column(Text, nullable=False, default="{}")
    version = Column(Integer, nullable=False, default=1)
    is_published = Column(Integer, nullable=False, default=0)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class PluginMetadataVersion(Base):
    __tablename__ = "ps_plugin_metadata_version"
    __table_args__ = (
        UniqueConstraint('cluster_plugin_metadata_id', 'version', name='uix_plugin_version'),
    )

    id = Column(Integer, primary_key=True, index=True)
    cluster_plugin_metadata_id = Column(Integer, ForeignKey("ps_cluster_plugin_metadata.id", ondelete="CASCADE"), nullable=False)
    config_data = Column(Text, nullable=False)
    version = Column(Integer, nullable=False)
    action = Column(String(20), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)