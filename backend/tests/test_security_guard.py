"""安全守卫测试（Phase 0 认证加固的回归护栏）。

验证：
1. 此前未鉴权的集群域/平台端点，无 token 一律 401；
2. 设计为公开的端点（/health、/system/features）不要求认证；
3. 携带有效 token 时请求正常放行（到达业务层而非被 401 拦截）。

端点样例覆盖 20 个已加装 dependencies=[Depends(get_current_user)] 的路由文件
的代表性路径。直连 app.main.app 与开发库（含种子管理员 id=1）。
"""
import pytest
from fastapi.testclient import TestClient

from app.main import app
from tests.api_helpers import admin_auth_headers, AuthedTestClient

# (方法, 路径) —— 每个未鉴权路由文件取 1-2 个代表端点（路径须为真实注册路由）
UNAUTHENTICATED_SAMPLES = [
    ("get", "/api/v1/clusters/1/routes"),
    ("get", "/api/v1/clusters/1/upstreams"),
    ("get", "/api/v1/clusters/1/nodes"),
    ("get", "/api/v1/clusters/1/plugin_configs"),
    ("get", "/api/v1/clusters/1/global_rules"),
    ("get", "/api/v1/clusters/1/plugin-metadata"),
    ("get", "/api/v1/clusters/1/static-resources"),
    ("get", "/api/v1/clusters/1/stream-proxies"),
    ("get", "/api/v1/stream-proxies"),
    ("get", "/api/v1/clusters/1/dns-proxies"),
    ("get", "/api/v1/clusters/1/ssl"),
    ("get", "/api/v1/ssl"),
    ("get", "/api/v1/clusters/1/edge-env"),
    ("get", "/api/v1/dashboard/stats"),
    ("get", "/api/v1/plugins/builtin"),
    ("get", "/api/v1/metrics/route-stats"),
    ("get", "/api/v1/node-tasks"),
    ("get", "/api/v1/edge-client/nodes"),
    ("get", "/api/v1/nodes/autostart/records"),
    ("get", "/api/v1/plugin-switches"),
    ("post", "/api/v1/edge-import/preview"),
    ("post", "/api/v1/clusters/99999/nodes/99999/reload"),
    ("post", "/api/v1/clusters/1/nodes/99999/install-openresty"),
    ("post", "/api/v1/clusters/1/nodes/99999/install-edge"),
]

# 设计公开的端点（frontend bootstrap 需要）
PUBLIC_SAMPLES = [
    ("get", "/health"),
    ("get", "/api/v1/system/features"),
    ("post", "/api/v1/auth/login"),
]


@pytest.mark.parametrize("method,path", UNAUTHENTICATED_SAMPLES)
def test_secured_endpoints_reject_without_token(method, path):
    with TestClient(app) as c:
        resp = getattr(c, method)(path)
        assert resp.status_code == 401, f"{method.upper()} {path} 应返回 401，实际 {resp.status_code}"


@pytest.mark.parametrize("method,path", PUBLIC_SAMPLES)
def test_public_endpoints_stay_open(method, path):
    with TestClient(app) as c:
        kwargs = {"json": {}} if method == "post" else {}
        resp = getattr(c, method)(path, **kwargs)
        assert resp.status_code != 401, f"{method.upper()} {path} 应保持公开"


def test_secured_endpoint_passes_with_valid_token():
    """带有效 token 应放行到业务层（此处期望 404 路由不存在，而非 401）。"""
    with AuthedTestClient(app) as c:
        resp = c.get("/api/v1/clusters/1/routes/99999")
        assert resp.status_code in (200, 404)
        assert resp.status_code != 401