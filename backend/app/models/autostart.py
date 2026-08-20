"""Node autostart status & command audit model."""

from datetime import datetime

from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey, UniqueConstraint
from app.core.database import Base


class NodeAutostart(Base):
    """Per-node autostart status and last-operation audit (one row per node)."""

    __tablename__ = "ps_node_autostart"
    __table_args__ = (UniqueConstraint("node_id", name="uq_node_autostart_node"),)

    id = Column(Integer, primary_key=True, autoincrement=True)
    node_id = Column(Integer, ForeignKey("ps_node.id", ondelete="CASCADE"), nullable=False)
    cluster_id = Column(Integer, ForeignKey("ps_cluster.id", ondelete="CASCADE"), nullable=False)
    status = Column(String(32), nullable=False, default="unknown")
    action = Column(String(16), nullable=False, default="status")
    # Sanitized command (password masked); never store raw root password.
    command = Column(Text, nullable=True)
    rc = Column(Integer, nullable=True)
    updated_at = Column(DateTime, nullable=False, default=lambda: datetime.utcnow(), onupdate=lambda: datetime.utcnow())
