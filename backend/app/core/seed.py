from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.user import User
from app.core.security import hash_password
from app.models.system import SysDictType, SysDictData


SEED_DICTIONARY_TYPES = [
    {"code": "http_method", "name": "HTTP Method", "description": "HTTP request methods"},
    {"code": "load_balance", "name": "Load Balance", "description": "Load balancing algorithms"},
    {"code": "plugin_type", "name": "Plugin Type", "description": "APISIX plugin types"},
]


SEED_DICTIONARY_DATA = {
    "http_method": [
        {"label": "GET", "value": "GET", "sort": 1},
        {"label": "POST", "value": "POST", "sort": 2},
        {"label": "PUT", "value": "PUT", "sort": 3},
        {"label": "DELETE", "value": "DELETE", "sort": 4},
        {"label": "PATCH", "value": "PATCH", "sort": 5},
        {"label": "HEAD", "value": "HEAD", "sort": 6},
        {"label": "OPTIONS", "value": "OPTIONS", "sort": 7},
    ],
    "load_balance": [
        {"label": "加权轮询", "value": "weighted_roundrobin", "sort": 1},
        {"label": "一致性哈希", "value": "chash", "sort": 2},
    ],
    "plugin_type": [
        {"label": "Authentication", "value": "auth", "sort": 1},
        {"label": "Rate Limiting", "value": "rate_limit", "sort": 2},
        {"label": "Security", "value": "security", "sort": 3},
        {"label": "Transformation", "value": "transformation", "sort": 4},
    ],
}


async def seed_data(db: AsyncSession):
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

    for dtype_data in SEED_DICTIONARY_TYPES:
        existing_type = await db.execute(
            select(SysDictType).where(SysDictType.code == dtype_data["code"])
        )
        if not existing_type.scalar_one_or_none():
            dtype = SysDictType(**dtype_data)
            db.add(dtype)
            await db.flush()

            datas = SEED_DICTIONARY_DATA.get(dtype_data["code"], [])
            for data in datas:
                dict_data = SysDictData(type_id=dtype.id, **data)
                db.add(dict_data)

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