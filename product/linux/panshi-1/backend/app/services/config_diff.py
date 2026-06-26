import json
from copy import deepcopy
from pathlib import Path
from typing import Any

try:
    import yaml
except ImportError:
    yaml = None  # pyyaml not installed, rules file won't load


_RULES_PATH = Path(__file__).resolve().parent.parent / "config" / "equivalence_rules.yaml"


def _deep_fill(obj: Any, defaults: Any) -> Any:
    """Recursively fill missing keys from defaults without overwriting existing values."""
    if not isinstance(obj, dict) or not isinstance(defaults, dict):
        return obj if obj is not None else defaults
    result = {}
    for k, v in obj.items():
        if k in defaults:
            result[k] = _deep_fill(v, defaults[k])
        else:
            result[k] = v
    for k, v in defaults.items():
        if k not in result:
            result[k] = deepcopy(v)
    return result


class EquivalenceRules:
    """Loads and applies field equivalence rules for DB-Edge config comparison."""

    _instance = None
    _rules: dict = {}

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
            cls._instance._load()
        return cls._instance

    def _load(self) -> None:
        if yaml is None or not _RULES_PATH.exists():
            self._rules = {}
            return
        with open(_RULES_PATH, encoding="utf-8") as f:
            self._rules = yaml.safe_load(f) or {}

    def _res_type(self, resource_type: str) -> dict:
        return self._rules.get(resource_type, {})

    def get_field_default(self, resource_type: str, field: str) -> Any:
        return self._res_type(resource_type).get("field_defaults", {}).get(field)

    def get_field_alias(self, resource_type: str, field: str) -> str:
        return self._res_type(resource_type).get("field_aliases", {}).get(field, field)

    def get_json_rules(self, resource_type: str, field: str) -> dict:
        return self._res_type(resource_type).get("json_fields", {}).get(field, {})

    def is_list_field(self, resource_type: str, field: str) -> bool:
        return field in self._res_type(resource_type).get("list_fields", [])

    def should_ignore_edge_field(self, resource_type: str, field: str) -> bool:
        return field in self._res_type(resource_type).get("ignore_edge_fields", [])

    def get_plugin_defaults(self, resource_type: str) -> dict:
        return self._res_type(resource_type).get("per_plugin_defaults", {})

    def get_ignore_plugin_fields(self, resource_type: str) -> list[str]:
        return self._res_type(resource_type).get("ignore_edge_plugin_fields", [])

    def normalize_scalar(self, resource_type: str, db_value: Any, field: str) -> Any:
        if db_value is None or db_value == "":
            default = self.get_field_default(resource_type, field)
            if default is not None:
                return default
        return db_value

    def normalize_value(self, resource_type: str, db_value: Any, field: str) -> Any:
        """Map DB value to equivalent Edge value using value_mappings.
        E.g., DB 'weighted_roundrobin' -> Edge 'roundrobin'.
        Only applies when db_value is not None and a mapping exists."""
        if db_value is None:
            return db_value
        mappings = self._res_type(resource_type).get("value_mappings", {}).get(field, {})
        return mappings.get(db_value, db_value)

    def normalize_list(self, db_value: Any, edge_value: Any) -> tuple:
        if isinstance(db_value, str) and isinstance(edge_value, list):
            parts = [p.strip() for p in db_value.split(",") if p.strip()]
            if parts == edge_value:
                return True, parts, edge_value
        if isinstance(db_value, list) and isinstance(edge_value, str):
            parts = [p.strip() for p in edge_value.split(",") if p.strip()]
            if parts == db_value:
                return True, db_value, parts
        return False, db_value, edge_value

    def compare_json_field(self, db_val: Any, edge_val: Any, field_rules: dict) -> dict | None:
        db_parsed = self._parse_json(db_val)
        edge_parsed = self._parse_json(edge_val)

        for key in field_rules.get("ignore_edge_keys", []):
            edge_parsed.pop(key, None)
        defaults = field_rules.get("fill_defaults", {})
        if defaults:
            db_parsed = _deep_fill(db_parsed, defaults)

        if json.dumps(db_parsed, sort_keys=True, default=str) != json.dumps(
            edge_parsed, sort_keys=True, default=str
        ):
            return {
                "name": "value",
                "db": json.dumps(db_parsed, indent=1, ensure_ascii=False),
                "edge": json.dumps(edge_parsed, indent=1, ensure_ascii=False),
            }
        return None

    def compare_plugins(
        self, db_plugins: Any, edge_plugins: Any, per_plugin_defaults: dict,
        ignore_edge_fields: list[str] | None = None,
    ) -> list:
        db = self._parse_json(db_plugins)
        edge = self._parse_json(edge_plugins)
        fields = []
        ignore = set(ignore_edge_fields or [])
        all_plugins = set(list(db.keys()) + list(edge.keys()))
        for name in sorted(all_plugins):
            db_conf = db.get(name, {})
            edge_conf = edge.get(name, {})
            for k in ignore:
                edge_conf.pop(k, None)
                db_conf.pop(k, None)
            defaults = per_plugin_defaults.get(name, {})
            # 先做字面比较
            equal = json.dumps(db_conf, sort_keys=True, default=str) == json.dumps(
                edge_conf, sort_keys=True, default=str
            )
            if not equal and defaults:
                # DB 可能是省略的缺省值，填充后再比一次
                db_filled = _deep_fill(db_conf, defaults)
                equal = json.dumps(db_filled, sort_keys=True, default=str) == json.dumps(
                    edge_conf, sort_keys=True, default=str
                )
            fields.append({
                "name": name,
                "db": json.dumps(db_conf, indent=1, ensure_ascii=False),
                "edge": json.dumps(edge_conf, indent=1, ensure_ascii=False),
                "status": "equal" if equal else "diff",
            })
        return fields

    @staticmethod
    def _parse_json(val: Any) -> dict:
        if val is None:
            return {}
        if isinstance(val, str):
            try:
                return json.loads(val)
            except (json.JSONDecodeError, TypeError):
                return {}
        if isinstance(val, dict):
            return val
        return {}
