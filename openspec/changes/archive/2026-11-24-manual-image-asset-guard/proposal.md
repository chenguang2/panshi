# Proposal

## Why

操作手册的图片资产没有任何自动校验：2026-11-24 对账发现 **8 张被正文引用的截图从未入库**（`.gitignore` 的 `!docs/user-manual/images/**` 白名单直到 1a87e79b 才解除 `*.png` 全局忽略，此前它们在本机磁盘上存在、`git status` 也看不到）。本地永远看起来正常，只有新 clone / CI 构建手册时才会大面积破图——这类缺陷潜伏期极长且无人发现。仓库还缺「目录里零引用孤儿图」的反向校验（历史上有一次人工清理 12 张孤儿）。

## What Changes

- 新增一个最小 pytest 源码守卫 `backend/tests/test_user_manual_images.py`，对 `docs/user-manual/` 做三向对账（正文引用 ↔ 磁盘文件 ↔ git 索引）：
  1. 正文引用的每张图 SHALL 存在于 `docs/user-manual/images/`；
  2. 上述每张图 SHALL 已被 git 跟踪（`git ls-files` 集合比对，一次调用，不为 181 张图逐个起子进程）；
  3. `docs/user-manual/images/` 下每个文件 SHALL 至少被一章引用（零引用即失败，点名文件）。
- 失败信息 SHALL 点名具体文件并给出处置建议（未跟踪 → `git add`；破图 → 补图或改引用；孤儿 → 删除或补进章节）。
- git 环境不可用（如源码 tarball）时 SHALL `pytest.skip` 并说明原因，不得静默通过。

## Capabilities

### New Capabilities

（无）

### Modified Capabilities

- `operation-manual`: 新增「手册图片资产三向完整性守卫」要求（引用存在、引用已跟踪、无零引用孤儿）。

## Impact

- 测试：新增 `backend/tests/test_user_manual_images.py`（约 60 行，无网络、无 DB，秒级）。
- 文档资产：不改动任何截图或章节内容（只读校验）。
- 边界：不校验尺寸/命名规范/截图是否为最新 UI（属人工验收范畴）。
