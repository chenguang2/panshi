"""Database connection configuration management.

Stores the list of known connections (SQLite local + PostgreSQL remote) and the
currently active connection in a file OUTSIDE the database (`db_config.json`,
next to features.yaml in the backend root) so it can be read before any
database engine is available.

Design (see openspec/changes/support-postgres-database/design.md):
- D1: config file lives outside the DB; passwords Fernet-encrypted (key derived
  from JWT_SECRET_KEY); file chmod 600; API output always masks passwords.
- G9: on parse failure, fall back to `.bak`, then to default SQLite.
- Env-var compat: if no config file but DATABASE_URL is set (docker-compose
  legacy), generate the initial config from it on first run.
- Legacy layout: configs written before this file lived at `data/db_config.json`
  are auto-migrated to the new location on startup (ensure_config).
"""

import json
import os
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional

from cryptography.fernet import Fernet, InvalidToken

# ── Paths (overridable in tests) ───────────────────────────────────────────
CONFIG_PATH = "./db_config.json"
CONFIG_BAK_PATH = "./db_config.json.bak"
# Pre-relocation location; auto-migrated to CONFIG_PATH on first startup.
LEGACY_CONFIG_PATH = "./data/db_config.json"
DEFAULT_SQLITE_PATH = "./data/panshi.db"

CONFIG_VERSION = 1
MASKED_PASSWORD = "********"

DEFAULT_ACTIVE_ID = "local_sqlite"

# ── Password encryption ────────────────────────────────────────────────────


def _fernet() -> Fernet:
    """Build a Fernet instance keyed from JWT_SECRET_KEY (stable across runs)."""
    secret = os.getenv("JWT_SECRET_KEY", "your-super-secret-key-change-in-production")
    # Fernet requires a 32-byte urlsafe base64 key; derive deterministically.
    import base64
    import hashlib
    digest = hashlib.sha256(secret.encode("utf-8")).digest()
    key = base64.urlsafe_b64encode(digest)
    return Fernet(key)


def encrypt_password(plain: str) -> str:
    """Encrypt a plaintext password for storage."""
    return _fernet().encrypt(plain.encode("utf-8")).decode("utf-8")


def decrypt_password(token: str) -> str:
    """Decrypt a stored password; returns empty string on failure."""
    try:
        return _fernet().decrypt(token.encode("utf-8")).decode("utf-8")
    except (InvalidToken, Exception):
        return ""


# ── Data model ─────────────────────────────────────────────────────────────


@dataclass
class ConnectionConfig:
    id: str
    type: str  # "sqlite" | "postgres"
    name: str
    # sqlite
    path: Optional[str] = None
    # postgres
    host: Optional[str] = None
    port: Optional[int] = 5432
    database: Optional[str] = None
    username: Optional[str] = None
    password_enc: Optional[str] = None
    ssl: bool = False

    def password_set(self) -> bool:
        return bool(self.password_enc)

    def get_password(self) -> str:
        return decrypt_password(self.password_enc) if self.password_enc else ""

    def display_address(self) -> str:
        if self.type in ("postgres", "postgresql"):
            return f"{self.host}:{self.port}/{self.database}"
        return self.path or ""

    def public_dict(self) -> dict:
        """Serializable view with password masked (never returns ciphertext or plaintext)."""
        return {
            "id": self.id,
            "type": self.type,
            "name": self.name,
            "path": self.path,
            "host": self.host,
            "port": self.port,
            "database": self.database,
            "username": self.username,
            "password_set": self.password_set(),
            "ssl": self.ssl,
            "display_address": self.display_address(),
        }

    def to_storage_dict(self) -> dict:
        return {
            "id": self.id,
            "type": self.type,
            "name": self.name,
            "path": self.path,
            "host": self.host,
            "port": self.port,
            "database": self.database,
            "username": self.username,
            "password_enc": self.password_enc,
            "ssl": self.ssl,
        }

    @classmethod
    def from_dict(cls, data: dict) -> "ConnectionConfig":
        return cls(
            id=data.get("id") or "",
            type=data.get("type", "sqlite"),
            name=data.get("name", "") or "",
            path=data.get("path"),
            host=data.get("host"),
            port=data.get("port", 5432),
            database=data.get("database"),
            username=data.get("username"),
            password_enc=data.get("password_enc"),
            ssl=data.get("ssl", False),
        )


@dataclass
class DbConfig:
    version: int = CONFIG_VERSION
    active: str = DEFAULT_ACTIVE_ID
    connections: list[ConnectionConfig] = field(default_factory=list)

    def get_connection(self, conn_id: str) -> Optional[ConnectionConfig]:
        for c in self.connections:
            if c.id == conn_id:
                return c
        return None

    def get_active(self) -> Optional[ConnectionConfig]:
        return self.get_connection(self.active)

    def to_dict(self) -> dict:
        return {
            "version": self.version,
            "active": self.active,
            "connections": [c.to_storage_dict() for c in self.connections],
        }

    @classmethod
    def from_dict(cls, data: dict) -> "DbConfig":
        conns = [ConnectionConfig.from_dict(c) for c in data.get("connections", [])]
        return cls(
            version=data.get("version", CONFIG_VERSION),
            active=data.get("active", DEFAULT_ACTIVE_ID),
            connections=conns,
        )


