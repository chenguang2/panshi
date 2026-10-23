"""ssl 域孤儿版本清理（ssl-version-orphan-purge，design D2）。

背景：ssl 删除端点曾漏「删除时清版本」（全仓唯一），删除证书留下的版本孤儿
经 SQLite id 复用被新证书继承（uapm 案例：7 月 gm-server 的 v1 挂到今天的 uapm 上）。

purge_orphan_ssl_versions：删除「created_at 早于所属证书 created_at」的 ssl 版本快照。
判定精确无启发式：id 复用产生的孤儿必然早于当前证书出生；同代快照（含回滚事故的
异名快照）是真实发布历史，不在此清理，异代可见化由前端版本弹窗负责。
幂等、双方言（SQLAlchemy core join-delete）。
"""
from __future__ import annotations

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.cluster import ConfigVersion
from app.models.ssl import SslCertificate


async def purge_orphan_ssl_versions(db: AsyncSession) -> int:
    """清理 ssl 域孤儿版本，返回删除行数。

    孤儿判定：版本 created_at 早于其 resource_id 指向证书的 created_at
    （id 复用「改嫁」的快照必然早于新证书出生）。
    """
    subq = (
        select(ConfigVersion.id)
        .join(SslCertificate, ConfigVersion.resource_id == SslCertificate.id)
        .where(
            ConfigVersion.resource_type == "ssl",
            ConfigVersion.created_at < SslCertificate.created_at,
        )
        .subquery()
    )
    result = await db.execute(delete(ConfigVersion).where(ConfigVersion.id.in_(select(subq))))
    await db.commit()
    return int(result.rowcount or 0)
