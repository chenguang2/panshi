from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.user import User
from app.core.security import hash_password


async def seed_data(db: AsyncSession):
    """Initialize default admin user."""
    existing_admin = await db.execute(
        select(User).where(User.username == "admin")
    )
    if not existing_admin.scalar_one_or_none():
        admin_user = User(
            username="admin",
            password_hash=hash_password("panshi123"),
            role="admin",
            status=1
        )
        db.add(admin_user)
        await db.commit()


async def seed_admin(db: AsyncSession):
    result = await db.execute(select(User).where(User.username == "admin"))
    if not result.scalar_one_or_none():
        admin = User(
            username="admin",
            password_hash=hash_password("panshi123"),
            role="admin",
            status=1
        )
        db.add(admin)
        await db.commit()