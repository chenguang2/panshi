"""Ansible inventory API 集成测试（任务 2.1–2.4）。

覆盖：GET/PUT/render/parse 四端点、管理员守卫（401/403）、
校验失败 400 带行号、保存后文件内容断言、备份生成、运行中任务 409。
"""

import uuid
import re

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
    """当前开发库中已录入的全部节点 IP（保全回归用）。"""
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
        # 清单页是凭据管理模块，密码明文返回（掩码曾把 ****** 写回文件导致异常）
        assert data["hosts"] == [
            {"ip": TEST_IP_MANAGED, "ansible_ssh_user": "jboss", "ansible_ssh_pass": "pass1"}
        ]
        assert data["vars"] == {"ansible_ssh_user": "group_user"}
        assert data["unknown_keys"] == []
        # ansible-inventory-ux-review-fixes 批 2：文件元数据（naive UTC isoformat）
        assert re.match(r"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}", data["last_modified"])

    async def test_get_missing_file_returns_empty_structure(self, inv_env):
        async with await self._client() as client:
            headers = await self._login(client)
            resp = await client.get("/api/v1/ansible/inventory", headers=headers)

        assert resp.status_code == 200
        data = resp.json()
        assert data == {
            "raw_text": "", "hosts": [], "vars": {},
            "unknown_keys": [], "unmanaged_ips": [], "errors": [],
            "last_modified": None,
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
            # 每个菜单项独立权限：授予 ansible_inventory 后普通用户可访问
            await client.put(
                f"/api/v1/admin/users/{created.json()['id']}/permissions",
                headers=admin_headers, json={"permissions": ["ansible_inventory"]},
            )
            granted = await client.get("/api/v1/ansible/inventory", headers=user_headers)
            uid = created.json()["id"]
            await client.delete(f"/api/v1/admin/users/{uid}", headers=admin_headers)

        assert no_token.status_code == 401
        assert forbidden.status_code == 403
        assert granted.status_code == 200

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

    async def test_put_removing_platform_node_ip_saves(self, inv_env):
        """2026-10-27 二次裁决：删除保护已移除——移除平台已录入的 IP 直接保存生效。"""
        inv_env.parent.mkdir(parents=True)
        inv_env.write_text(VALID_INVENTORY, encoding="utf-8")  # 基线：清单已有受管 IP
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

        assert resp.status_code == 200, resp.text
        text = inv_env.read_text(encoding="utf-8")
        assert "10.9.8.7" in text
        assert TEST_IP_MANAGED not in text  # 移除即生效，不拦

    async def test_put_platform_ip_never_in_inventory_saves(self, inv_env):
        """A 口径（2026-10-27 裁决）：平台有但清单从来没有的节点，不收录不阻止保存。

        旧口径（清单必须收录全部平台 IP）在多集群环境下任何保存都会 400。
        """
        cleanup = await _create_node(TEST_IP_MANAGED)  # 平台有此节点
        try:
            async with await self._client() as client:
                headers = await self._login(client)
                resp = await client.put(
                    "/api/v1/ansible/inventory", headers=headers,
                    json={"hosts": [{"ip": "10.9.8.7"}], "vars": {}},  # 不含受管 IP
                )
        finally:
            await cleanup()

        assert resp.status_code == 200, resp.text
        assert "10.9.8.7" in inv_env.read_text(encoding="utf-8")

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


# 构建「包含全部平台节点 IP」的 raw 清单文本：见 TestRawTextGuard._platform_inventory_raw
RAW_MISSING_MANAGED_IP = """\
all:
  children:
    edge_cluster:
      hosts:
        10.9.8.7:
          ansible_ssh_user: jboss
          ansible_ssh_pass: 'pass1'
"""

RAW_WITH_HOST_KEY_BYPASS = """\
all:
  children:
    edge_cluster:
      hosts:
        198.51.100.10:
          ansible_ssh_user: jboss
          ansible_ssh_pass: 'pass1'
        bad host!:
          ansible_ssh_user: x
"""


class TestRawTextGuard(TestAnsibleInventoryAPI):
    """ansible-inventory-ux-review-fixes 批 1：raw_text 与 hosts 路径同等结构校验。

    修复前 raw_text 只做 parse_inventory，跳过 validate_structure
    （主机键合法性）。删除保护已于 2026-10-27 二次裁决移除（清单与节点管理解耦）。
    """

    async def _platform_inventory_raw(self) -> str:
        """含全部平台节点 IP 的合法 raw 清单（VALID_INVENTORY 为基底 + 平台 IP 裸键）。"""
        extra = "".join(
            f"        {ip}:\n" for ip in await _platform_ips() if ip != TEST_IP_MANAGED
        )
        if not extra:
            return VALID_INVENTORY
        return VALID_INVENTORY.replace("      vars:", extra + "      vars:")

    async def test_put_raw_text_removing_platform_node_ip_saves(self, inv_env):
        """2026-10-27 二次裁决：raw 路径同样不拦删除——移除受管 IP 直接保存。"""
        inv_env.parent.mkdir(parents=True)
        inv_env.write_text(VALID_INVENTORY, encoding="utf-8")
        cleanup = await _create_node(TEST_IP_MANAGED)
        try:
            async with await self._client() as client:
                headers = await self._login(client)
                # raw 文本缺失受管节点 IP → 保存放行（清单与节点管理解耦）
                resp = await client.put(
                    "/api/v1/ansible/inventory", headers=headers,
                    json={"raw_text": RAW_MISSING_MANAGED_IP},
                )
        finally:
            await cleanup()

        assert resp.status_code == 200, resp.text
        assert inv_env.read_text(encoding="utf-8") == RAW_MISSING_MANAGED_IP

    async def test_put_raw_text_platform_ip_never_in_inventory_saves(self, inv_env):
        """A 口径：raw 路径同样只拦真删除；平台多出的无关节点不阻止保存。"""
        inv_env.parent.mkdir(parents=True)
        inv_env.write_text(VALID_INVENTORY, encoding="utf-8")
        cleanup = await _create_node("198.51.100.77")  # 平台有、清单从来没有
        try:
            async with await self._client() as client:
                headers = await self._login(client)
                resp = await client.put(
                    "/api/v1/ansible/inventory", headers=headers,
                    json={"raw_text": VALID_INVENTORY},
                )
        finally:
            await cleanup()

        assert resp.status_code == 200, resp.text

    async def test_put_raw_text_invalid_host_key_returns_400_and_no_write(self, inv_env):
        inv_env.parent.mkdir(parents=True)
        inv_env.write_text(VALID_INVENTORY, encoding="utf-8")
        # 插到 hosts 块内（vars 段之前）；YAML 对含空格的裸键合法，parse 能过
        raw = VALID_INVENTORY.replace(
            "      vars:", "        bad host!: null\n      vars:")

        async with await self._client() as client:
            headers = await self._login(client)
            resp = await client.put(
                "/api/v1/ansible/inventory", headers=headers,
                json={"raw_text": raw},
            )

        assert resp.status_code == 400
        assert "主机键不合法" in resp.json()["detail"]
        assert inv_env.read_text(encoding="utf-8") == VALID_INVENTORY  # 未写盘

    async def test_put_raw_text_with_all_platform_ips_still_saves(self, inv_env):
        """护栏补齐的回归面：raw 含全部平台 IP 时必须照常保存（含注释保真）。"""
        inv_env.parent.mkdir(parents=True)
        inv_env.write_text(VALID_INVENTORY, encoding="utf-8")
        raw = "# 手工注释行\n" + await self._platform_inventory_raw()

        async with await self._client() as client:
            headers = await self._login(client)
            resp = await client.put(
                "/api/v1/ansible/inventory", headers=headers,
                json={"raw_text": raw},
            )

        assert resp.status_code == 200, resp.text
        assert inv_env.read_text(encoding="utf-8") == raw


class TestBackupsAndRestore(TestAnsibleInventoryAPI):
    """ansible-inventory-ux-review-fixes 批 1：备份列表 / 预览 / 一键恢复。"""

    BAK_OLD = "host.bak.20250101000000"
    BAK_NEW = "host.bak.20250102000000"
    BACKUP_TEXT = VALID_INVENTORY

    def _make_backups(self, inv_path):
        backup_dir = inv_path.parent / "backups"
        backup_dir.mkdir(parents=True, exist_ok=True)
        (backup_dir / self.BAK_OLD).write_text(self.BACKUP_TEXT, encoding="utf-8")
        (backup_dir / self.BAK_NEW).write_text(self.BACKUP_TEXT, encoding="utf-8")

    async def test_backup_list_returns_desc_by_time(self, inv_env, monkeypatch):
        inv_env.parent.mkdir(parents=True)
        self._make_backups(inv_env)

        # saved_at 契约 = 文件名本地墙钟 → naive UTC（#26）；钉 TZ=UTC 下两者同值，
        # 使断言与跑测试机器的时区无关（精确转换由服务级参数化用例钉死）。
        import os
        import time

        old_tz = os.environ.get("TZ")
        try:
            monkeypatch.setenv("TZ", "UTC")
            time.tzset()
            async with await self._client() as client:
                headers = await self._login(client)
                resp = await client.get("/api/v1/ansible/inventory/backups", headers=headers)
        finally:
            if old_tz is None:
                os.environ.pop("TZ", None)
            else:
                os.environ["TZ"] = old_tz
            time.tzset()

        assert resp.status_code == 200
        items = resp.json()["backups"]
        assert [b["name"] for b in items] == [self.BAK_NEW, self.BAK_OLD]
        assert items[0]["saved_at"] == "2025-01-02T00:00:00"
        assert items[0]["size_bytes"] > 0

    async def test_backup_list_empty_when_no_backups(self, inv_env):
        inv_env.parent.mkdir(parents=True)
        async with await self._client() as client:
            headers = await self._login(client)
            resp = await client.get("/api/v1/ansible/inventory/backups", headers=headers)
        assert resp.status_code == 200
        assert resp.json()["backups"] == []

    async def test_backup_content_preview(self, inv_env):
        inv_env.parent.mkdir(parents=True)
        self._make_backups(inv_env)

        async with await self._client() as client:
            headers = await self._login(client)
            resp = await client.get(
                f"/api/v1/ansible/inventory/backups/{self.BAK_OLD}/content", headers=headers)

        assert resp.status_code == 200
        assert resp.json()["raw_text"] == self.BACKUP_TEXT

    async def test_backup_content_rejects_bad_name(self, inv_env):
        inv_env.parent.mkdir(parents=True)
        async with await self._client() as client:
            headers = await self._login(client)
            bad_name = await client.get(
                "/api/v1/ansible/inventory/backups/host.bak.abc/content", headers=headers)
            missing = await client.get(
                "/api/v1/ansible/inventory/backups/host.bak.20990101000000/content",
                headers=headers)

        assert bad_name.status_code == 404
        assert missing.status_code == 404

    async def test_restore_writes_content_and_backs_up_current(self, inv_env):
        inv_env.parent.mkdir(parents=True)
        inv_env.write_text(VALID_INVENTORY, encoding="utf-8")
        self._make_backups(inv_env)
        restored_text = self.BACKUP_TEXT.replace("'pass1'", "'restored_pass'")
        (inv_env.parent / "backups" / self.BAK_NEW).write_text(restored_text, encoding="utf-8")

        async with await self._client() as client:
            headers = await self._login(client)
            resp = await client.post(
                f"/api/v1/ansible/inventory/backups/{self.BAK_NEW}/restore", headers=headers)

        assert resp.status_code == 200
        assert inv_env.read_text(encoding="utf-8") == restored_text
        # 恢复可逆：恢复动作先把恢复前的当前文件自动备份
        baks = list((inv_env.parent / "backups").glob("host.bak.*"))
        assert any(b.read_text(encoding="utf-8") == VALID_INVENTORY
                   for b in baks if b.name not in (self.BAK_OLD, self.BAK_NEW))

    async def test_restore_running_task_conflict_409_and_no_write(self, inv_env):
        inv_env.parent.mkdir(parents=True)
        inv_env.write_text(VALID_INVENTORY, encoding="utf-8")
        self._make_backups(inv_env)

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
                resp = await client.post(
                    f"/api/v1/ansible/inventory/backups/{self.BAK_NEW}/restore",
                    headers=headers)
        finally:
            from sqlalchemy import delete
            async with AsyncSessionLocal() as session:
                await session.execute(delete(NodeTask).where(NodeTask.id == task_id))
                await session.commit()

        assert resp.status_code == 409
        assert inv_env.read_text(encoding="utf-8") == VALID_INVENTORY

    async def test_restore_of_backup_missing_platform_ip_saves(self, inv_env):
        """2026-10-27 二次裁决：恢复不再受删除保护拦截——缺受管 IP 的备份可直接恢复。"""
        inv_env.parent.mkdir(parents=True)
        inv_env.write_text(VALID_INVENTORY, encoding="utf-8")
        cleanup = await _create_node(TEST_IP_MANAGED)
        try:
            backup_dir = inv_env.parent / "backups"
            backup_dir.mkdir(parents=True, exist_ok=True)
            backup_text = "all:\n  children:\n    edge_cluster:\n      hosts:\n        10.9.9.9:\n"
            (backup_dir / self.BAK_NEW).write_text(backup_text, encoding="utf-8")

            async with await self._client() as client:
                headers = await self._login(client)
                resp = await client.post(
                    f"/api/v1/ansible/inventory/backups/{self.BAK_NEW}/restore",
                    headers=headers)
        finally:
            await cleanup()

        assert resp.status_code == 200, resp.text
        assert inv_env.read_text(encoding="utf-8") == backup_text

    async def test_restore_missing_backup_returns_404(self, inv_env):
        inv_env.parent.mkdir(parents=True)
        async with await self._client() as client:
            headers = await self._login(client)
            resp = await client.post(
                "/api/v1/ansible/inventory/backups/host.bak.20990101000000/restore",
                headers=headers)
        assert resp.status_code == 404

    async def test_restore_rejects_bad_name(self, inv_env):
        inv_env.parent.mkdir(parents=True)
        async with await self._client() as client:
            headers = await self._login(client)
            resp = await client.post(
                "/api/v1/ansible/inventory/backups/host.bak.abc/restore", headers=headers)
        assert resp.status_code == 404
