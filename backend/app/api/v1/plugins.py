from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.database import get_db

router = APIRouter(prefix="/plugins", tags=["plugins"])


BUILTIN_PLUGINS = [
    {
        "name": "ip-restriction",
        "description": "Restrict access by IP address",
        "schema": {
            "whitelist": {"type": "array", "items": {"type": "string"}},
            "blacklist": {"type": "array", "items": {"type": "string"}}
        }
    },
    {
        "name": "cors",
        "description": "Enable CORS support",
        "schema": {
            "allow_origins": {"type": "string"},
            "allow_methods": {"type": "array", "items": {"type": "string"}},
            "allow_headers": {"type": "array", "items": {"type": "string"}},
            "allow_credentials": {"type": "boolean"}
        }
    },
    {
        "name": "proxy-rewrite",
        "description": "Rewrite upstream request URI, headers, host and scheme",
        "schema": {
            "uri": {
                "type": "string",
                "description": "New URI for upstream, supports NGINX variables"
            },
            "regex_uri": {
                "type": "array",
                "items": {"type": "string"},
                "description": "Regex URI pattern and replacement, e.g. ['^/old/(.*)', '/new/$1']"
            },
            "headers": {
                "type": "object",
                "description": "Header operations",
                "properties": {
                    "set": {
                        "type": "object",
                        "description": "Headers to set/overwrite"
                    },
                    "add": {
                        "type": "object",
                        "description": "Headers to add/append"
                    },
                    "remove": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": "Headers to remove"
                    }
                }
            },
            "host": {
                "type": "string",
                "description": "Upstream host to rewrite"
            },
            "scheme": {
                "type": "string",
                "enum": ["http", "https"],
                "description": "Upstream scheme (http or https)"
            },
            "use_real_request_uri_unsafe": {
                "type": "boolean",
                "description": "Use raw URI without normalization (unsafe)"
            }
        }
    },
    {
        "name": "limit-req",
        "description": "Limit request rate",
        "schema": {
            "rate": {"type": "number"},
            "burst": {"type": "number"},
            "key": {"type": "string"}
        }
    },
    {
        "name": "limit-conn",
        "description": "Limit connection count",
        "schema": {
            "conn": {"type": "number"},
            "burst": {"type": "number"},
            "key": {"type": "string"}
        }
    },
    {
        "name": "limit-count",
        "description": "Limit request count by customer",
        "schema": {
            "count": {"type": "number"},
            "time_window": {"type": "number"},
            "key": {"type": "string"}
        }
    },
    {
        "name": "key-auth",
        "description": "Authentication with API key",
        "schema": {
            "key": {"type": "string"}
        }
    },
    {
        "name": "jwt-auth",
        "description": "Authentication with JWT",
        "schema": {
            "secret": {"type": "string"},
            "algorithms": {"type": "array", "items": {"type": "string"}}
        }
    },
    {
        "name": "basic-auth",
        "description": "Authentication with basic auth",
        "schema": {}
    },
    {
        "name": "response-rewrite",
        "description": "Rewrite response status code, body and headers",
        "schema": {
            "status_code": {"type": "number"},
            "body": {"type": "string"},
            "headers": {"type": "object"}
        }
    }
]


@router.get("/builtin")
async def get_builtin_plugins():
    return {"plugins": BUILTIN_PLUGINS}