"""节点任务列表载荷与过滤测试（openspec: node-task-ux-optimization 第 5 组 / design D7）。

背景（已核实）：
- 任务中心是**跨集群**的全局列表，但行里只有 ``cluster_id`` 没有集群名；
- ``NodeTask.created_by`` 列存在、``create_task(created_by=...)`` 形参也有，但端点
  从不传 → 恒为 NULL，界面无法显示「谁发起的」；
- 列表只有 status/task_type 过滤，没有关键字、集群、时间范围过滤。

本文件钉死：
1. 列表/详情载荷含 ``cluster_name``（display_name 优先，回退 name，集群不存在 → None）
   与 ``created_by_name``（历史任务 NULL → None）；
2. 创建端点把 ``current_user.id`` 落进 ``created_by``；
3. ``q`` 支持 任务号 / 节点 IP 片段 / 命令关键字（大小写不敏感）；
4. 全局列表 ``cluster_id`` 过滤；
5. ``created_from``/``created_to`` 日期型输入包含当天 23:59:59；
6. 非法时间参数 → 400 且中文明文；
7. 查询次数不随行数增长（禁止 N+1 补集群名/用户名）。
"""

import asyncio
from datetime import datetime, timedelta

import pytest
from sqlalchemy import event

from app.models.cluster import Cluster


class _PersistingTaskService:
    """最小 create_task 实现：真实写库，用于验证端点确实把 created_by 传下来。

    只实现 create_task（创建端点唯一调用点），不启动执行线程。
    """

    async def create_task(self, **kwargs):
        from app.models.node_task import NodeTask

        db = kwargs["db"]
        task = NodeTask(
            cluster_id=kwargs["cluster_id"],
            task_type=kwargs["task_type"],
            status="pending",
            created_by=kwargs.get("created_by"),
            total_nodes=len(kwargs["node_ids"]),
        )
        task.set_params(kwargs.get("params") or {})
        db.add(task)
        await db.commit()
        await db.refresh(task)
        return task


