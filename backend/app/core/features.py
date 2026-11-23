"""Deployment-level feature configuration.

Reads features.yaml at startup and provides helpers for feature gating
and plugin whitelisting throughout the application.

Design decisions:
- Features not listed in features.yaml default to enabled (opt-out model).
- enabled_plugins: empty list = no restriction, non-empty = hard whitelist.
- On parse/validation error, sys.exit(1) with a clear message.
"""

import sys
from pathlib import Path

import yaml

# ── Known feature names ────────────────────────────────────────────────
# Used for validation: any unknown feature name in features.yaml causes a
# startup error.  Add new features here when introducing them.
KNOWN_FEATURES: frozenset[str] = frozenset({
    "edge_client",
    "edge_import",
    "tools",
    "install_openresty",
    "install_edge",
    "plugin_switches",
    "metrics",
    "edge_env",
    "stream_proxy",
    "ssl_cert",
    "dns_proxy_udp",
    "dns_proxy_http",
    "task_center",
    "database_management",
    "db_migration",
    "db_backup",
    "edge_autostart",
    "ansible_inventory",
    "clickhouse_config",
    "audit_log",
    "relay_gateway",
    "force_default_password_change",
})

# Known concurrency parameter names in the `concurrency` namespace.
# Add new tunables here when introducing them.
KNOWN_CONCURRENCY_KEYS: frozenset[str] = frozenset({
    "max_playbooks",
    "batch_action",
})

# Branding namespace (branding-configuration): deployment-level display name
# and version consumed by the login page, sidebar and browser tab title via
# GET /system/features.  Same contract as `concurrency`: unknown keys are a
# startup error; missing namespace / keys fall back to the built-in defaults
# (which reproduce the historical hardcoded strings verbatim).
KNOWN_BRANDING_KEYS: frozenset[str] = frozenset({
    "system_name",
    "brand_name",
    "product_name",
    "version",
})

BRANDING_DEFAULTS: dict[str, str] = {
    "system_name": "磐石",
    "brand_name": "磐石 Gateway",
    "product_name": "Panshi Gateway Admin",
    "version": "v1.0",
}

# 体积上限命名空间（static-zip-limit-config）：部署级容量策略，每实例一值。
# 语义与 `concurrency` 同款：未知键 / bool / 非 int / 越界 → 启动报错退出；
# 未配置 → 校验阶段回写缺省值（GET /system/features 恒定透出完整键集）。
# 调大 `static_zip_max_mb` 前必须同步调大 nginx 侧上限，否则上传能过、发布 413：
#   经中继发布腿 → 网关 nginx `client_max_body_size`；
#   直连发布腿   → 各 Edge 节点 edge.env 的 `client_max_body_size`（未配置时 nginx 默认 1m）。
KNOWN_LIMIT_KEYS: frozenset[str] = frozenset({
    "static_zip_max_mb",
})

LIMIT_DEFAULTS: dict[str, int] = {
    "static_zip_max_mb": 32,
}

# 各键合法区间（闭区间，整数 MB）
LIMIT_RANGES: dict[str, tuple[int, int]] = {
    "static_zip_max_mb": (1, 2048),
}

# ── Module-level cache with mtime-based invalidation ──────────────────
_features: dict | None = None
_features_mtime: float = 0.0

# T4/M6：锚定 backend 根，与进程 CWD 无关（features.yaml 位于 backend/ 下）
_FEATURES_PATH = Path(__file__).resolve().parents[2] / "features.yaml"


# ── Public helpers ─────────────────────────────────────────────────────


def get_features() -> dict:
    """Return the full parsed features dict, re-reading when file changes."""
    global _features, _features_mtime
    p = _FEATURES_PATH
    try:
        current_mtime = p.stat().st_mtime if p.exists() else 0.0
    except OSError:
        current_mtime = 0.0
    if _features is None or current_mtime != _features_mtime:
        _features = None  # force reload
        # 注意：必须显式传 p——load_features 的默认参数在定义时绑定，
        # 与 _FEATURES_PATH 脱节会导致"stat 一个文件、重载另一个文件"
        return load_features(str(p))
    return _features


def feature_enabled(name: str) -> bool:
    """Return True if the given feature is enabled (default: True)."""
    return get_features().get("features", {}).get(name, True)


def is_default_password_guard_enabled() -> bool:
    """默认口令守卫总开关（default-password-guard-switch D1）。

    显式 opt-in：未列出/false = 关闭，不沿用 feature_enabled 的 opt-out 缺省
    （对齐 relay_gateway 先例）。mtime 热加载，改完即时生效免重启。
    登录标记（auth.py）与请求拦截（deps.py）同源读本助手，禁止两处各自读取。
    """
    return bool(
        get_features().get("features", {}).get("force_default_password_change", False)
    )


def get_enabled_plugins() -> list[str]:
    """Return the enabled-plugins whitelist (empty list = no restriction)."""
    return get_features().get("enabled_plugins", [])


