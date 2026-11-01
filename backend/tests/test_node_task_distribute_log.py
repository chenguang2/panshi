"""distribute_file 批量分发日志按节点路由（node-task-ux-review §11.5）。

此前 ``_execute_distribute_batch._on_log`` 把每条 ansible 输出行写入每个节点
日志并广播给每个节点，节点 A 的日志混满节点 B 的输出。路由语义必须与
``_parse_distribute_results`` 的 ``[ip]`` 前缀判定完全一致。
"""

import json

import pytest

from app.models.node_task import NodeTask, NodeTaskItem


def _session_factory(test_db):
    """Return a session factory bound to the same engine as the test_db."""
    from sqlalchemy.ext.asyncio import async_sessionmaker

    return async_sessionmaker(test_db.bind, class_=type(test_db), expire_on_commit=False)


def _params():
    return {"srcpath": "temp/abc-uuid", "destpath": "/tmp/", "srcfilename": "3.csv"}


@pytest.fixture
def batch_env(test_db, tmp_path, monkeypatch):
    """Fake ansible：run_playbook 逐行回调 on_progress；日志目录隔离到 tmp_path。"""
    from types import SimpleNamespace
    from unittest.mock import AsyncMock

    from app.services import node_task_service as nts_mod
    from app.services import task_log_store

    monkeypatch.setattr(nts_mod, "TASK_SCRIPTS_DIR", tmp_path)
    monkeypatch.setattr(task_log_store, "_log_dir", tmp_path)

    def _make(items_spec, playbook_lines, result=None):
        async def fake_run_playbook(ip, tag, ev, cancel_event=None, on_progress=None, job_timeout=None):
            if on_progress:
                for line in playbook_lines:
                    on_progress({"stdout": line})
            return result or {
                "rc": 0, "status": "successful",
                "stdout": "\n".join(playbook_lines), "stderr": "",
            }

        mock_ansible = SimpleNamespace(run_playbook=AsyncMock(side_effect=fake_run_playbook))
        svc = nts_mod.NodeTaskService(
            _ansible=mock_ansible,
            db_factory=lambda: _session_factory(test_db)(),
        )
        return svc, mock_ansible

    return _make


async def _seed_task(test_db, items_spec, params):
    task = NodeTask(
        cluster_id=1, task_type="distribute_file", status="pending",
        params=json.dumps(params, ensure_ascii=False), total_nodes=len(items_spec),
    )
    test_db.add(task)
    await test_db.flush()
    items = []
    for node_id, ip in items_spec:
        item = NodeTaskItem(task_id=task.id, node_id=node_id, ip=ip, status="pending")
        test_db.add(item)
        items.append(item)
    await test_db.commit()
    return task, items


def _seed_src_file(tmp_path, task, name="abc-uuid"):
    src_file = tmp_path / str(task.id) / name
    src_file.parent.mkdir(parents=True, exist_ok=True)
    src_file.write_text("hello", encoding="utf-8")
    return src_file


def _broadcast_by_line(events):
    by_line = {}
    for ev in events:
        if ev.get("type") == "log_line":
            by_line.setdefault(ev["line"], set()).add(ev["node_id"])
    return by_line