class TestNodeTaskListPayload:
    @pytest.fixture
    def client(self, test_db, test_db_factory):
        from app.core.database import get_db
        from app.core.security import hash_password
        from app.main import app
        from app.models.user import User
        from tests.api_helpers import AuthedTestClient, isolated_app_lifespan

        async def override_get_db():
            async with test_db_factory() as session:
                yield session

        app.dependency_overrides[get_db] = override_get_db

        async def _seed_user():
            if await test_db.get(User, 1) is None:
                test_db.add(
                    User(
                        id=1,
                        username="api_user",
                        password_hash=hash_password("password123"),
                        role="admin",
                        status=1,
                    )
                )
                await test_db.commit()

        asyncio.run(_seed_user())

        with isolated_app_lifespan(), AuthedTestClient(app) as c:
            yield c
        app.dependency_overrides.clear()

    # ── 造数据助手 ────────────────────────────────────────────────────

    @staticmethod
    async def _seed_task(
        test_db,
        *,
        task_id: int | None = None,
        cluster_id: int = 1,
        created_by: int | None = None,
        created_at: datetime | None = None,
        params: dict | None = None,
        ip: str | None = None,
    ) -> int:
        from app.models.node_task import NodeTask, NodeTaskItem

        task = NodeTask(
            cluster_id=cluster_id,
            task_type="cmd_exec",
            status="success",
            total_nodes=1,
            success_nodes=1,
        )
        if task_id is not None:
            task.id = task_id
        task.set_params(params or {})
        task.created_by = created_by
        if created_at is not None:
            task.created_at = created_at
        test_db.add(task)
        await test_db.flush()
        if ip:
            test_db.add(NodeTaskItem(task_id=task.id, node_id=1, ip=ip, status="success", rc=0))
        await test_db.commit()
        return task.id

    # ── 1. 载荷：集群名 / 发起人 ─────────────────────────────────────

    def test_list_and_detail_return_cluster_name_and_creator_name(self, client, test_db):
        """display_name 优先；无 display_name 回退 name；集群不存在/发起人为空 → None。"""

        async def _seed():
            cluster = await test_db.get(Cluster, 2)
            cluster.display_name = "生产集群乙"
            await test_db.commit()
            a = await self._seed_task(test_db, task_id=2001, cluster_id=2, created_by=1)
            b = await self._seed_task(test_db, task_id=2002, cluster_id=1, created_by=None)
            c = await self._seed_task(test_db, task_id=2003, cluster_id=999, created_by=None)
            return a, b, c

        a, b, c = asyncio.run(_seed())

        resp = client.get("/api/v1/node-tasks")
        assert resp.status_code == 200, resp.text
        items = {t["id"]: t for t in resp.json()["items"]}
        assert items[a]["cluster_name"] == "生产集群乙"
        assert items[a]["created_by_name"] == "api_user"
        assert items[b]["cluster_name"] == "seed-cluster-1"  # 回退 name
        assert items[b]["created_by_name"] is None  # 历史任务无发起人
        assert items[c]["cluster_name"] is None  # 集群已删除
        assert items[c]["created_by_name"] is None

        # 集群域列表端点同样带这两个字段
        resp2 = client.get("/api/v1/clusters/2/node-tasks")
        assert resp2.status_code == 200, resp2.text
        rows = {t["id"]: t for t in resp2.json()["items"]}
        assert rows[a]["cluster_name"] == "生产集群乙"
        assert rows[a]["created_by_name"] == "api_user"

        # 详情端点
        detail = client.get(f"/api/v1/node-tasks/{a}")
        assert detail.status_code == 200, detail.text
        assert detail.json()["cluster_name"] == "生产集群乙"
        assert detail.json()["created_by_name"] == "api_user"

        detail_b = client.get(f"/api/v1/node-tasks/{b}")
        assert detail_b.json()["created_by_name"] is None
        assert detail_b.json()["cluster_name"] == "seed-cluster-1"

    # ── 2. 创建人落库 ────────────────────────────────────────────────

    def test_create_records_current_user_as_creator(self, client, test_db, test_db_factory, monkeypatch):
        from app.models.cluster import Node
        from app.models.node_task import NodeTask

        async def _seed_node():
            if await test_db.get(Node, 1) is None:
                test_db.add(
                    Node(
                        id=1,
                        cluster_id=1,
                        ip="127.0.0.1",
                        service_port=80,
                        management_port=9180,
                        edge_path="/data/openresty",
                        status=1,
                    )
                )
                await test_db.commit()

        asyncio.run(_seed_node())
        monkeypatch.setattr(
            "app.api.v1.node_tasks.get_node_task_service",
            lambda: _PersistingTaskService(),
        )

        resp = client.post(
            "/api/v1/clusters/1/node-tasks",
            json={"task_type": "start", "node_ids": [1], "params": {}},
        )
        assert resp.status_code in (200, 201), resp.text
        task_id = resp.json()["id"]

        async def _load_creator():
            async with test_db_factory() as s:
                return (await s.get(NodeTask, task_id)).created_by

        assert asyncio.run(_load_creator()) == 1, "创建端点必须把 current_user.id 写入 created_by"

        detail = client.get(f"/api/v1/node-tasks/{task_id}")
        assert detail.status_code == 200, detail.text
        assert detail.json()["created_by_name"] == "api_user"

    # ── 3. 关键字 q ──────────────────────────────────────────────────

    def test_q_matches_task_id_ip_and_command(self, client, test_db):
        async def _seed():
            await self._seed_task(
                test_db, task_id=5001, params={"cmd": "systemctl reload openresty"}, ip="10.0.0.1"
            )
            await self._seed_task(test_db, task_id=5002, params={"cmd": "uptime"}, ip="192.168.0.14")
            await self._seed_task(test_db, task_id=5003, params={"cmd": "df -h"}, ip="10.9.9.9")

        asyncio.run(_seed())

        # 任务号：只命中 5002
        resp = client.get("/api/v1/node-tasks", params={"q": "5002"})
        assert resp.status_code == 200, resp.text
        assert [t["id"] for t in resp.json()["items"]] == [5002]

        # 节点 IP 片段
        resp = client.get("/api/v1/node-tasks", params={"q": "192.168.0"})
        assert [t["id"] for t in resp.json()["items"]] == [5002]

        # 命令关键字（大写输入也要命中库里的原文小写）
        resp = client.get("/api/v1/node-tasks", params={"q": "OPENRESTY"})
        assert [t["id"] for t in resp.json()["items"]] == [5001]

        # 不命中
        resp = client.get("/api/v1/node-tasks", params={"q": "zzz-nomatch"})
        body = resp.json()
        assert body["total"] == 0
        assert body["items"] == []

        # 集群域端点同样支持 q
        resp = client.get("/api/v1/clusters/1/node-tasks", params={"q": "192.168.0"})
        assert [t["id"] for t in resp.json()["items"]] == [5002]

    # ── 4. 集群过滤（全局端点）───────────────────────────────────────

    def test_cluster_id_filter_on_global_list(self, client, test_db):
        async def _seed():
            await self._seed_task(test_db, task_id=5101, cluster_id=1)
            await self._seed_task(test_db, task_id=5102, cluster_id=2)

        asyncio.run(_seed())

        resp = client.get("/api/v1/node-tasks", params={"cluster_id": 2})
        assert resp.status_code == 200, resp.text
        assert [t["id"] for t in resp.json()["items"]] == [5102]
        assert resp.json()["total"] == 1

        # 集群域端点不受该参数影响（仍只返回路径指定集群的任务）
        resp = client.get("/api/v1/clusters/1/node-tasks", params={"cluster_id": 2})
        assert [t["id"] for t in resp.json()["items"]] == [5101]

    # ── 5. 时间范围（含当天 23:59:59）────────────────────────────────

    def test_created_time_range_includes_whole_day(self, client, test_db):
        today = datetime.utcnow().date()
        yesterday = today - timedelta(days=1)
        tomorrow = today + timedelta(days=1)

        async def _seed():
            await self._seed_task(
                test_db, task_id=5201, created_at=datetime.combine(yesterday, datetime.min.time()).replace(hour=12)
            )
            await self._seed_task(
                test_db, task_id=5202, created_at=datetime.combine(today, datetime.min.time()).replace(hour=8)
            )
            await self._seed_task(
                test_db, task_id=5203, created_at=datetime.combine(today, datetime.min.time()).replace(hour=23, minute=50)
            )
            await self._seed_task(
                test_db, task_id=5204, created_at=datetime.combine(tomorrow, datetime.min.time()).replace(hour=10)
            )

        asyncio.run(_seed())

        resp = client.get(
            "/api/v1/node-tasks",
            params={"created_from": str(today), "created_to": str(today)},
        )
        assert resp.status_code == 200, resp.text
        assert sorted(t["id"] for t in resp.json()["items"]) == [5202, 5203]
        assert resp.json()["total"] == 2

        # 日期时间型输入：09:00 之后 → 只剩 23:50 那条
        resp = client.get(
            "/api/v1/node-tasks",
            params={"created_from": f"{today}T09:00:00", "created_to": f"{today}T23:59:59"},
        )
        assert [t["id"] for t in resp.json()["items"]] == [5203]

        # 集群域端点同样支持时间范围
        resp = client.get(
            "/api/v1/clusters/1/node-tasks",
            params={"created_from": str(today), "created_to": str(today)},
        )
        assert sorted(t["id"] for t in resp.json()["items"]) == [5202, 5203]

    # ── 6. 非法时间参数 ──────────────────────────────────────────────

    @pytest.mark.parametrize("param", ["created_from", "created_to"])
    def test_invalid_time_param_returns_400(self, client, param):
        resp = client.get("/api/v1/node-tasks", params={param: "2026-13-45"})
        assert resp.status_code == 400, resp.text
        assert resp.json()["detail"] == "时间范围格式不正确，请使用 YYYY-MM-DD"

    def test_invalid_time_param_on_cluster_endpoint_returns_400(self, client):
        resp = client.get("/api/v1/clusters/1/node-tasks", params={"created_from": "昨天"})
        assert resp.status_code == 400, resp.text
        assert resp.json()["detail"] == "时间范围格式不正确，请使用 YYYY-MM-DD"

    # ── 7. 查询次数守卫（禁止 N+1）───────────────────────────────────

    @pytest.mark.parametrize(
        "url", ["/api/v1/node-tasks", "/api/v1/clusters/1/node-tasks"]
    )
    def test_query_count_does_not_grow_with_rows(self, client, test_db, url):
        """1 条任务与 5 条任务时的 SQL 次数必须一致（集群名/用户名用一次 JOIN 取完）。"""

        async def _seed(count: int, start_id: int):
            for i in range(count):
                await self._seed_task(
                    test_db,
                    task_id=start_id + i,
                    cluster_id=1,
                    created_by=1,
                    params={"cmd": f"echo {i}"},
                    ip=f"10.0.1.{i}",
                )

        asyncio.run(_seed(1, 5301))

        statements: list[str] = []

        def _before(conn, cursor, statement, params, context, executemany):
            statements.append(statement)

        engine = test_db.bind.sync_engine
        event.listen(engine, "before_cursor_execute", _before)
        try:
            # 预热：首个请求可能触发连接初始化（PRAGMA 等），不计入比较
            assert client.get(url).status_code == 200
            statements.clear()

            resp_one = client.get(url)
            assert resp_one.status_code == 200, resp_one.text
            count_one = len(statements)
            statements.clear()

            event.remove(engine, "before_cursor_execute", _before)
            asyncio.run(_seed(4, 5401))
            event.listen(engine, "before_cursor_execute", _before)

            resp_five = client.get(url)
            assert resp_five.status_code == 200, resp_five.text
            count_five = len(statements)
        finally:
            event.remove(engine, "before_cursor_execute", _before)

        assert len(resp_one.json()["items"]) == 1
        assert len(resp_five.json()["items"]) == 5
        assert count_one == count_five, (
            f"SQL 次数随行数增长（1 条={count_one}，5 条={count_five}）："
            f"集群名/用户名疑似逐行查询（N+1）\n" + "\n".join(statements)
        )
