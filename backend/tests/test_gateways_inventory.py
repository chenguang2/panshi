"""中继网关清单界面化管理（relay-gateway-inventory-ui）。

覆盖：渲染器（分组/头标注/备份轮换/0600）、迁移两态幂等、CRUD→写盘集成、
凭据单查端点（列表不回传 + 审计）、注入并发兼容。
"""
from pathlib import Path

import pytest
import yaml
from sqlalchemy import select

from app.models.relay import RelayGateway
from app.services import gateways_inventory_service as gis


async def _all_gateways(session):
    return list((await session.execute(select(RelayGateway))).scalars().all())

# ── 夹具：路径隔离（autouse 已在 conftest 兜底，这里对个别用例重定向到本用例 tmp） ──


@pytest.fixture
def gw_path(tmp_path, monkeypatch):
    p = str(tmp_path / "inventory" / "gateways")
    monkeypatch.setattr(gis, "GATEWAYS_PATH", p)
    Path(p).parent.mkdir(parents=True, exist_ok=True)
    return p


LEGACY_YAML = """# 中继网关机清单（手工维护）
gateways_aoh:
  hosts:
    192.168.0.13:
      ansible_user: jboss
      ansible_ssh_pass: legacy-pass
      ansible_ssh_common_args: -o StrictHostKeyChecking=no
      ansible_python_interpreter: /work/jboss/anaconda3/bin/python3
gateways_legacy_zone:
  hosts:
    10.9.9.9:
      ansible_user: root
      ansible_ssh_pass: orphan-pass
"""


def _write(path: str, text: str) -> None:
    Path(path).write_text(text, encoding="utf-8")


def _row(**over):
    base = dict(
        code="aoh",
        name="演示局",
        http_base_url=None,
        ssh_jump="jboss@192.168.0.13",
        openresty_prefix=None,
        status="enabled",
        ssh_user="jboss",
        ssh_password="db-pass",
        ssh_port=22,
        ansible_python_interpreter="/work/jboss/anaconda3/bin/python3",
        ssh_common_args="-o StrictHostKeyChecking=no",
    )
    base.update(over)
    return RelayGateway(**base)


# ── 渲染器 ──


class TestRenderer:
    def test_render_groups_and_header(self, isolated_session):
        import asyncio

        async def build():
            async with isolated_session() as s:
                s.add(_row(code="aoh"))
                s.add(_row(code="bj", ssh_password=None, ssh_port=2222))
                await s.commit()
                rows = await _all_gateways(s)
                return gis.render_content(list(rows), orphan_groups=[])

        text = asyncio.run(build())
        assert text.startswith(gis.GENERATED_HEADER)
        assert "gateways_aoh:" in text and "gateways_bj:" in text
        assert "ansible_user: jboss" in text
        assert "ansible_ssh_pass: db-pass" in text
        # 无口令 = 密钥认证：不输出 ansible_ssh_pass 行
        bj_block = text.split("gateways_bj:")[1]
        assert "ansible_ssh_pass" not in bj_block
        assert "2222" in bj_block

    def test_write_backup_atomic_and_0600(self, gw_path, isolated_session):
        import asyncio
        import os
        import stat

        _write(gw_path, "old: content\n")

        async def run():
            async with isolated_session() as s:
                rows = []
                gis.render_and_write([], orphan_groups=[], previous_text_path=gw_path)

        asyncio.run(run())
        text = Path(gw_path).read_text(encoding="utf-8")
        assert text.startswith(gis.GENERATED_HEADER)
        assert stat.S_IMODE(os.stat(gw_path).st_mode) == 0o600
        backups = list(Path(gw_path).parent.glob("gateways.bak.*"))
        assert len(backups) == 1
        assert "old: content" in backups[0].read_text(encoding="utf-8")

    def test_backup_rotation_keeps_recent_ten(self, gw_path, isolated_session):
        import asyncio

        _write(gw_path, "seed: legacy\n")
        for i in range(12):
            Path(f"{gw_path}.bak.{i:019d}").write_text(str(i), encoding="utf-8")

        async def run():
            gis.render_and_write([], orphan_groups=[], previous_text_path=gw_path)

        asyncio.run(run())
        backups = sorted(Path(gw_path).parent.glob("gateways.bak.*"))
        assert len(backups) == 10
        # 最旧的被清掉
        assert "0" not in [b.suffix for b in backups]


# ── 迁移 ──