def get_global_rule_plugins() -> list[str]:
    """Return the global-rule plugin whitelist (empty list = no restriction).

    专用清单（global-rule-ux-close-loop D8）：约束全局规则两入口的可用插件
    选择，不承担 enabled_plugins 的部署级全平台启用语义。空/未配置 = 不限制。
    """
    return get_features().get("global_rule_plugins", [])


def get_plugin_metadata_plugins() -> list[str]:
    """Return the plugin-metadata plugin whitelist (empty list = no restriction).

    专用清单（plugin-metadata-plugins-config）：约束插件元数据两添加入口的
    可用插件选择，不承担 enabled_plugins 的部署级全平台启用语义。
    空/未配置 = 不限制；写死字段 enable_metadata 已退役，本清单是唯一事实源。
    """
    return get_features().get("plugin_metadata_plugins", [])


def get_concurrency(name: str, default: int) -> int:
    """Return a concurrency parameter value (default when not configured)."""
    return get_features().get("concurrency", {}).get(name, default)


def get_branding() -> dict[str, str]:
    """Return the branding dict with all 4 keys (defaults filled in at load time)."""
    return get_features().get("branding") or dict(BRANDING_DEFAULTS)


def static_zip_max_mb() -> int:
    """静态资源 zip 上传体积上限（MB，static-zip-limit-config 唯一读取点）。

    mtime 热加载：改 features.yaml 即生效免重启。未配置/缺键回落 32
    （load_features 已在校验阶段回写缺省，此处兜底防御）。
    """
    limits = get_features().get("limits")
    if not isinstance(limits, dict):
        return LIMIT_DEFAULTS["static_zip_max_mb"]
    value = limits.get("static_zip_max_mb", LIMIT_DEFAULTS["static_zip_max_mb"])
    return int(value)


# ── Loading & validation ──────────────────────────────────────────────


def load_features(path: str = "features.yaml") -> dict:
    """Read and validate *path*, then cache and return the result.

    Rules:
    - File not found → default config (all enabled, no plugin restrictions).
    - Malformed YAML / invalid structure / unknown keys → sys.exit(1).
    """
    global _features, _features_mtime

    p = Path(path)

    if not p.exists():
        _features = {
            "features": {},
            "enabled_plugins": [],
            "branding": dict(BRANDING_DEFAULTS),
            "limits": dict(LIMIT_DEFAULTS),
        }
        _features_mtime = 0.0
        return _features

    try:
        raw = yaml.safe_load(p.read_text(encoding="utf-8"))
    except yaml.YAMLError as exc:
        print(f"错误: features.yaml 格式解析失败: {exc}", file=sys.stderr)
        sys.exit(1)

    _validate(raw)
    _validate_concurrency(raw)
    _validate_branding(raw)
    _validate_limits(raw)
    _features = raw  # type: ignore[assignment]
    try:
        _features_mtime = p.stat().st_mtime
    except OSError:
        _features_mtime = 0.0
    return _features


def _validate(config: dict) -> None:
    """Validate structure & values; prints error and exits on failure."""
    if not isinstance(config, dict):
        print("错误: features.yaml 必须是一个字典结构", file=sys.stderr)
        sys.exit(1)

    features = config.get("features", {})
    if not isinstance(features, dict):
        print("错误: features.yaml 中 'features' 必须是映射（字典）", file=sys.stderr)
        sys.exit(1)

    unknown = [k for k in features if k not in KNOWN_FEATURES]
    if unknown:
        print(
            f"错误: features.yaml 包含未知功能名 {unknown}。"
            f" 允许的功能名: {sorted(KNOWN_FEATURES)}",
            file=sys.stderr,
        )
        sys.exit(1)

    for key, val in features.items():
        if not isinstance(val, bool):
            print(
                f"错误: features.yaml 中 '{key}' 的值必须是 true 或 false，"
                f" 当前值: {val} (类型: {type(val).__name__})",
                file=sys.stderr,
            )
            sys.exit(1)

    plugins = config.get("enabled_plugins", [])
    if plugins is None:
        config["enabled_plugins"] = []
    elif not isinstance(plugins, list):
        print("错误: features.yaml 中 'enabled_plugins' 必须是列表", file=sys.stderr)
        sys.exit(1)

    # 顶层专用清单 key（global-rule-ux-close-loop D8）：与 enabled_plugins 同级，
    # 非列表显式报错退出；未配置/None 归一为 []（= 不限制）。
    # 顶层未知 key 不拒绝（concurrency 先例：unknown 检查仅作用于 features 映射内部）。
    global_rule_plugins = config.get("global_rule_plugins", [])
    if global_rule_plugins is None:
        config["global_rule_plugins"] = []
    elif not isinstance(global_rule_plugins, list):
        print("错误: features.yaml 中 'global_rule_plugins' 必须是列表", file=sys.stderr)
        sys.exit(1)

    # 顶层专用清单 key（plugin-metadata-plugins-config）：同 global_rule_plugins
    # 形态校验；约束插件元数据两添加入口（旧写死字段 enable_metadata 已退役）。
    plugin_metadata_plugins = config.get("plugin_metadata_plugins", [])
    if plugin_metadata_plugins is None:
        config["plugin_metadata_plugins"] = []
    elif not isinstance(plugin_metadata_plugins, list):
        print("错误: features.yaml 中 'plugin_metadata_plugins' 必须是列表", file=sys.stderr)
        sys.exit(1)


