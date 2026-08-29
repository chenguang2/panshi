"""Ansible inventory API 集成测试（任务 2.1–2.4）。

覆盖：GET/PUT/render/parse 四端点、管理员守卫（401/403）、
校验失败 400 带行号、保存后文件内容断言、备份生成、运行中任务 409。
"""

import uuid

import pytest
from httpx import AsyncClient, ASGITransport
from app.main import app
from app.services import ansible_service


VALID_INVENTORY = """\
all:
  children:
    edge_cluster:
      hosts:
        198.51.100.10:
          ansible_ssh_user: jboss
          ansible_ssh_pass: 'pass1'
      vars:
        ansible_ssh_user: group_user
"""

# 独立的测试网段 IP，避免与开发库真实节点冲突
TEST_IP_MANAGED = "198.51.100.10"    # 会录入 ps_node 的 IP
TEST_IP_UNMANAGED = "198.51.100.99"  # 仅存在于 inventory 的 IP


@pytest.fixture()
def inv_env(tmp_path, monkeypatch):
    inv_path = tmp_path / "inventory" / "host"
    monkeypatch.setattr(ansible_service, "_INVENTORY_PATH", inv_path)
    return inv_path


async def _platform_ips() -> list[str]:
    """当前开发库中已录入的全部节点 IP（删除保护基线）。"""
    from sqlalchemy import select

    from app.core.database import AsyncSessionLocal
    from app.models.cluster import Node

    async with AsyncSessionLocal() as session:
        rows = await session.execute(select(Node.ip))
        return [r[0] for r in rows.all()]


async def _create_node(ip: str):
    """在真实开发库插入临时节点行，返回清理协程。"""
    from app.core.database import AsyncSessionLocal
    from app.models.cluster import Node

    async with AsyncSessionLocal() as session:
        session.add(Node(
            cluster_id=1, ip=ip, service_port=80, management_port=9180,
            edge_path="/opt/edge", status=1,
        ))
        await session.commit()

    async def cleanup():
        from sqlalchemy import delete
        async with AsyncSessionLocal() as session:
            await session.execute(delete(Node).where(Node.ip == ip))
            await session.commit()

    return cleanup


