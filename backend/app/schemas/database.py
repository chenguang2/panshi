"""Pydantic schemas for database management API."""

from typing import Optional

from pydantic import BaseModel, Field


class ConnectionCreate(BaseModel):
    type: str = Field(...)  # "sqlite" | "postgres"
    name: str = Field(..., min_length=1, max_length=100)
    # sqlite
    path: Optional[str] = None
    # postgres
    host: Optional[str] = None
    port: Optional[int] = 5432
    database: Optional[str] = None
    username: Optional[str] = None
    password: Optional[str] = None
    ssl: bool = False


class ConnectionUpdate(BaseModel):
    name: Optional[str] = None
    path: Optional[str] = None
    host: Optional[str] = None
    port: Optional[int] = None
    database: Optional[str] = None
    username: Optional[str] = None
    # If provided, updates the stored password; if None, keeps existing.
    password: Optional[str] = None
    ssl: Optional[bool] = None


class SwitchRequest(BaseModel):
    connection_id: str = Field(...)


class MigrateRequest(BaseModel):
    source_id: str = Field(...)
    target_id: str = Field(...)
    mode: str = Field(default="replace")
    include_logs: bool = True
    confirmed_clear: bool = False  # G1: non-empty target requires confirmation


class ExportRequest(BaseModel):
    source_id: str = Field(...)


class ImportRequest(BaseModel):
    archive_path: str = Field(...)
    target_id: str = Field(...)
    confirmed_clear: bool = False