def _validate_concurrency(config: dict) -> None:
    """Validate the ``concurrency`` namespace; prints error and exits on failure."""
    cc = config.get("concurrency", {})
    if cc is None:
        config["concurrency"] = {}
        return
    if not isinstance(cc, dict):
        print("错误: features.yaml 中 'concurrency' 必须是映射（字典）", file=sys.stderr)
        sys.exit(1)

    unknown = [k for k in cc if k not in KNOWN_CONCURRENCY_KEYS]
    if unknown:
        print(
            f"错误: features.yaml 包含未知并发参数 {unknown}。"
            f" 允许的参数名: {sorted(KNOWN_CONCURRENCY_KEYS)}",
            file=sys.stderr,
        )
        sys.exit(1)

    for key, val in cc.items():
        if isinstance(val, bool) or not isinstance(val, int) or not (1 <= val <= 50):
            print(
                f"错误: features.yaml 中 'concurrency.{key}' 必须是 1-50 的整数，"
                f" 当前值: {val} (类型: {type(val).__name__})",
                file=sys.stderr,
            )
            sys.exit(1)


def _validate_branding(config: dict) -> None:
    """Validate the ``branding`` namespace; prints error and exits on failure.

    branding-configuration：未配置 → 整组回落内置默认值（行为与历史硬编码一致）；
    部分配置 → 缺失 key 补默认值（合并语义）；未知 key / 值非字符串 → 报错退出，
    防止拼写错误导致配置静默失效（对齐 KNOWN_FEATURES / KNOWN_CONCURRENCY_KEYS 哲学）。
    校验通过后将合并结果写回 config，GET /system/features 由此透出完整 4 key。
    """
    branding = config.get("branding")
    if branding is None:
        config["branding"] = dict(BRANDING_DEFAULTS)
        return
    if not isinstance(branding, dict):
        print(
            "错误: features.yaml 中 'branding' 必须是映射（字典），"
            f" 当前值: {branding} (类型: {type(branding).__name__})",
            file=sys.stderr,
        )
        sys.exit(1)

    unknown = [k for k in branding if k not in KNOWN_BRANDING_KEYS]
    if unknown:
        print(
            f"错误: features.yaml 包含未知品牌配置项 {unknown}。"
            f" 允许的配置项: {sorted(KNOWN_BRANDING_KEYS)}",
            file=sys.stderr,
        )
        sys.exit(1)

    for key, val in branding.items():
        if not isinstance(val, str):
            print(
                f"错误: features.yaml 中 'branding.{key}' 必须是字符串，"
                f" 当前值: {val} (类型: {type(val).__name__})",
                file=sys.stderr,
            )
            sys.exit(1)

    merged = dict(BRANDING_DEFAULTS)
    merged.update(branding)
    config["branding"] = merged


def _validate_limits(config: dict) -> None:
    """Validate the ``limits`` namespace; prints error and exits on failure.

    static-zip-limit-config：未配置 → 整组回落缺省（并回写，供 GET /system/features
    透出完整键集，对齐 branding 合并语义）；部分配置 → 缺失键补缺省；
    未知键 / 非映射 / bool / 非 int / 越界 → 报错退出，防拼写错误静默失效。
    """
    limits = config.get("limits")
    if limits is None:
        config["limits"] = dict(LIMIT_DEFAULTS)
        return
    if not isinstance(limits, dict):
        print(
            "错误: features.yaml 中 'limits' 必须是映射（字典），"
            f" 当前值: {limits} (类型: {type(limits).__name__})",
            file=sys.stderr,
        )
        sys.exit(1)

    unknown = [k for k in limits if k not in KNOWN_LIMIT_KEYS]
    if unknown:
        print(
            f"错误: features.yaml 包含未知体积上限配置项 {unknown}。"
            f" 允许的配置项: {sorted(KNOWN_LIMIT_KEYS)}",
            file=sys.stderr,
        )
        sys.exit(1)

    for key, val in limits.items():
        low, high = LIMIT_RANGES[key]
        if isinstance(val, bool) or not isinstance(val, int) or not (low <= val <= high):
            print(
                f"错误: features.yaml 中 'limits.{key}' 必须是 {low}-{high} 的整数（MB），"
                f" 当前值: {val} (类型: {type(val).__name__})",
                file=sys.stderr,
            )
            sys.exit(1)

    merged = dict(LIMIT_DEFAULTS)
    merged.update(limits)
    config["limits"] = merged
