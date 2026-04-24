from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.database import get_db
from app.models.system import SysDictType, SysDictData
from app.schemas.dict import (
    DictTypeCreate, DictTypeUpdate, DictTypeResponse,
    DictDataCreate, DictDataUpdate, DictDataResponse
)

router = APIRouter(prefix="/dict", tags=["dictionary"])


@router.get("/types", response_model=dict)
async def list_dict_types(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(SysDictType).order_by(SysDictType.id))
    types = result.scalars().all()
    return {"total": len(types), "items": [DictTypeResponse.model_validate(t) for t in types]}


@router.post("/types", status_code=status.HTTP_201_CREATED)
async def create_dict_type(dtype: DictTypeCreate, db: AsyncSession = Depends(get_db)):
    db_type = SysDictType(**dtype.model_dump())
    db.add(db_type)
    await db.commit()
    await db.refresh(db_type)
    return DictTypeResponse.model_validate(db_type)


@router.put("/types/{type_id}", response_model=DictTypeResponse)
async def update_dict_type(type_id: int, dtype_update: DictTypeUpdate, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(SysDictType).where(SysDictType.id == type_id))
    dtype = result.scalar_one_or_none()
    if not dtype:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="字典类型不存在")
    
    for key, value in dtype_update.model_dump(exclude_unset=True).items():
        setattr(dtype, key, value)
    
    await db.commit()
    await db.refresh(dtype)
    return DictTypeResponse.model_validate(dtype)


@router.delete("/types/{type_id}")
async def delete_dict_type(type_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(SysDictType).where(SysDictType.id == type_id))
    dtype = result.scalar_one_or_none()
    if not dtype:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="字典类型不存在")
    
    await db.delete(dtype)
    await db.commit()
    return {"message": "字典类型已删除"}


@router.get("/types/{type_id}/datas", response_model=dict)
async def list_dict_datas(type_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(SysDictData).where(SysDictData.type_id == type_id).order_by(SysDictData.sort)
    )
    datas = result.scalars().all()
    return {"total": len(datas), "items": [DictDataResponse.model_validate(d) for d in datas]}


@router.post("/datas", status_code=status.HTTP_201_CREATED)
async def create_dict_data(data: DictDataCreate, db: AsyncSession = Depends(get_db)):
    db_data = SysDictData(**data.model_dump())
    db.add(db_data)
    await db.commit()
    await db.refresh(db_data)
    return DictDataResponse.model_validate(db_data)


@router.put("/datas/{data_id}", response_model=DictDataResponse)
async def update_dict_data(data_id: int, data_update: DictDataUpdate, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(SysDictData).where(SysDictData.id == data_id))
    data = result.scalar_one_or_none()
    if not data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="字典数据不存在")
    
    for key, value in data_update.model_dump(exclude_unset=True).items():
        setattr(data, key, value)
    
    await db.commit()
    await db.refresh(data)
    return DictDataResponse.model_validate(data)


@router.delete("/datas/{data_id}")
async def delete_dict_data(data_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(SysDictData).where(SysDictData.id == data_id))
    data = result.scalar_one_or_none()
    if not data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="字典数据不存在")
    
    await db.delete(data)
    await db.commit()
    return {"message": "字典数据已删除"}


@router.get("/datas/{code}", response_model=dict)
async def get_dict_data_by_code(code: str, db: AsyncSession = Depends(get_db)):
    type_result = await db.execute(select(SysDictType).where(SysDictType.code == code))
    dtype = type_result.scalar_one_or_none()
    if not dtype:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="字典类型不存在")
    
    result = await db.execute(
        select(SysDictData).where(SysDictData.type_id == dtype.id, SysDictData.status == 1).order_by(SysDictData.sort)
    )
    datas = result.scalars().all()
    return {"total": len(datas), "items": [DictDataResponse.model_validate(d) for d in datas]}