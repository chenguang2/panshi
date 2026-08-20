from app.core.database import Base

# Import models so they are registered with SQLAlchemy metadata
from app.models import cluster, user, system, edge_import, static_resource, ssl, node_task, autostart, db_migration  # noqa: F401

__all__ = ["Base"]