from app.core.database import Base

# Import models so they are registered with SQLAlchemy metadata
from app.models import cluster, user, system, edge_import, static_resource  # noqa: F401

__all__ = ["Base"]