def default_config() -> DbConfig:
    """Default config pointing at the local SQLite file."""
    return DbConfig(
        version=CONFIG_VERSION,
        active=DEFAULT_ACTIVE_ID,
        connections=[
            ConnectionConfig(
                id=DEFAULT_ACTIVE_ID,
                type="sqlite",
                name="本地 SQLite",
                path=DEFAULT_SQLITE_PATH,
            )
        ],
    )


def config_from_env(url: str) -> DbConfig:
    """Build a DbConfig from a DATABASE_URL-style URL (legacy env compatibility)."""
    if url.startswith("sqlite"):
        return DbConfig(
            version=CONFIG_VERSION,
            active="local_sqlite",
            connections=[
                ConnectionConfig(id="local_sqlite", type="sqlite", name="本地 SQLite", path="./data/panshi.db")
            ],
        )
    # postgresql://user:pass@host:port/db
    rest = url
    for prefix in ("postgresql://", "postgresql+asyncpg://"):
        if rest.startswith(prefix):
            rest = rest[len(prefix):]
            break
    userinfo, _, hostpart = rest.partition("@")
    if not hostpart:
        # no userinfo
        userinfo, hostpart = "", rest
    username, _, password = userinfo.partition(":")
    host, _, portdb = hostpart.partition(":")
    if "/" in portdb:
        port_str, _, database = portdb.partition("/")
    else:
        port_str, database = portdb, ""
    port = int(port_str) if port_str.isdigit() else 5432
    return DbConfig(
        version=CONFIG_VERSION,
        active="env_pg",
        connections=[
            ConnectionConfig(
                id="env_pg",
                type="postgres",
                name="环境变量 PostgreSQL",
                host=host,
                port=port,
                database=database,
                username=username,
                password_enc=encrypt_password(password) if password else None,
            )
        ],
    )


# ── Load / save ────────────────────────────────────────────────────────────


def load_config(path: Optional[str] = None) -> DbConfig:
    """Load config from *path* (default CONFIG_PATH).

    Corruption / parse failure falls back to `.bak`, then to default SQLite.
    """
    target = path or CONFIG_PATH
    for candidate in (target, CONFIG_BAK_PATH):
        p = Path(candidate)
        if not p.exists():
            continue
        try:
            data = json.loads(p.read_text(encoding="utf-8"))
            return DbConfig.from_dict(data)
        except Exception:
            continue
    return default_config()


def save_config(cfg: DbConfig, path: Optional[str] = None) -> None:
    """Write config atomically (tmp + rename) and set chmod 600."""
    target = Path(path or CONFIG_PATH)
    target.parent.mkdir(parents=True, exist_ok=True)
    tmp = target.with_suffix(target.suffix + ".tmp")
    tmp.write_text(json.dumps(cfg.to_dict(), ensure_ascii=False, indent=2), encoding="utf-8")
    os.chmod(tmp, 0o600)
    tmp.replace(target)


def backup_current_config(path: Optional[str] = None) -> Optional[str]:
    """Copy current config to `.bak` (for rollback). Returns bak path or None."""
    target = Path(path or CONFIG_PATH)
    if not target.exists():
        return None
    bak = Path(CONFIG_BAK_PATH)
    bak.parent.mkdir(parents=True, exist_ok=True)
    bak.write_text(target.read_text(encoding="utf-8"), encoding="utf-8")
    os.chmod(bak, 0o600)
    return str(bak)


def _migrate_legacy_config(target: Path) -> None:
    """One-time migration: copy legacy `data/db_config.json` to *target*.

    Runs only when the new-location file does not exist yet. The legacy file is
    kept in place (harmless leftover) so a rollback of the code keeps working.
    """
    legacy = Path(LEGACY_CONFIG_PATH)
    if target.exists() or not legacy.exists():
        return
    try:
        data = json.loads(legacy.read_text(encoding="utf-8"))
        save_config(DbConfig.from_dict(data), path=str(target))
    except Exception:
        # Corrupt legacy file → ignore, default init takes over below.
        pass


def ensure_config(path: Optional[str] = None) -> DbConfig:
    """Ensure a config file exists; init from DATABASE_URL env if missing. Returns active config."""
    target = Path(path or CONFIG_PATH)
    if not target.exists():
        _migrate_legacy_config(target)
    if target.exists():
        return load_config(path=path)
    env_url = os.getenv("DATABASE_URL")
    if env_url:
        cfg = config_from_env(env_url)
    else:
        cfg = default_config()
    save_config(cfg, path=path)
    return cfg


# ── URL building ───────────────────────────────────────────────────────────


def build_engine_url(conn: ConnectionConfig) -> str:
    """Build a SQLAlchemy sync engine URL for a connection."""
    if conn.type in ("postgres", "postgresql"):
        pw = conn.get_password()
        cred = f"{conn.username}:{pw}@" if conn.username else ""
        return f"postgresql://{cred}{conn.host}:{conn.port or 5432}/{conn.database}"
    return f"sqlite:///{conn.path}"


def build_async_engine_url(conn: ConnectionConfig) -> str:
    """Build a SQLAlchemy async engine URL for a connection."""
    if conn.type in ("postgres", "postgresql"):
        return build_engine_url(conn).replace("postgresql://", "postgresql+asyncpg://", 1)
    return build_engine_url(conn).replace("sqlite:///", "sqlite+aiosqlite:///", 1)
