from sqlalchemy import String, Integer, DateTime, Text, ForeignKey, Column
from sqlalchemy.orm import relationship
from datetime import datetime
from app.core.database import Base


class Cluster(Base):
    __tablename__ = "ps_cluster"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False)
    display_name = Column(String(200), nullable=True)
    admin_url = Column(String(500), nullable=False)
    admin_key = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    status = Column(Integer, nullable=False, default=1)
    creator_id = Column(Integer, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class Upstream(Base):
    __tablename__ = "ps_upstream"

    id = Column(Integer, primary_key=True, index=True)
    cluster_id = Column(Integer, ForeignKey("ps_cluster.id", ondelete="CASCADE"), nullable=False)
    name = Column(String(100), nullable=False)
    load_balance = Column(String(20), nullable=False, default="roundrobin")
    description = Column(Text, nullable=True)
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
    cluster_id = Column(Integer, ForeignKey("ps_cluster.id", ondelete="CASCADE"), nullable=False)
    upstream_id = Column(Integer, ForeignKey("ps_upstream.id", ondelete="SET NULL"), nullable=True)
    name = Column(String(100), nullable=False)
    uri = Column(String(500), nullable=False)
    methods = Column(String(100), nullable=True)
    priority = Column(Integer, nullable=False, default=0)
    status = Column(Integer, nullable=False, default=1)
    description = Column(Text, nullable=True)
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