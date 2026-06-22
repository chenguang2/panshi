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
})

# ── Module-level cache (set once at startup) ───────────────────────────
_features: dict | None = None


# ── Public helpers ─────────────────────────────────────────────────────


def get_features() -> dict:
    """Return the full parsed features dict, loading on first access."""
    if _features is None:
        return load_features()
    return _features


def feature_enabled(name: str) -> bool:
    """Return True if the given feature is enabled (default: True)."""
    return get_features().get("features", {}).get(name, True)


def get_enabled_plugins() -> list[str]:
    """Return the enabled-plugins whitelist (empty list = no restriction)."""
    return get_features().get("enabled_plugins", [])


# ── Loading & validation ──────────────────────────────────────────────


def load_features(path: str = "features.yaml") -> dict:
    """Read and validate *path*, then cache and return the result.

    Rules:
    - If ``_features`` is already set, return it immediately (no re-read).
    - File not found → default config (all enabled, no plugin restrictions).
    - Malformed YAML / invalid structure / unknown keys → sys.exit(1).
    """
    global _features
    if _features is not None:
        return _features

    p = Path(path)

    if not p.exists():
        _features = {"features": {}, "enabled_plugins": []}
        return _features

    try:
        raw = yaml.safe_load(p.read_text(encoding="utf-8"))
    except yaml.YAMLError as exc:
        print(f"错误: features.yaml 格式解析失败: {exc}", file=sys.stderr)
        sys.exit(1)

    _validate(raw)
    _features = raw  # type: ignore[assignment]
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
