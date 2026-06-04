from pydantic import BaseModel, field_validator
from app.config.plugin_definitions import BUILTIN_PLUGINS

_BUILTIN_NAMES = {p["name"] for p in BUILTIN_PLUGINS}


class PluginSwitchItem(BaseModel):
    plugin_name: str
    enabled: bool

    @field_validator("plugin_name")
    @classmethod
    def validate_plugin_name(cls, v: str) -> str:
        if v not in _BUILTIN_NAMES:
            raise ValueError(f"Unknown plugin: {v}")
        return v
