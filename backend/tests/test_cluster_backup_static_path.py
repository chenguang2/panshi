"""守卫：cluster_backup 静态资源存储目录必须锚定 backend/data/static。

历史教训（2026-09）：_BASE_STORAGE_DIR 用 dirname×4 从 backend/app/services/
出发会退到仓库根，导入集群备份时静态资源 zip 被写到 <repo>/data/static/，
而下载方 cluster_static_resources 读的是 backend/data/static/，导入的
静态资源等于丢失（下载 404）。services/ 层级只需 dirname×3。
"""

from pathlib import Path

from app.services import cluster_backup


def test_base_storage_dir_anchored_under_backend_data_static():
    backend_root = Path(__file__).resolve().parent.parent  # backend/
    expected = (backend_root / "data" / "static").resolve()
    assert Path(cluster_backup._BASE_STORAGE_DIR).resolve() == expected


def test_base_storage_dir_not_repo_root():
    repo_root = Path(__file__).resolve().parent.parent.parent  # 仓库根
    assert Path(cluster_backup._BASE_STORAGE_DIR).resolve() != repo_root
