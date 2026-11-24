# Tasks

## 1. 守卫实现

- [x] 1.1 新增 `backend/tests/test_user_manual_images.py`：三向对账（引用↔磁盘↔`git ls-files` 一次批量）；三条断言各自点名文件；非 git 工作区 `pytest.skip` 并给原因。验证：`cd backend && uv run pytest tests/test_user_manual_images.py -q` 全绿（当前资产已齐：181 引用 / 0 破图 / 0 孤儿）。
- [x] 1.2 反咬验证：`git rm --cached` 一张已入库图 → 用例转红并点名该文件 → `git add` 恢复 → 复绿。验证：两次运行输出均贴出。

## 2. 收口

- [x] 2.1 `openspec validate --all` 0 error。
- [x] 2.2 `AGENTS.md` 约定 #46（静态分析守卫清单）或手册相关处补一行「手册图片三向守卫测试，改/删/移动截图后跑它」。