class TestAnsibleInventoryAPI:
    async def _login(self, client, username="admin", password="panshi123"):
        resp = await client.post(
            "/api/v1/auth/login",
            json={"username": username, "password": password},
        )
        assert resp.status_code == 200
        return {"Authorization": f"Bearer {resp.json()['access_token']}"}

    async def _client(self):
        transport = ASGITransport(app=app)
        return AsyncClient(transport=transport, base_url="http://test")

    # ── GET ──────────────────────────────────────────────────────

    async def test_get_returns_structured_payload(self, inv_env):
        inv_env.parent.mkdir(parents=True)
        inv_env.write_text(VALID_INVENTORY, encoding="utf-8")

        async with await self._client() as client:
            headers = await self._login(client)
            resp = await client.get("/api/v1/ansible/inventory", headers=headers)

        assert resp.status_code == 200
        data = resp.json()
        assert data["raw_text"] == VALID_INVENTORY
        # Phase 6 脱敏：密码字段对外掩码，不返回明文
        assert data["hosts"] == [
            {"ip": TEST_IP_MANAGED, "ansible_ssh_user": "jboss", "ansible_ssh_pass": "******"}
        ]
        assert data["vars"] == {"ansible_ssh_user": "group_user"}
        assert data["unknown_keys"] == []

    async def test_get_missing_file_returns_empty_structure(self, inv_env):
        async with await self._client() as client:
            headers = await self._login(client)
            resp = await client.get("/api/v1/ansible/inventory", headers=headers)

        assert resp.status_code == 200
        data = resp.json()
        assert data == {
            "raw_text": "", "hosts": [], "vars": {},
            "unknown_keys": [], "unmanaged_ips": [], "errors": [],
        }

    async def test_get_returns_errors_when_parse_fails(self, inv_env):
        """解析失败时 GET 必须返回 errors，前端才能展示真实原因而非静默空白。"""
        inv_env.parent.mkdir(parents=True)
        # hosts 是列表而非映射 → 结构错误（制表符已被 parse_inventory 容忍，不能再用它触发）
        inv_env.write_text(
            "all:\n  children:\n    edge_cluster:\n      hosts:\n        - 1.2.3.4\n",
            encoding="utf-8",
        )

        async with await self._client() as client:
            headers = await self._login(client)
            resp = await client.get("/api/v1/ansible/inventory", headers=headers)

        assert resp.status_code == 200
        data = resp.json()
        assert data["hosts"] == []
        assert data["errors"], "解析失败时 errors 必须非空"
        assert "结构错误" in data["errors"][0]

    async def test_get_lists_unmanaged_ips(self, inv_env):
        content = VALID_INVENTORY.replace(
            "      hosts:\n",
            f"      hosts:\n        {TEST_IP_UNMANAGED}:\n", 1,
        )
        inv_env.parent.mkdir(parents=True)
        inv_env.write_text(content, encoding="utf-8")
        cleanup = await _create_node(TEST_IP_MANAGED)
        try:
            async with await self._client() as client:
                headers = await self._login(client)
                resp = await client.get("/api/v1/ansible/inventory", headers=headers)
        finally:
            await cleanup()

        assert resp.status_code == 200
        assert resp.json()["unmanaged_ips"] == [TEST_IP_UNMANAGED]

    async def test_get_requires_admin(self, inv_env):
        async with await self._client() as client:
            admin_headers = await self._login(client)
            username = f"inv_noadmin_{uuid.uuid4().hex[:6]}"
            created = await client.post("/api/v1/admin/users", headers=admin_headers, json={
                "username": username, "password": "pass123", "role": "user", "status": 1,
            })
            login = await client.post(
                "/api/v1/auth/login", json={"username": username, "password": "pass123"}
            )
            user_headers = {"Authorization": f"Bearer {login.json()['access_token']}"}

            no_token = await client.get("/api/v1/ansible/inventory")
            forbidden = await client.get("/api/v1/ansible/inventory", headers=user_headers)
            uid = created.json()["id"]
            await client.delete(f"/api/v1/admin/users/{uid}", headers=admin_headers)

        assert no_token.status_code == 401
        assert forbidden.status_code == 403

    # ── PUT ──────────────────────────────────────────────────────

    async def test_put_raw_text_saves_and_backs_up(self, inv_env):
        inv_env.parent.mkdir(parents=True)
        inv_env.write_text(VALID_INVENTORY, encoding="utf-8")
        new_raw = VALID_INVENTORY.replace("ansible_ssh_pass: 'pass1'", "ansible_ssh_pass: 'new_pass'")
        # 源码模式保留注释
        new_raw = "# 手工注释行\n" + new_raw

        async with await self._client() as client:
            headers = await self._login(client)
            resp = await client.put(
                "/api/v1/ansible/inventory", headers=headers,
                json={"raw_text": new_raw},
            )

        assert resp.status_code == 200
        saved = inv_env.read_text(encoding="utf-8")
        assert saved == new_raw  # 原文写回（含注释）
        baks = list((inv_env.parent / "backups").glob("host.bak.*"))
        assert len(baks) == 1 and baks[0].read_text(encoding="utf-8") == VALID_INVENTORY

    async def test_put_invalid_yaml_returns_400_with_line_and_no_write(self, inv_env):
        inv_env.parent.mkdir(parents=True)
        inv_env.write_text(VALID_INVENTORY, encoding="utf-8")

        async with await self._client() as client:
            headers = await self._login(client)
            resp = await client.put(
                "/api/v1/ansible/inventory", headers=headers,
                json={"raw_text": "all:\n\tbroken: true\n"},
            )

        assert resp.status_code == 400
        assert "第 2 行" in resp.json()["detail"]
        assert inv_env.read_text(encoding="utf-8") == VALID_INVENTORY  # 文件未变
        assert not list((inv_env.parent / "backups").glob("host.bak.*"))  # 未产生备份

    async def test_put_hosts_vars_renders_to_file(self, inv_env):
        async with await self._client() as client:
            headers = await self._login(client)
            resp = await client.put(
                "/api/v1/ansible/inventory", headers=headers,
                json={
                    "hosts": [
                        *[{"ip": ip} for ip in await _platform_ips()],
                        {"ip": "192.168.100.42", "ansible_ssh_user": "jboss"},
                        {"ip": "10.0.0.2", "ansible_ssh_user": "root", "ansible_ssh_pass": "p"},
                    ],
                    "vars": {"ansible_ssh_user": "group_user"},
                },
            )

        assert resp.status_code == 200
        text = inv_env.read_text(encoding="utf-8")
        import re
        ip_order = re.findall(r"^        ([\d.]+):", text, flags=re.M)
        # 数值序渲染：10.0.0.2 必须排在 192.168.100.42 之前（平台节点一并保留）
        assert ip_order.index("10.0.0.2") < ip_order.index("192.168.100.42")
        assert "group_user" in text

    async def test_put_hosts_masked_password_restored(self, inv_env):
        """表格模式提交掩码密码（******）时，应从当前文件恢复真实值（脱敏配套）。"""
        inv_env.parent.mkdir(parents=True)
        inv_env.write_text(VALID_INVENTORY, encoding="utf-8")

        async with await self._client() as client:
            headers = await self._login(client)
            resp = await client.put(
                "/api/v1/ansible/inventory", headers=headers,
                json={
                    "hosts": [
                        *[{"ip": ip} for ip in await _platform_ips()],
                        {"ip": TEST_IP_MANAGED, "ansible_ssh_user": "jboss",
                         "ansible_ssh_pass": "******"},
                    ],
                    "vars": {},
                },
            )

        assert resp.status_code == 200
        text = inv_env.read_text(encoding="utf-8")
        assert "ansible_ssh_pass: pass1" in text
        assert "******" not in text

    async def test_put_deletion_protection_returns_400(self, inv_env):
        cleanup = await _create_node(TEST_IP_MANAGED)
        try:
            async with await self._client() as client:
                headers = await self._login(client)
                resp = await client.put(
                    "/api/v1/ansible/inventory", headers=headers,
                    json={"hosts": [{"ip": "10.9.8.7"}], "vars": {}},
                )
        finally:
            await cleanup()

        assert resp.status_code == 400
        assert TEST_IP_MANAGED in resp.json()["detail"]

    async def test_put_running_task_conflict_409(self, inv_env):
        inv_env.parent.mkdir(parents=True)
        inv_env.write_text(VALID_INVENTORY, encoding="utf-8")

        from app.core.database import AsyncSessionLocal
        from app.models.node_task import NodeTask
        task_id = None
        async with AsyncSessionLocal() as session:
            task = NodeTask(cluster_id=1, task_type="install_test", status="running")
            session.add(task)
            await session.commit()
            task_id = task.id

        try:
            async with await self._client() as client:
                headers = await self._login(client)
                resp = await client.put(
                    "/api/v1/ansible/inventory", headers=headers,
                    json={"hosts": [], "vars": {}},
                )
        finally:
            async with AsyncSessionLocal() as session:
                from sqlalchemy import delete
                await session.execute(delete(NodeTask).where(NodeTask.id == task_id))
                await session.commit()

        assert resp.status_code == 409
        assert inv_env.read_text(encoding="utf-8") == VALID_INVENTORY

    async def test_put_requires_payload_choice(self, inv_env):
        async with await self._client() as client:
            headers = await self._login(client)
            resp = await client.put(
                "/api/v1/ansible/inventory", headers=headers, json={},
            )
        assert resp.status_code == 400

    # ── render / parse ───────────────────────────────────────────

    async def test_render_endpoint_converts_hosts_to_yaml(self, inv_env):
        async with await self._client() as client:
            headers = await self._login(client)
            resp = await client.post(
                "/api/v1/ansible/inventory/render", headers=headers,
                json={"hosts": [{"ip": "10.0.0.1"}], "vars": {}},
            )
        assert resp.status_code == 200
        assert "10.0.0.1:" in resp.json()["text"]

    async def test_parse_endpoint_reports_errors_without_raising(self, inv_env):
        async with await self._client() as client:
            headers = await self._login(client)
            ok = await client.post(
                "/api/v1/ansible/inventory/parse", headers=headers,
                json={"raw_text": VALID_INVENTORY},
            )
            bad = await client.post(
                "/api/v1/ansible/inventory/parse", headers=headers,
                json={"raw_text": "all:\n\tbroken\n"},
            )

        assert ok.status_code == 200
        assert ok.json()["errors"] == []
        assert bad.status_code == 200
        assert "第 2 行" in bad.json()["errors"][0]