class TestBatchLogRouting:
    """批量分发执行腿：日志行/广播事件必须按节点路由，不得人人收到全部行。"""

    @pytest.mark.asyncio
    async def test_prefixed_lines_routed_to_own_node_only(self, test_db, batch_env, tmp_path):
        """[ip] 前缀行只写/只广播该 ip 的节点，两节点日志互不混入对方行。"""
        lines = [
            "PLAY [edge] ***",
            "[10.0.0.10] 文件已复制",
            "[10.0.0.20] 复制失败",
        ]
        items_spec = [(10, "10.0.0.10"), (20, "10.0.0.20")]
        task, items = await _seed_task(test_db, items_spec, _params())
        _seed_src_file(tmp_path, task)
        svc, _ = batch_env(items_spec, lines)
        events = []
        svc._broadcast = lambda tid, ev: events.append(ev)

        await svc._execute_distribute_batch(test_db, task, items, _params(), None)

        from app.services import task_log_store

        log10 = task_log_store.read_log(task.id, 10)
        log20 = task_log_store.read_log(task.id, 20)
        assert "[10.0.0.10] 文件已复制" in log10
        assert "[10.0.0.20] 复制失败" not in log10, "节点 10 日志不得混入节点 20 的输出"
        assert "[10.0.0.20] 复制失败" in log20
        assert "[10.0.0.10] 文件已复制" not in log20, "节点 20 日志不得混入节点 10 的输出"

        by_line = _broadcast_by_line(events)
        assert by_line["[10.0.0.10] 文件已复制"] == {10}
        assert by_line["[10.0.0.20] 复制失败"] == {20}

    @pytest.mark.asyncio
    async def test_unprefixed_line_after_prefix_attaches_to_current_ip(self, test_db, batch_env, tmp_path):
        """前缀之后的无前缀续行归到 current_ip 对应节点。"""
        lines = [
            "[10.0.0.10] start upload",
            "node10 detail line",
            "[10.0.0.20] start upload",
            "node20 detail line",
        ]
        items_spec = [(10, "10.0.0.10"), (20, "10.0.0.20")]
        task, items = await _seed_task(test_db, items_spec, _params())
        _seed_src_file(tmp_path, task)
        svc, _ = batch_env(items_spec, lines)
        events = []
        svc._broadcast = lambda tid, ev: events.append(ev)

        await svc._execute_distribute_batch(test_db, task, items, _params(), None)

        from app.services import task_log_store

        log10 = task_log_store.read_log(task.id, 10)
        log20 = task_log_store.read_log(task.id, 20)
        assert "node10 detail line" in log10
        assert "node10 detail line" not in log20
        assert "node20 detail line" in log20
        assert "node20 detail line" not in log10

        by_line = _broadcast_by_line(events)
        assert by_line["node10 detail line"] == {10}
        assert by_line["node20 detail line"] == {20}

    @pytest.mark.asyncio
    async def test_header_before_any_ip_broadcasts_to_all(self, test_db, batch_env, tmp_path):
        """任何 [ip] 出现之前的头部行（无前缀、current_ip 未定）广播给全体节点。"""
        lines = [
            "PLAY [edge] ***",
            "TASK [copy file] ***",
            "[10.0.0.10] ok",
        ]
        items_spec = [(10, "10.0.0.10"), (20, "10.0.0.20")]
        task, items = await _seed_task(test_db, items_spec, _params())
        _seed_src_file(tmp_path, task)
        svc, _ = batch_env(items_spec, lines)
        events = []
        svc._broadcast = lambda tid, ev: events.append(ev)

        await svc._execute_distribute_batch(test_db, task, items, _params(), None)

        from app.services import task_log_store

        log10 = task_log_store.read_log(task.id, 10)
        log20 = task_log_store.read_log(task.id, 20)
        assert "PLAY [edge] ***" in log10 and "PLAY [edge] ***" in log20
        assert "TASK [copy file] ***" in log10 and "TASK [copy file] ***" in log20

        by_line = _broadcast_by_line(events)
        assert by_line["PLAY [edge] ***"] == {10, 20}
        assert by_line["TASK [copy file] ***"] == {10, 20}


class TestRouteDistributeLine:
    """纯函数级边界：前缀判定与 _parse_distribute_results 完全同口径。"""

    MAPPING = {"10.0.0.10": 10, "10.0.0.20": 20}

    def _fn(self):
        from app.services.node_task_service import route_distribute_line

        return route_distribute_line

    def test_warning_bracket_without_digits_is_not_ip_prefix(self):
        fn = self._fn()
        # current_ip 未定：[WARNING] 无数字不算 ip 前缀 → 按头部行广播全体
        targets, cur = fn("[WARNING] using network", None, self.MAPPING)
        assert targets == [10, 20]
        assert cur is None, "[WARNING] 不得推进 current_ip"

    def test_warning_after_ip_attaches_to_current_node(self):
        fn = self._fn()
        targets, cur = fn("[WARNING] retrying", "10.0.0.10", self.MAPPING)
        assert targets == [10]
        assert cur == "10.0.0.10", "[WARNING] 不得改变 current_ip"

    def test_unknown_ip_updates_current_ip_but_targets_nothing(self):
        fn = self._fn()
        targets, cur = fn("[10.9.9.9] line", None, self.MAPPING)
        assert targets == [], "未命中 item 的 ip 不得写任何节点日志"
        assert cur == "10.9.9.9", "未知 ip 也要推进 current_ip（镜像 parse 行为）"
        # 其后的无前缀行同样不给任何节点
        targets2, cur2 = fn("followup line", cur, self.MAPPING)
        assert targets2 == []
        assert cur2 == "10.9.9.9"

    def test_bracket_digits_at_len_20_is_not_ip_prefix(self):
        fn = self._fn()
        token = "1" * 20  # len < 20 才算 ip，20 不算（与 parse 的 len(candidate_ip) < 20 一致）
        targets, cur = fn(f"[{token}] line", None, self.MAPPING)
        assert targets == [10, 20]
        assert cur is None

    def test_known_ip_prefix_targets_only_that_node(self):
        fn = self._fn()
        targets, cur = fn("[10.0.0.20] copied", None, self.MAPPING)
        assert targets == [20]
        assert cur == "10.0.0.20"

    def test_whitespace_line_targets_nothing_and_keeps_current_ip(self):
        fn = self._fn()
        targets, cur = fn("   ", "10.0.0.10", self.MAPPING)
        assert targets == []
        assert cur == "10.0.0.10"
