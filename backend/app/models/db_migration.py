"""Database migration history model.

Records each migration/export/import operation for admin traceability.
Design (see openspec/changes/support-postgres-database/design.md):
- G3: this table is operational metadata and is EXCLUDED from data migration.
- Stored in the active database's ps_db_migration_log table.
"""

from datetime import datetime

from sqlalchemy import Column, DateTime, Integer, String, Text

from app.core.database import Base


class DbMigrationLog(Base):
    __tablename__ = "ps_db_migration_log"

    id = Column(Integer, primary_key=True, index=True)
    direction = Column(String(50), nullable=False)  # sqlite_to_postgres / postgres_to_sqlite / ...
    source_connection = Column(String(100), nullable=False)
    target_connection = Column(String(100), nullable=False)
    mode = Column(String(20), nullable=False, default="replace")
    status = Column(String(20), nullable=False, default="success")  # success / failed / running
    include_logs = Column(Integer, nullable=False, default=1)
    tables_count = Column(Integer, nullable=True)
    backup_path = Column(String(500), nullable=True)
    error_message = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
