"""JWT 密钥解析链守卫（B2-NEW-01，规则 #20）。

四级链路（app/core/security.py::_resolve_jwt_secret）：
  ① 显式环境变量 JWT_SECRET_KEY（非占位值）→ 直接采用；
  ② 仅 `.env.<APP_ENV>` 提供非占位值（import 期经 _load_jwt_env_file 装入 env）→ 采用；
  ③ APP_ENV=production 且无任何非占位配置 → RuntimeError（fail-fast，拒绝占位密钥上线）;
  ④ 开发态无配置 → secrets.token_hex(32) 自动生成并持久化 backend/data/.jwt_secret（0600），
     二次解析复用同值。

⚠️ 安全红线：该密钥**兼任 db_config 的 Fernet 库密钥**（数据库连接密码加密）——
换 key 即已存密码不可解，因此 ④ 的持久化/复用语义是正确性要求而非优化。
同时它是 JWT 签名密钥：占位值上线等于签名可伪造，③ 的 fail-fast 是 P0 安全要求。

隔离策略：真实 backend/data/.jwt_secret 由常驻 dev 服务使用，本文件**绝不读写**。
_resolve_jwt_secret 的持久化路径由模块全局 ``__file__`` 推导
（Path(__file__).resolve().parent.parent.parent / "data" / ".jwt_secret"），
故用 monkeypatch.setattr(security, "__file__", <tmp 树内路径>) 把 data 目录整体
重定向到 tmp_path——路径可注入，无需修改产品代码。
"""

import importlib.util
import shutil
import stat
from pathlib import Path
from uuid import uuid4

import pytest

from app.core import security

# 真实源文件与真实密钥文件路径（只用于断言"未触碰"，绝不 open）
_REAL_SECURITY_SRC = Path(security.__file__).resolve()
REAL_KEY_FILE = _REAL_SECURITY_SRC.parent.parent.parent / "data" / ".jwt_secret"

# 实现内的占位值判定：空串或命中模板占位集合（与 security._PLACEHOLDER_SECRETS 对齐）
PLACEHOLDER_SAMPLES = ["", *sorted(security._PLACEHOLDER_SECRETS)]
GOOD_SECRET = "b6f1c0b8e2a94d5f8c7316ab90d24e77"


@pytest.fixture(autouse=True)
def _isolated_jwt_env(monkeypatch):
    """每个用例从"无显式配置"的干净 env 出发（import 期 .env.development 已把
    占位值装入进程 env，必须清掉才能模拟真实缺省场景）。"""
    monkeypatch.delenv("JWT_SECRET_KEY", raising=False)
    monkeypatch.setenv("APP_ENV", "development")
    yield


def _isolate_key_file(monkeypatch, tmp_path) -> Path:
    """把持久化路径重定向到 tmp：__file__ 指向 tmp 树内的同名模块路径。"""
    fake_module_path = tmp_path / "app" / "core" / "security.py"
    monkeypatch.setattr(security, "__file__", str(fake_module_path))
    key_file = tmp_path / "data" / ".jwt_secret"
    # 双保险：本套件永不触达真实密钥文件
    assert key_file != REAL_KEY_FILE
    assert not key_file.exists()
    return key_file


def _exec_isolated_security(monkeypatch, tmp_path, app_env="development", env_file_body=None):
    """把真实 security.py 复制进 tmp 模块树并作为**新模块**执行（完整重放 import 期链路：
    先 _load_jwt_env_file(.env.<APP_ENV>) 再 _resolve_jwt_secret()）。

    - __file__ 在副本内即 tmp ⇒ .env.<APP_ENV> 与 data/.jwt_secret 全部落 tmp；
    - 执行前清掉 JWT_SECRET_KEY，模拟全新进程。
    """
    core = tmp_path / "app" / "core"
    core.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(_REAL_SECURITY_SRC, core / "security.py")
    if env_file_body is not None:
        (tmp_path / f".env.{app_env}").write_text(env_file_body, encoding="utf-8")
    monkeypatch.setenv("APP_ENV", app_env)
    monkeypatch.delenv("JWT_SECRET_KEY", raising=False)
    key_file = tmp_path / "data" / ".jwt_secret"
    assert key_file != REAL_KEY_FILE
    spec = importlib.util.spec_from_file_location(f"_isolated_security_{uuid4().hex}", core / "security.py")
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


