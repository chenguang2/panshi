import os
import secrets
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Optional

from jose import JWTError, jwt
import bcrypt

_PLACEHOLDER_SECRETS = {
    "your-super-secret-key-change-in-production",
    "your-production-secret-key-must-be-changed",
}


def _load_jwt_env_file(path: Path) -> None:
    """从仓库内 env 文件加载 JWT 配置（仅 JWT 相关键，不覆盖已有环境变量）。

    backend/.env.development 与 .env.production 为入库模板（含占位值），真实部署
    应通过环境变量覆盖。此处仅在该文件提供非占位值时生效，避免模板默认值被静默使用。
    只读取 JWT_SECRET_KEY / JWT_EXPIRE_MINUTES，不触碰 DATABASE_URL 等（避免与
    db_config.json 数据库切换机制产生优先级冲突）。
    """
    if not path.exists():
        return
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        key = key.strip()
        if key not in ("JWT_SECRET_KEY", "JWT_EXPIRE_MINUTES"):
            continue
        if key in os.environ:
            continue
        os.environ[key] = value.strip().strip('"').strip("'")


def _is_placeholder(value: str) -> bool:
    return not value or value in _PLACEHOLDER_SECRETS


def _resolve_jwt_secret() -> str:
    """解析 JWT 密钥：显式 env 优先；生产必须显式配置；开发自动生成并持久化。

    密钥同时作为 db_config 的 Fernet 密钥（数据库连接密码加密），因此开发模式
    自动生成的密钥持久化到 gitignored 的 backend/data/.jwt_secret，保证进程
    重启后已加密的数据库密码仍可解密。
    """
    env_mode = os.getenv("APP_ENV", "development")

    explicit = os.getenv("JWT_SECRET_KEY")
    if explicit and not _is_placeholder(explicit):
        return explicit

    if env_mode == "production":
        raise RuntimeError(
            "生产环境（APP_ENV=production）必须通过环境变量 JWT_SECRET_KEY "
            "配置强随机密钥，禁止使用默认/模板占位密钥。"
        )

    key_file = Path(__file__).resolve().parent.parent.parent / "data" / ".jwt_secret"
    if key_file.exists():
        stored = key_file.read_text(encoding="utf-8").strip()
        if stored:
            return stored
    secret = secrets.token_hex(32)
    try:
        key_file.parent.mkdir(parents=True, exist_ok=True)
        key_file.write_text(secret, encoding="utf-8")
        os.chmod(key_file, 0o600)
    except OSError:
        pass  # 无法写入时仅当前进程有效（重启后旧 JWT/加密密码失效，可接受）
    return secret


_load_jwt_env_file(Path(__file__).resolve().parent.parent.parent / f".env.{os.getenv('APP_ENV', 'development')}")

JWT_SECRET_KEY = _resolve_jwt_secret()
JWT_ALGORITHM = "HS256"
JWT_EXPIRE_MINUTES = int(os.getenv("JWT_EXPIRE_MINUTES", "1440"))


def verify_password(plain_password: str, hashed_password: str) -> bool:
    return bcrypt.checkpw(plain_password.encode('utf-8'), hashed_password.encode('utf-8'))


def hash_password(password: str) -> str:
    salt = bcrypt.gensalt()
    return bcrypt.hashpw(password.encode('utf-8'), salt).decode('utf-8')


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.now(timezone.utc) + expires_delta
    else:
        expire = datetime.now(timezone.utc) + timedelta(minutes=JWT_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, JWT_SECRET_KEY, algorithm=JWT_ALGORITHM)
    return encoded_jwt


def decode_access_token(token: str) -> Optional[dict]:
    try:
        payload = jwt.decode(token, JWT_SECRET_KEY, algorithms=[JWT_ALGORITHM])
        return payload
    except JWTError:
        return None


