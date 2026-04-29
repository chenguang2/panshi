from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from typing import List, Optional
import json

from app.core.database import get_db
from app.models.cluster import ClusterPluginMetadata, PluginMetadataVersion
from app.models.system import AuditLog

router = APIRouter(prefix="/clusters/{cluster_id}/plugin-metadata", tags=["plugin-metadata"])


@router.get("")
async def list_plugin_metadata(
    cluster_id: int,
    db: AsyncSession = Depends(get_db)
):
    """获取该集群所有已配置的插件 metadata"""
    result = await db.execute(
        select(ClusterPluginMetadata).where(ClusterPluginMetadata.cluster_id == cluster_id)
    )
    items = result.scalars().all()

    return {
        "total": len(items),
        "items": [
            {
                "id": item.id,
                "cluster_id": item.cluster_id,
                "plugin_name": item.plugin_name,
                "metadata": json.loads(item.config_data) if item.config_data else {},
                "version": item.version,
                "is_published": bool(item.is_published),
                "created_at": item.created_at.isoformat() if item.created_at else None,
                "updated_at": item.updated_at.isoformat() if item.updated_at else None
            }
            for item in items
        ]
    }


@router.post("")
async def create_plugin_metadata(
    cluster_id: int,
    plugin_name: str = Query(..., description="插件名称"),
    db: AsyncSession = Depends(get_db)
):
    """添加插件的 metadata 配置（初始为空对象）"""
    # 检查是否已存在
    existing = await db.execute(
        select(ClusterPluginMetadata).where(
            ClusterPluginMetadata.cluster_id == cluster_id,
            ClusterPluginMetadata.plugin_name == plugin_name
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="该插件已配置")

    # 创建新记录
    db_item = ClusterPluginMetadata(
        cluster_id=cluster_id,
        plugin_name=plugin_name,
        config_data="{}",
        version=1,
        is_published=0
    )
    db.add(db_item)
    await db.commit()
    await db.refresh(db_item)

    return {
        "id": db_item.id,
        "cluster_id": db_item.cluster_id,
        "plugin_name": db_item.plugin_name,
        "metadata": {},
        "version": db_item.version,
        "is_published": bool(db_item.is_published)
    }


@router.put("/{plugin_name}")
async def update_plugin_metadata(
    cluster_id: int,
    plugin_name: str,
    metadata: dict,
    db: AsyncSession = Depends(get_db)
):
    """更新插件的 metadata（不产生版本记录）"""
    result = await db.execute(
        select(ClusterPluginMetadata).where(
            ClusterPluginMetadata.cluster_id == cluster_id,
            ClusterPluginMetadata.plugin_name == plugin_name
        )
    )
    db_item = result.scalar_one_or_none()
    if not db_item:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="插件配置不存在")

    # 更新配置，但不增加版本号（版本只在发布时增加）
    db_item.config_data = json.dumps(metadata)
    db_item.is_published = 0  # 标记为未发布

    await db.commit()
    await db.refresh(db_item)

    return {
        "id": db_item.id,
        "cluster_id": db_item.cluster_id,
        "plugin_name": db_item.plugin_name,
        "metadata": metadata,
        "version": db_item.version,
        "is_published": bool(db_item.is_published)
    }


@router.delete("/{plugin_name}")
async def reset_plugin_metadata(
    cluster_id: int,
    plugin_name: str,
    db: AsyncSession = Depends(get_db)
):
    """重置插件的 metadata 为默认（删除配置）"""
    result = await db.execute(
        select(ClusterPluginMetadata).where(
            ClusterPluginMetadata.cluster_id == cluster_id,
            ClusterPluginMetadata.plugin_name == plugin_name
        )
    )
    db_item = result.scalar_one_or_none()
    if not db_item:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="插件配置不存在")

    new_version = db_item.version + 1

    # 记录版本历史
    version_record = PluginMetadataVersion(
        cluster_plugin_metadata_id=db_item.id,
        config_data="{}",
        version=new_version,
        action="reset"
    )
    db.add(version_record)

    # 重置配置
    db_item.config_data = "{}"
    db_item.version = new_version
    db_item.is_published = 0

    await db.commit()

    return {"message": f"插件 {plugin_name} 已重置为默认"}


@router.post("/{plugin_name}/publish")
async def publish_plugin_metadata(
    cluster_id: int,
    plugin_name: str,
    db: AsyncSession = Depends(get_db)
):
    """发布插件 metadata 到 APISIX"""
    result = await db.execute(
        select(ClusterPluginMetadata).where(
            ClusterPluginMetadata.cluster_id == cluster_id,
            ClusterPluginMetadata.plugin_name == plugin_name
        )
    )
    db_item = result.scalar_one_or_none()
    if not db_item:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="插件配置不存在")

    # 获取已有版本记录，计算新版本号
    versions_result = await db.execute(
        select(PluginMetadataVersion).where(
            PluginMetadataVersion.cluster_plugin_metadata_id == db_item.id
        ).order_by(PluginMetadataVersion.version.desc())
    )
    existing_versions = versions_result.scalars().all()
    max_version = existing_versions[0].version if existing_versions else 0

    if not existing_versions:
        new_version = 1
    else:
        new_version = max_version + 1

    version_record = PluginMetadataVersion(
        cluster_plugin_metadata_id=db_item.id,
        config_data=db_item.config_data,
        version=new_version,
        action="publish"
    )
    db.add(version_record)

    db_item.version = new_version
    db_item.is_published = 1
    await db.commit()
    await db.refresh(db_item)

    return {"message": f"插件 {plugin_name} 已发布", "version": new_version}


