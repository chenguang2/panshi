"""迁移全局写锁 × 真实 app（审计卡片 B2-NEW-02 / B2-NEW-07）。

语义（约定 #32）：迁移进行中 → 全部写请求（POST/PUT/DELETE/PATCH）统一 503，
GET 放行；锁释放后写请求恢复。锁经 `maintenance.set_migration_in_progress`
直接置位模拟，不启动真实迁移（约定 #29：不造会真实挂起的迁移执行）。

与 test_maintenance.py 的差别：那里是玩具 app + main.py 挂载单点验证；
本文件用 isolated_app（真实 app.main.app + 鉴权 + 隔离库）断言
**真实 API 端点路径**上的放行/拒绝语义与 503 detail 契约。
"""

import pytest

from app.core import maintenance

MIGRATION_LOCK_DETAIL = "正在迁移数据库，暂时禁止写操作，请稍后重试"

# (方法, 路径)：每个写方法对一个真实注册路由。503 发生在路由/鉴权/审计之前
# （maintenance_middleware 前置拦截），不会触达 handler 产生任何副作用。
WRITE_SAMPLES = [
    ("post", "/api/v1/clusters"),
    ("put", "/api/v1/clusters/1"),
    ("delete", "/api/v1/clusters/99999"),
    ("post", "/api/v1/database/history/cleanup"),
]

# B2-NEW-07：迁移中备份/恢复入口（全部 POST）同样被前置拦截为 503
BACKUP_RESTORE_SAMPLES = [
    ("post", "/api/v1/db-backup/run"),              # 手动备份
    ("post", "/api/v1/db-backup/restore/list"),     # 恢复向导：列包
    ("post", "/api/v1/db-backup/restore/verify"),   # 恢复向导：下载校验
    ("post", "/api/v1/db-backup/restore/execute"),  # 恢复向导：落位激活
]


@pytest.fixture(autouse=True)
def _migration_lock_off():
    """进出都清锁：任何用例失败也不把全局锁泄漏给后续用例。"""
    maintenance.set_migration_in_progress(False)
    yield
    maintenance.set_migration_in_progress(False)


class TestMigrationWriteLockOnRealApp:
    """B2-NEW-02：迁移执行期并发请求的拒绝/放行语义（真实 app）。"""

    @pytest.mark.parametrize("method,path", WRITE_SAMPLES)
    def test_write_requests_get_503_during_migration(self, isolated_app, method, path):
        """迁移中：POST/PUT/DELETE 503，detail 为固定文案（约定 #32 语义）。"""
        maintenance.set_migration_in_progress(True)
        resp = getattr(isolated_app, method)(path)
        assert resp.status_code == 503, f"{method.upper()} {path} 迁移中应 503"
        assert resp.json()["detail"] == MIGRATION_LOCK_DETAIL

    def test_reads_pass_during_migration(self, isolated_app):
        """迁移中：GET 放行——健康检查 200，真实数据端点到达 handler 返回 200。"""
        maintenance.set_migration_in_progress(True)
        assert isolated_app.get("/health").status_code == 200
        resp = isolated_app.get("/api/v1/clusters")
        assert resp.status_code == 200, (
            f"迁移中读请求应放行到业务层，实际 {resp.status_code}: {resp.text[:200]}"
        )

    def test_patch_write_resumes_after_migration(self, isolated_app):
        """锁释放后写请求恢复：503 → 到达业务层（422=校验错误即触达证据）。"""
        maintenance.set_migration_in_progress(True)
        assert isolated_app.post("/api/v1/clusters").status_code == 503
        maintenance.set_migration_in_progress(False)
        resp = isolated_app.post("/api/v1/clusters", json={})
        assert resp.status_code != 503
        assert resp.status_code == 422  # 缺 name 等字段 → FastAPI 校验错误


class TestBackupRestoreBlockedDuringMigration:
    """B2-NEW-07：迁移中触发备份/恢复被互斥拒绝（API 层，无副作用）。

    调度侧（scheduler_tick 跳过）见 test_db_backup_api.py::
    TestSchedulerTick::test_tick_skips_during_migration。
    """

    @pytest.mark.parametrize("method,path", BACKUP_RESTORE_SAMPLES)
    def test_backup_restore_endpoints_get_503(self, isolated_app, method, path):
        maintenance.set_migration_in_progress(True)
        resp = getattr(isolated_app, method)(path)
        assert resp.status_code == 503, f"{method.upper()} {path} 迁移中应 503"
        assert resp.json()["detail"] == MIGRATION_LOCK_DETAIL
