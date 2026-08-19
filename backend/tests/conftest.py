import pytest
import asyncio
from sqlalchemy import event
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from app.core.database import Base
from app.models.cluster import Cluster

TEST_DATABASE_URL = "sqlite+aiosqlite:///:memory:"

# Minimal parent rows inserted into every test DB so child records referencing
# these ids pass the FK checks enabled by PRAGMA foreign_keys=ON below.
# Many model-level tests create e.g. SslCertificate/Route/Upstream/StreamProxy
# with a hardcoded cluster_id but never create the parent Cluster row.
# Upstream rows are intentionally NOT seeded: tests that reference an upstream
# create their own (e.g. test_route_with_upstream_reference), keeping the DB
# empty of seed data so count-based assertions in import tests stay valid.
SEED_CLUSTER_IDS = (1, 2, 3)

def _enable_sqlite_fk(dbapi_conn, record):
    cursor = dbapi_conn.cursor()
    cursor.execute("PRAGMA foreign_keys=ON")
    cursor.close()

@pytest.fixture(scope="session")
def event_loop():
    loop = asyncio.get_event_loop_policy().new_event_loop()
    yield loop
    loop.close()

@pytest.fixture(scope="function")
async def test_db():
    engine = create_async_engine(TEST_DATABASE_URL, echo=False)
    event.listen(engine.sync_engine, "connect", _enable_sqlite_fk)

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    async_session = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async with async_session() as session:
        for cid in SEED_CLUSTER_IDS:
            existing = await session.get(Cluster, cid)
            if existing is None:
                session.add(Cluster(id=cid, name=f"seed-cluster-{cid}"))
        await session.commit()
        yield session

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)

    await engine.dispose()