class TestMigration:
    def test_legacy_import_backfill_orphan_and_header(self, gw_path, isolated_session):
        import asyncio

        _write(gw_path, LEGACY_YAML)

        async def run():
            async with isolated_session() as s:
                s.add(_row(code="aoh", ssh_user=None, ssh_password=None))
                await s.commit()
                await gis.migrate_gateways_file(s)
                row = (await s.execute(select(RelayGateway))).scalar_one()
                assert row.ssh_user == "jboss"
                assert row.ssh_password == "legacy-pass"
                assert row.ssh_common_args == "-o StrictHostKeyChecking=no"
                text = Path(gw_path).read_text(encoding="utf-8")
                assert text.startswith(gis.GENERATED_HEADER)
                # 孤儿分组原样保留
                assert "gateways_legacy_zone:" in text
                assert "orphan-pass" in text
                status = await gis.inventory_status(s)
                assert status["orphan_groups"] == ["gateways_legacy_zone"]
                assert status["generated"] is True

        asyncio.run(run())

    def test_idempotent_when_generated(self, gw_path, isolated_session):
        import asyncio

        _write(gw_path, gis.GENERATED_HEADER + "\ngateways_aoh:\n  hosts: {}\n")
        before = Path(gw_path).read_text(encoding="utf-8")

        async def run():
            async with isolated_session() as s:
                await gis.migrate_gateways_file(s)

        asyncio.run(run())
        assert Path(gw_path).read_text(encoding="utf-8") == before


# ── API 集成 ──


class TestCrudWritesInventory:
    def test_create_updates_file_and_delete_removes_group(self, gw_path):
        from tests.api_helpers import AuthedTestClient

        from app import main as app_main
        with AuthedTestClient(app_main.app) as c:
            resp = c.post(
                "/api/v1/relay/gateways",
                json={
                    "code": "aoh",
                    "name": "演示局",
                    "ssh_user": "jboss",
                    "ssh_password": "p@ss",
                    "ssh_port": 22,
                },
            )
            assert resp.status_code in (200, 201), resp.text
            text = Path(gw_path).read_text(encoding="utf-8")
            assert "gateways_aoh:" in text and "ansible_ssh_pass: p@ss" in text

            body = resp.json()
            assert "ssh_password" not in body  # Out schema 不回传口令

            resp = c.delete(f"/api/v1/relay/gateways/{body['id']}")
            assert resp.status_code == 200
            assert "gateways_aoh:" not in Path(gw_path).read_text(encoding="utf-8")

    def test_credential_endpoint_scoped_and_404(self, gw_path):
        from app import main as app_main
        from tests.api_helpers import AuthedTestClient

        with AuthedTestClient(app_main.app) as c:
            body = c.post(
                "/api/v1/relay/gateways",
                json={"code": "aoh", "name": "演示局", "ssh_user": "jboss", "ssh_password": "secret-x"},
            ).json()
            resp = c.get(f"/api/v1/relay/gateways/{body['id']}/credential")
            assert resp.status_code == 200
            assert resp.json()["ssh_password"] == "secret-x"
            # 未注册 id → 404
            assert c.get("/api/v1/relay/gateways/999999/credential").status_code == 404

    @pytest.mark.asyncio
    async def test_credential_view_is_audited(self, gw_path, async_authed_client, isolated_session):
        """单查口令写 view_credential 审计。

        全 async 形态（async_authed_client 主循环 httpx）：sync TestClient 的
        portal 线程循环会污染全局引擎连接池的 loop 归属，async 断言在全量序中
        命中「attached to a different loop」（单跑/域跑绿、全量必红）。
        """
        from app.models.system import AuditLog

        body = (await async_authed_client.post(
            "/api/v1/relay/gateways",
            json={"code": "aoh", "name": "演示局", "ssh_user": "jboss", "ssh_password": "secret-x"},
        )).json()
        resp = await async_authed_client.get(f"/api/v1/relay/gateways/{body['id']}/credential")
        assert resp.status_code == 200

        async with isolated_session() as s:
            rows = (await s.execute(select(AuditLog))).scalars().all()
            assert any(
                r.action == "view_credential" and r.resource == "relay_gateway" for r in rows
            )


# ── 注入并发兼容 ──


class TestInjectionCompat:
    def test_render_from_db_only_no_injected_rows(self, isolated_session):
        import asyncio

        async def run():
            async with isolated_session() as s:
                s.add(_row(code="aoh"))
                await s.commit()
                rows = await _all_gateways(s)
                return gis.render_content(list(rows), orphan_groups=[])

        text = asyncio.run(run())
        assert "panshi-injected" not in text

    def test_sweep_idempotent_when_no_injected_lines(self, gw_path):
        import asyncio

        _write(gw_path, gis.GENERATED_HEADER + "\ngateways_aoh:\n  hosts: {}\n")

        async def run():
            from app.services import relay_sshd

            return await asyncio.to_thread(relay_sshd.sweep_injected_creds)

        assert asyncio.run(run()) == 0
