"""SSL Certificate model."""

import uuid
from datetime import datetime, timezone

from app.core.database import Base
from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey, Boolean


class SslCertificate(Base):
    __tablename__ = "ps_ssl_certificate"

    id = Column(Integer, primary_key=True, autoincrement=True)
    edge_uuid = Column(String(36), nullable=False, default=lambda: str(uuid.uuid4()))
    cluster_id = Column(Integer, ForeignKey("ps_cluster.id", ondelete="CASCADE"), nullable=False)
    name = Column(String(100), nullable=False)
    sni = Column(String(500), nullable=False)
    cert = Column(Text, nullable=False)
    private_key = Column("key", Text, nullable=False)
    cert_type = Column(String(20), nullable=False, default="server")
    ssl_protocols = Column(Text, nullable=True)
    description = Column(Text, nullable=True)
    gm = Column(Boolean, nullable=False, default=False)
    algorithm = Column(String(16), nullable=True)
    sign_cert = Column(Text, nullable=True)
    sign_key = Column(Text, nullable=True)
    current_version = Column(Integer, nullable=True)
    create_method = Column(String(32), nullable=False, default="upload")
    generate_log = Column(Text, nullable=True)
    status = Column(Integer, nullable=False, default=1)
    created_at = Column(DateTime, nullable=False, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, nullable=False, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))