class TestPutNormalization(TestAnsibleInventoryAPI):
    """ansible-inventory-advanced-fields Task 1.3: PUT 规范化与校验。"""

    async def test_put_normalizes_port_and_become(self, inv_env):
        inv_env.parent.mkdir(parents=True)
        async with await self._client() as client:
            headers = await self._login(client)
            resp = await client.put(
                "/api/v1/ansible/inventory", headers=headers,
                json={"hosts": [
                    *[{"ip": ip} for ip in await _platform_ips()],
                    {"ip": "10.1.1.13", "ansible_ssh_user": "jboss",
                     "ansible_port": "11022", "ansible_become": "yes"},
                ], "vars": {}},
            )

        assert resp.status_code == 200, resp.text
        text = inv_env.read_text(encoding="utf-8")
        assert "ansible_port: 11022" in text  # int，无引号
        assert "ansible_become: true" in text

    async def test_put_out_of_range_port_returns_400_and_no_write(self, inv_env):
        inv_env.parent.mkdir(parents=True)
        inv_env.write_text(VALID_INVENTORY, encoding="utf-8")
        async with await self._client() as client:
            headers = await self._login(client)
            resp = await client.put(
                "/api/v1/ansible/inventory", headers=headers,
                json={"hosts": [
                    *[{"ip": ip} for ip in await _platform_ips()],
                    {"ip": "10.1.1.13", "ansible_port": 99999},
                ], "vars": {}},
            )

        assert resp.status_code == 400
        assert "ansible_port" in resp.json()["detail"]
        assert inv_env.read_text(encoding="utf-8") == VALID_INVENTORY

    async def test_put_empty_string_advanced_key_dropped(self, inv_env):
        inv_env.parent.mkdir(parents=True)
        async with await self._client() as client:
            headers = await self._login(client)
            resp = await client.put(
                "/api/v1/ansible/inventory", headers=headers,
                json={"hosts": [
                    *[{"ip": ip} for ip in await _platform_ips()],
                    {"ip": "10.1.1.13", "ansible_ssh_user": "jboss",
                     "ansible_port": "", "ansible_ssh_private_key_file": ""},
                ], "vars": {}},
            )

        assert resp.status_code == 200
        text = inv_env.read_text(encoding="utf-8")
        assert "ansible_port" not in text
        assert "ansible_ssh_private_key_file" not in text
        assert "jboss" in text