# ── ① 显式环境变量 ────────────────────────────────────────────

def test_explicit_env_var_wins(monkeypatch, tmp_path):
    key_file = _isolate_key_file(monkeypatch, tmp_path)
    monkeypatch.setenv("APP_ENV", "development")
    monkeypatch.setenv("JWT_SECRET_KEY", GOOD_SECRET)

    assert security._resolve_jwt_secret() == GOOD_SECRET
    # 显式配置命中时不产生持久化文件
    assert not key_file.exists()


def test_placeholder_env_var_does_not_win(monkeypatch, tmp_path):
    """占位值 env 等同于未配置：必须落到下一级（生成），不得被静默采用。"""
    key_file = _isolate_key_file(monkeypatch, tmp_path)
    for placeholder in PLACEHOLDER_SAMPLES:
        monkeypatch.setenv("JWT_SECRET_KEY", placeholder)
        resolved = security._resolve_jwt_secret()
        assert resolved and resolved != placeholder
    # 兜底链路生成并持久化了一份
    assert key_file.exists()


def test_production_with_explicit_env_succeeds(monkeypatch, tmp_path):
    _isolate_key_file(monkeypatch, tmp_path)
    monkeypatch.setenv("APP_ENV", "production")
    monkeypatch.setenv("JWT_SECRET_KEY", GOOD_SECRET)
    assert security._resolve_jwt_secret() == GOOD_SECRET


# ── ③ 生产 fail-fast ─────────────────────────────────────────

@pytest.mark.parametrize("explicit", [None, "", "your-super-secret-key-change-in-production"])
def test_production_without_config_fail_fast(monkeypatch, tmp_path, explicit):
    """生产 + 无非占位配置必须启动失败；占位值不豁免；失败路径不得落任何密钥文件。"""
    key_file = _isolate_key_file(monkeypatch, tmp_path)
    monkeypatch.setenv("APP_ENV", "production")
    if explicit is not None:
        monkeypatch.setenv("JWT_SECRET_KEY", explicit)
    else:
        monkeypatch.delenv("JWT_SECRET_KEY", raising=False)

    with pytest.raises(RuntimeError, match="JWT_SECRET_KEY"):
        security._resolve_jwt_secret()
    assert not key_file.exists()


# ── ④ 开发生成 + 持久化 + 复用 ────────────────────────────────

def test_dev_generates_persists_and_reuses(monkeypatch, tmp_path):
    key_file = _isolate_key_file(monkeypatch, tmp_path)
    monkeypatch.delenv("JWT_SECRET_KEY", raising=False)

    first = security._resolve_jwt_secret()
    assert first, "应生成非空密钥"
    assert key_file.exists(), "dev 态必须持久化，否则重启后 Fernet 已存密码不可解"
    assert key_file.read_text(encoding="utf-8").strip() == first

    mode = stat.S_IMODE(key_file.stat().st_mode)
    assert mode == 0o600, f"密钥文件权限应为 0600，实际 {oct(mode)}"

    # 二次解析（模拟重启后的第二次启动）复用同值——换值即已加密的库密码不可解
    assert security._resolve_jwt_secret() == first


def test_dev_prefers_existing_key_file_over_regeneration(monkeypatch, tmp_path):
    """已有持久化文件（哪怕非本次生成）优先于重新生成——保证跨重启稳定。"""
    key_file = _isolate_key_file(monkeypatch, tmp_path)
    key_file.parent.mkdir(parents=True, exist_ok=True)
    key_file.write_text("pre-existing-dev-secret", encoding="utf-8")

    assert security._resolve_jwt_secret() == "pre-existing-dev-secret"


# ── ② .env.<APP_ENV> 链路（_load_jwt_env_file 单元 + 全链路） ──

