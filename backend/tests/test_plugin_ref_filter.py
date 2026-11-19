"""插件引用服务端过滤（plugin-ref-filter）：GET /plugin_configs 与 /global_rules 的 plugin 参数。

钉死三件事（D1/D5）：
- **键精确匹配**：``"jwt-auth"`` 与 ``"jwt-auth-v2"`` 前缀串碰撞不发生（冒号后缀）；
- 值位置的同名串不命中；
- 缺省/空串全量（不过滤）；未挂插件资源不命中。
"""

import pytest

pytestmark = pytest.mark.asyncio


async def _create_config(client, name: str, plugins: dict, cluster_id: int = 1) -> int:
    r = await client.post(
        f"/api/v1/clusters/{cluster_id}/plugin_configs",
        json={"name": name, "plugins": plugins},
    )
    assert r.status_code in (200, 201), r.text
    return r.json()["id"]


async def _create_rule(client, name: str, plugins: dict, cluster_id: int = 1) -> int:
    r = await client.post(
        f"/api/v1/clusters/{cluster_id}/global_rules",
        json={"name": name, "plugins": plugins},
    )
    assert r.status_code in (200, 201), r.text
    return r.json()["id"]


@pytest.mark.parametrize(
    "endpoint,kind", [("/api/v1/plugin_configs", "config"), ("/api/v1/global_rules", "rule")]
)
class TestPluginRefServerFilter:
    async def test_exact_key_filter_no_prefix_collision(self, async_authed_client, endpoint, kind):
        """前缀碰撞钉死：plugin=jwt-auth SHALL NOT 命中仅引用 jwt-auth-v2 的资源（D1）。"""
        client = async_authed_client
        create = _create_config if kind == "config" else _create_rule
        a = await create(client, f"prf-exact-{kind}", {"jwt-auth": {"x": 1}})
        b = await create(client, f"prf-prefix-{kind}", {"jwt-auth-v2": {"x": 1}})

        res = await client.get(endpoint, params={"plugin": "jwt-auth", "page_size": 100})
        assert res.status_code == 200, res.text
        names = {i["name"] for i in res.json()["items"]}
        assert f"prf-exact-{kind}" in names
        assert f"prf-prefix-{kind}" not in names

        res2 = await client.get(endpoint, params={"plugin": "jwt-auth-v2", "page_size": 100})
        names2 = {i["name"] for i in res2.json()["items"]}
        assert f"prf-prefix-{kind}" in names2
        assert f"prf-exact-{kind}" not in names2
        # ids 对应（a 命中 jwt-auth 腿）
        ids = {i["id"] for i in res2.json()["items"]}
        assert a not in ids and b in ids

    async def test_empty_plugins_misses(self, async_authed_client, endpoint, kind):
        """未挂插件资源 SHALL NOT 命中（R2）。"""
        client = async_authed_client
        create = _create_config if kind == "config" else _create_rule
        empty = await create(client, f"prf-empty-{kind}", {})
        hit = await create(client, f"prf-hit-{kind}", {"cors": {}})

        res = await client.get(endpoint, params={"plugin": "cors", "page_size": 100})
        ids = {i["id"] for i in res.json()["items"]}
        assert hit in ids and empty not in ids

    async def test_default_returns_all(self, async_authed_client, endpoint, kind):
        """缺省/空串不过滤（D5）。"""
        client = async_authed_client
        create = _create_config if kind == "config" else _create_rule
        a = await create(client, f"prf-def1-{kind}", {"cors": {}})
        b = await create(client, f"prf-def2-{kind}", {})

        for params in ({}, {"plugin": ""}):
            res = await client.get(endpoint, params={**params, "page_size": 100})
            ids = {i["id"] for i in res.json()["items"]}
            assert a in ids and b in ids

    async def test_unknown_plugin_name_yields_empty(self, async_authed_client, endpoint, kind):
        """不存在的插件名 → 空结果集（D5，不 400）。"""
        client = async_authed_client
        create = _create_config if kind == "config" else _create_rule
        await create(client, f"prf-any-{kind}", {"cors": {}})
        res = await client.get(endpoint, params={"plugin": "no-such-plugin", "page_size": 100})
        assert res.status_code == 200
        assert res.json()["items"] == []