@router.get("/{plugin_name}/versions")
async def get_plugin_metadata_versions(
    cluster_id: int,
    plugin_name: str,
    db: AsyncSession = Depends(get_db)
):
    """获取插件 metadata 的版本历史"""
    result = await db.execute(
        select(ClusterPluginMetadata).where(
            ClusterPluginMetadata.cluster_id == cluster_id,
            ClusterPluginMetadata.plugin_name == plugin_name
        )
    )
    db_item = result.scalar_one_or_none()
    if not db_item:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="插件配置不存在")

    # 获取版本历史
    versions_result = await db.execute(
        select(PluginMetadataVersion).where(
            PluginMetadataVersion.cluster_plugin_metadata_id == db_item.id
        ).order_by(PluginMetadataVersion.version.desc())
    )
    versions = versions_result.scalars().all()

    return {
        "total": len(versions),
        "items": [
            {
                "id": v.id,
                "version": v.version,
                "metadata": json.loads(v.config_data) if v.config_data else {},
                "action": v.action,
                "created_at": v.created_at.isoformat() if v.created_at else None
            }
            for v in versions
        ],
        "current_version": db_item.version
    }


@router.post("/{plugin_name}/rollback/{version}")
async def rollback_plugin_metadata(
    cluster_id: int,
    plugin_name: str,
    version: int,
    db: AsyncSession = Depends(get_db)
):
    """回滚插件 metadata 到指定版本（不发布）"""
    result = await db.execute(
        select(ClusterPluginMetadata).where(
            ClusterPluginMetadata.cluster_id == cluster_id,
            ClusterPluginMetadata.plugin_name == plugin_name
        )
    )
    db_item = result.scalar_one_or_none()
    if not db_item:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="插件配置不存在")

    target_result = await db.execute(
        select(PluginMetadataVersion).where(
            PluginMetadataVersion.cluster_plugin_metadata_id == db_item.id,
            PluginMetadataVersion.version == version
        )
    )
    target_version = target_result.scalar_one_or_none()
    if not target_version:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="指定版本不存在")

    db_item.config_data = target_version.config_data
    db_item.version = version
    db_item.is_published = 0

    await db.commit()
    await db.refresh(db_item)

    return {
        "message": f"插件 {plugin_name} 已回滚到版本 v{version}",
        "version": version
    }


@router.post("/{plugin_name}/switch-version/{version}")
async def switch_version_and_publish(
    cluster_id: int,
    plugin_name: str,
    version: int,
    db: AsyncSession = Depends(get_db)
):
    """切换到指定版本并发布（不生成新版本记录）"""
    result = await db.execute(
        select(ClusterPluginMetadata).where(
            ClusterPluginMetadata.cluster_id == cluster_id,
            ClusterPluginMetadata.plugin_name == plugin_name
        )
    )
    db_item = result.scalar_one_or_none()
    if not db_item:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="插件配置不存在")

    target_result = await db.execute(
        select(PluginMetadataVersion).where(
            PluginMetadataVersion.cluster_plugin_metadata_id == db_item.id,
            PluginMetadataVersion.version == version
        )
    )
    target_version = target_result.scalar_one_or_none()
    if not target_version:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="指定版本不存在")

    db_item.config_data = target_version.config_data
    db_item.version = version
    db_item.is_published = 1

    await db.commit()
    await db.refresh(db_item)

    return {
        "message": f"插件 {plugin_name} 已切换到版本 v{version} 并发布",
        "version": version
    }


@router.delete("/{plugin_name}/record")
async def hard_delete_plugin_metadata(
    cluster_id: int,
    plugin_name: str,
    db: AsyncSession = Depends(get_db)
):
    """彻底删除插件配置记录（包括所有版本历史）"""
    result = await db.execute(
        select(ClusterPluginMetadata).where(
            ClusterPluginMetadata.cluster_id == cluster_id,
            ClusterPluginMetadata.plugin_name == plugin_name
        )
    )
    db_item = result.scalar_one_or_none()
    if not db_item:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="插件配置不存在")

    versions_result = await db.execute(
        select(PluginMetadataVersion).where(
            PluginMetadataVersion.cluster_plugin_metadata_id == db_item.id
        )
    )
    for v in versions_result.scalars().all():
        await db.delete(v)

    await db.delete(db_item)
    await db.commit()

    return {"message": f"插件 {plugin_name} 已彻底删除"}


@router.delete("/{plugin_name}/versions/{version}")
async def delete_plugin_metadata_version(
    cluster_id: int,
    plugin_name: str,
    version: int,
    db: AsyncSession = Depends(get_db)
):
    """删除插件的特定版本记录"""
    result = await db.execute(
        select(ClusterPluginMetadata).where(
            ClusterPluginMetadata.cluster_id == cluster_id,
            ClusterPluginMetadata.plugin_name == plugin_name
        )
    )
    db_item = result.scalar_one_or_none()
    if not db_item:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="插件配置不存在")

    version_result = await db.execute(
        select(PluginMetadataVersion).where(
            PluginMetadataVersion.cluster_plugin_metadata_id == db_item.id,
            PluginMetadataVersion.version == version
        )
    )
    version_record = version_result.scalar_one_or_none()
    if not version_record:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="指定版本不存在")

    if db_item.version == version:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="无法删除当前版本")

    await db.delete(version_record)
    await db.commit()

    return {"message": f"版本 v{version} 已删除"}
