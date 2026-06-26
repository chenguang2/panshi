from sqlalchemy import String, Integer, DateTime, Text, ForeignKey, Column
from datetime import datetime
from app.core.database import Base


class ImportLog(Base):
    __tablename__ = "ps_import_log"

    id = Column(Integer, primary_key=True, index=True)
    cluster_id = Column(Integer, ForeignKey("ps_cluster.id", ondelete="CASCADE"), nullable=False)
    node_ip = Column(String(50), nullable=False)
    node_port = Column(Integer, nullable=False)
    edge_path = Column(String(255), nullable=True)
    status = Column(String(20), nullable=False, default="success")  # success / partial / failed
    upstream_count = Column(Integer, default=0)
    route_count = Column(Integer, default=0)
    plugin_config_count = Column(Integer, default=0)
    global_rule_count = Column(Integer, default=0)
    known_plugin_count = Column(Integer, default=0)
    unknown_plugin_count = Column(Integer, default=0)
    unknown_plugin_names = Column(Text, nullable=True)  # JSON array
    conflict_details = Column(Text, nullable=True)  # JSON array
    error_message = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
