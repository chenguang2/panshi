from sqlalchemy import String, Integer, DateTime, Text, BigInteger, ForeignKey, Column, UniqueConstraint
from datetime import datetime
from app.core.database import Base


class StaticResource(Base):
    __tablename__ = "ps_static_resource"
    __table_args__ = (
        UniqueConstraint("cluster_id", "route_id", name="uq_static_resource_cluster_route"),
    )

    id = Column(Integer, primary_key=True, index=True)
    cluster_id = Column(Integer, ForeignKey("ps_cluster.id", ondelete="CASCADE"), nullable=False)
    route_id = Column(Integer, ForeignKey("ps_route.id", ondelete="SET NULL"), nullable=True)
    name = Column(String(100), nullable=False)
    url_path = Column(String(200), nullable=True)
    description = Column(Text, nullable=True)
    file_size = Column(BigInteger, nullable=True)
    storage_path = Column(String(500), nullable=True)
    current_version = Column(Integer, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
