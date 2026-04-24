from sqlalchemy import String, Integer, DateTime, ForeignKey, Column
from datetime import datetime
from app.core.database import Base


class User(Base):
    __tablename__ = "sys_user"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String(50), unique=True, nullable=False, index=True)
    password_hash = Column(String(255), nullable=False)
    role = Column(String(20), nullable=False, default="user")
    status = Column(Integer, nullable=False, default=1)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class UserCluster(Base):
    __tablename__ = "sys_user_cluster"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("sys_user.id", ondelete="CASCADE"), nullable=False)
    cluster_id = Column(Integer, ForeignKey("ps_cluster.id", ondelete="CASCADE"), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)