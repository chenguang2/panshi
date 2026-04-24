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


class SysDictType(Base):
    __tablename__ = "sys_dict_type"

    id = Column(Integer, primary_key=True, index=True)
    code = Column(String(50), unique=True, nullable=False, index=True)
    name = Column(String(100), nullable=False)
    description = Column(String(255), nullable=True)
    status = Column(Integer, nullable=False, default=1)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class SysDictData(Base):
    __tablename__ = "sys_dict_data"

    id = Column(Integer, primary_key=True, index=True)
    type_id = Column(Integer, nullable=False)
    label = Column(String(100), nullable=False)
    value = Column(String(100), nullable=False)
    sort = Column(Integer, nullable=False, default=0)
    status = Column(Integer, nullable=False, default=1)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)