def test_env_file_non_placeholder_value_loaded(monkeypatch, tmp_path):
    import os

    env_file = tmp_path / ".env.production"
    env_file.write_text(
        f'JWT_SECRET_KEY="{GOOD_SECRET}"\nJWT_EXPIRE_MINUTES=60\n', encoding="utf-8"
    )
    monkeypatch.delenv("JWT_EXPIRE_MINUTES", raising=False)

    security._load_jwt_env_file(env_file)

    assert os.environ["JWT_SECRET_KEY"] == GOOD_SECRET
    assert os.environ["JWT_EXPIRE_MINUTES"] == "60"


def test_env_file_placeholder_value_does_not_rescue_production(monkeypatch, tmp_path):
    """链路语义：.env 文件的占位值会装入 env，但解析层仍按占位拒绝——生产照样 fail-fast。"""
    key_file = _isolate_key_file(monkeypatch, tmp_path)
    env_file = tmp_path / ".env.production"
    env_file.write_text(
        "JWT_SECRET_KEY=your-production-secret-key-must-be-changed\n", encoding="utf-8"
    )
    security._load_jwt_env_file(env_file)
    monkeypatch.setenv("APP_ENV", "production")

    with pytest.raises(RuntimeError, match="JWT_SECRET_KEY"):
        security._resolve_jwt_secret()
    assert not key_file.exists()


def test_env_file_never_overrides_existing_env(monkeypatch, tmp_path):
    env_file = tmp_path / ".env.development"
    env_file.write_text(f"JWT_SECRET_KEY={GOOD_SECRET}\n", encoding="utf-8")
    monkeypatch.setenv("JWT_SECRET_KEY", "from-real-env")

    security._load_jwt_env_file(env_file)

    import os

    assert os.environ["JWT_SECRET_KEY"] == "from-real-env"


def test_env_file_only_touches_jwt_keys(monkeypatch, tmp_path):
    """只读 JWT_* 两键：不得触碰 DATABASE_URL 等（避免与 db_config 切换机制抢优先级）。"""
    env_file = tmp_path / ".env.development"
    env_file.write_text(
        "DATABASE_URL=sqlite:///./data/evil.db\nJWT_SECRET_KEY=only-jwt-matters\n",
        encoding="utf-8",
    )
    import os

    os.environ.pop("DATABASE_URL", None)
    security._load_jwt_env_file(env_file)
    assert "DATABASE_URL" not in os.environ
    assert os.environ["JWT_SECRET_KEY"] == "only-jwt-matters"


def test_env_file_skips_comments_blanks_and_strips_quotes(monkeypatch, tmp_path):
    env_file = tmp_path / ".env.development"
    env_file.write_text(
        "# 注释行\n"
        "\n"
        "JWT_SECRET_KEY = 'quoted-secret' \n"
        "# JWT_SECRET_KEY=commented-out\n",
        encoding="utf-8",
    )

    security._load_jwt_env_file(env_file)

    import os

    assert os.environ["JWT_SECRET_KEY"] == "quoted-secret"


def test_import_time_chain_env_file_value_wins(monkeypatch, tmp_path):
    """全链路（副本模块执行）：.env.<APP_ENV> 非占位值 → import 期即采用为 JWT_SECRET_KEY。"""
    module = _exec_isolated_security(
        monkeypatch, tmp_path, app_env="production",
        env_file_body=f"JWT_SECRET_KEY={GOOD_SECRET}\n",
    )
    assert module.JWT_SECRET_KEY == GOOD_SECRET
    assert not (tmp_path / "data" / ".jwt_secret").exists()


def test_import_time_chain_dev_persist_and_reuse_across_restarts(monkeypatch, tmp_path):
    """全链路（副本模块执行）：开发态两次"启动"（两次模块执行）复用同一持久化密钥。"""
    first = _exec_isolated_security(monkeypatch, tmp_path, app_env="development")
    key_file = tmp_path / "data" / ".jwt_secret"
    assert key_file.exists()
    assert first.JWT_SECRET_KEY == key_file.read_text(encoding="utf-8").strip()

    second = _exec_isolated_security(monkeypatch, tmp_path, app_env="development")
    assert second.JWT_SECRET_KEY == first.JWT_SECRET_KEY
    assert second.JWT_SECRET_KEY == key_file.read_text(encoding="utf-8").strip()
