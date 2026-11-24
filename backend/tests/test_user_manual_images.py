"""操作手册图片资产三向守卫（manual-image-asset-guard）。

背景（2026-11-24 实测）：`.gitignore` 的 `!docs/user-manual/images/**` 白名单解除
`*.png` 全局忽略后，暴露出 **8 张被正文引用却从未入库**的截图——本机磁盘齐全、
`git status` 看不见，只有新 clone / 构建手册时才整体破图，潜伏期极长且无人察觉。
历史上还出现过 12 张零引用孤儿图（人工清理过一轮）。

本守卫只读，做三向对账：正文引用 ↔ 磁盘文件 ↔ git 索引。
性能约定：git 索引**一次批量**取（`git ls-files`），禁止逐文件起子进程。
"""

import re
import subprocess
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parents[2]
MANUAL_DIR = REPO_ROOT / "docs" / "user-manual"
IMAGES_DIR = MANUAL_DIR / "images"
_REF_RE = re.compile(r"images/([A-Za-z0-9._-]+\.png)")


def _git(*args: str) -> subprocess.CompletedProcess:
    return subprocess.run(
        ["git", "-C", str(REPO_ROOT), *args],
        capture_output=True,
        text=True,
        timeout=30,
    )


def _require_git_worktree() -> None:
    """非 git 工作区（源码 tarball 等）显式跳过——不许静默通过（『没跑』≠『通过』）。"""
    probe = _git("rev-parse", "--is-inside-work-tree")
    if probe.returncode != 0 or probe.stdout.strip() != "true":
        pytest.skip("非 git 工作区，无法校验手册图片入库状态（请在仓库内运行本用例）")


def _md_files() -> list[Path]:
    return sorted(MANUAL_DIR.glob("*.md"))


def _refs_by_file() -> dict[str, set[str]]:
    """图片文件名 → 引用它的章节文件集合。"""
    refs: dict[str, set[str]] = {}
    for md in _md_files():
        for name in set(_REF_RE.findall(md.read_text(encoding="utf-8"))):
            refs.setdefault(name, set()).add(md.name)
    return refs


def _images_on_disk() -> set[str]:
    return {p.name for p in IMAGES_DIR.glob("*.png")}


def _images_tracked() -> set[str]:
    out = _git("ls-files", "--", "docs/user-manual/images")
    assert out.returncode == 0, f"git ls-files 失败: {out.stderr.strip()}"
    return {Path(line).name for line in out.stdout.splitlines() if line.strip()}


def test_scan_is_not_vacuous():
    """防空守卫：扫描面为空时（路径改了/正则失效）立即失败，不允许「全绿但什么都没查」。"""
    assert _md_files(), f"未找到任何章节 Markdown：{MANUAL_DIR}"
    assert _refs_by_file(), "章节内未解析到任何 images/*.png 引用（正则或路径失效）"
    assert _images_on_disk(), f"图片目录为空：{IMAGES_DIR}"


def test_referenced_images_exist_on_disk():
    refs = _refs_by_file()
    missing = sorted(name for name in refs if name not in _images_on_disk())
    if missing:
        detail = "; ".join(f"{name}（引用自 {', '.join(sorted(refs[name]))}）" for name in missing)
        pytest.fail(f"以下被引用的图在磁盘上不存在（破图）：{detail}")


def test_referenced_images_are_tracked_by_git():
    _require_git_worktree()
    refs = _refs_by_file()
    tracked = _images_tracked()
    untracked = sorted(name for name in refs if name not in tracked)
    if untracked:
        detail = "; ".join(f"{name}（引用自 {', '.join(sorted(refs[name]))}）" for name in untracked)
        pytest.fail(
            "以下图被正文引用但未入库（本机正常、clone 后破图）——请执行 "
            f"`git add docs/user-manual/images/<文件名>`：{detail}"
        )


def test_no_orphan_images():
    refs = _refs_by_file()
    orphans = sorted(name for name in _images_on_disk() if name not in refs)
    if orphans:
        pytest.fail(
            "以下图片没有任何章节引用（无引用孤儿）——请删除，或补进对应章节："
            + ", ".join(orphans)
        )
