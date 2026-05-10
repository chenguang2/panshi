from sqlalchemy import String, Integer, DateTime, Text, Column
from datetime import datetime
from app.core.database import Base


class AuditLog(Base):
    __tablename__ = "sys_audit_log"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, nullable=True)
    username = Column(String(50), nullable=True)
    action = Column(String(50), nullable=False)
    resource = Column(String(100), nullable=True)
    resource_id = Column(Integer, nullable=True)
    detail = Column(Text, nullable=True)
    ip_address = Column(String(50), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)


