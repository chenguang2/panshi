from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import List

from app.core.database import get_db
from app.models.cluster import Route, RoutePlugin
from app.models.system import AuditLog
from app.schemas.route import RouteCreate, RouteUpdate, RouteResponse, RouteListResponse, PluginUpdateRequest

router = APIRouter(prefix="/clusters/{cluster_id}/routes", tags=["routes"])


@router.get("", response_model=RouteListResponse)
async def list_routes(cluster_id: int, db: AsyncSession = Depends(get_db)):
    query = select(Route).where(Route.cluster_id == cluster_id)
    result = await db.execute(query)
    routes = result.scalars().all()
    return RouteListResponse(total=len(routes), items=[RouteResponse.model_validate(r) for r in routes])


@router.post("", response_model=RouteResponse, status_code=status.HTTP_201_CREATED)
async def create_route(cluster_id: int, route: RouteCreate, db: AsyncSession = Depends(get_db)):
    db_route = Route(cluster_id=cluster_id, **route.model_dump())
    db.add(db_route)
    await db.commit()
    await db.refresh(db_route)
    
    audit = AuditLog(
        user_id=None,
        username="system",
        action="create_route",
        resource="route",
        resource_id=db_route.id,
        detail=f"Created route {db_route.name}"
    )
    db.add(audit)
    await db.commit()
    
    return RouteResponse.model_validate(db_route)


@router.get("/{route_id}", response_model=RouteResponse)
async def get_route(cluster_id: int, route_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Route).where(Route.id == route_id, Route.cluster_id == cluster_id))
    route = result.scalar_one_or_none()
    if not route:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="路由不存在")
    return RouteResponse.model_validate(route)


@router.put("/{route_id}", response_model=RouteResponse)
async def update_route(cluster_id: int, route_id: int, route_update: RouteUpdate, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Route).where(Route.id == route_id, Route.cluster_id == cluster_id))
    route = result.scalar_one_or_none()
    if not route:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="路由不存在")
    
    for key, value in route_update.model_dump(exclude_unset=True).items():
        setattr(route, key, value)
    
    await db.commit()
    await db.refresh(route)
    
    audit = AuditLog(
        user_id=None,
        username="system",
        action="update_route",
        resource="route",
        resource_id=route.id,
        detail=f"Updated route {route.name}"
    )
    db.add(audit)
    await db.commit()
    
    return RouteResponse.model_validate(route)


@router.delete("/{route_id}")
async def delete_route(cluster_id: int, route_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Route).where(Route.id == route_id, Route.cluster_id == cluster_id))
    route = result.scalar_one_or_none()
    if not route:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="路由不存在")
    
    await db.delete(route)
    await db.commit()
    return {"message": "路由已删除"}


@router.post("/{route_id}/publish")
async def publish_route(cluster_id: int, route_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Route).where(Route.id == route_id, Route.cluster_id == cluster_id))
    route = result.scalar_one_or_none()
    if not route:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="路由不存在")
    
    return {"status": "ok", "message": f"路由 {route_id} 发布成功"}


@router.post("/publish")
async def publish_all_routes(cluster_id: int, db: AsyncSession = Depends(get_db)):
    query = select(Route).where(Route.cluster_id == cluster_id, Route.status == 1)
    result = await db.execute(query)
    routes = result.scalars().all()
    
    return {"status": "ok", "message": f"{len(routes)} 条路由发布成功"}


@router.get("/{route_id}/plugins")
async def get_route_plugins(cluster_id: int, route_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(RoutePlugin).where(RoutePlugin.route_id == route_id))
    plugins = result.scalars().all()
    return {"plugins": [{"plugin_name": p.plugin_name, "config": p.config} for p in plugins]}


@router.put("/{route_id}/plugins")
async def update_route_plugins(cluster_id: int, route_id: int, request: PluginUpdateRequest, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Route).where(Route.id == route_id, Route.cluster_id == cluster_id))
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="路由不存在")
    
    await db.execute(RoutePlugin.__table__.delete().where(RoutePlugin.route_id == route_id))
    
    for plugin in request.plugins:
        db_plugin = RoutePlugin(route_id=route_id, plugin_name=plugin.plugin_name, config=plugin.config)
        db.add(db_plugin)
    
    await db.commit()
    return {"message": "插件配置已更新"}


@router.get("/{route_id}/history")
async def get_route_history(cluster_id: int, route_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(AuditLog).where(
            AuditLog.resource == "route",
            AuditLog.resource_id == route_id
        ).order_by(AuditLog.created_at.desc())
    )
    logs = result.scalars().all()
    return {"items": [{"id": log.id, "action": log.action, "detail": log.detail, "created_at": str(log.created_at)} for log in logs]}


@router.post("/{route_id}/rollback")
async def rollback_route(cluster_id: int, route_id: int, version: int = None, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Route).where(Route.id == route_id, Route.cluster_id == cluster_id))
    route = result.scalar_one_or_none()
    if not route:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="路由不存在")
    
    return {"status": "ok", "message": f"路由 {route_id} 回滚成功"}