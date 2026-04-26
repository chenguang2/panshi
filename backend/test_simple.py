import sys
sys.path.insert(0, r'\\wsl.localhost\Ubuntu-24.04\home\qcg\project\test-03\backend')

import asyncio
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from app.core.database import Base
from app.models.cluster import Route

async def run_tests():
    engine = create_async_engine("sqlite+aiosqlite:///:memory:", echo=False)

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    async_session = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async with async_session() as session:
        r = Route(
            cluster_id=1,
            name="test-route",
            uri="/api/*",
            priority=0,
            vars=None,
            status=1
        )
        session.add(r)
        await session.commit()
        await session.refresh(r)

        print(f"Created route id={r.id}, priority={r.priority}, vars={r.vars}")

        r.priority = 12
        await session.commit()

        print(f"Updated priority to {r.priority}")

        r.vars = '[["header", "Host", "==", "example.com"]]'
        await session.commit()

        print(f"Updated vars to {r.vars}")

        r.priority = 0
        r.vars = None
        await session.commit()
        await session.refresh(r)

        print(f"After disable - priority={r.priority}, vars={r.vars}")

        if r.priority == 0 and r.vars is None:
            print("PASS: Advanced match disabled correctly")
        else:
            print("FAIL: Advanced match not disabled")

    await engine.dispose()

asyncio.run(run_tests())