# Design

## D1 位置与形态：`backend/tests/test_user_manual_images.py`

手册资产校验与前后端运行时代码无关，用 pytest（仓库既有守卫测试的主流形态，见 `test_table_anatomy`、`test_product_packaging` 等源码守卫）最省事：无浏览器、无 DB、无网络，秒级。

## D2 三向对账的取数方式（性能关键）

| 集合 | 取法 |
|---|---|
| 引用 | `docs/user-manual/*.md` 正则 `images/([A-Za-z0-9._-]+\.png)` 全集 |
| 磁盘 | `Path('docs/user-manual/images').glob('*.png')` |
| 索引 | **一次** `git ls-files -- docs/user-manual/images` → `set` |

禁止逐文件 `git ls-files --error-unmatch`（181 次子进程 ≈ 数秒，且抖动为超时的来源）。177+ 张规模下一次性取并集即可。

## D3 非 git 环境：显式 skip，不静默通过

先 `git rev-parse --is-inside-work-tree`；非零退出 → `pytest.skip("非 git 工作区，无法校验入库状态（请在仓库内运行）")`。刻意不用 `return` 直接通过——「校验没跑」与「校验通过」必须在报告里可区分。

## D4 失败信息要可行动（约定 #46：工具只出候选，人工处置）

- 未跟踪 → 「以下图被引用但未入库，请 `git add`：…」；
- 破图 → 「以下引用无对应文件（章节 → 文件名）：…」；
- 孤儿 → 「以下图无任何章节引用（建议删除或补进章节）：…」。

## D5 反咬验证（必须做一次）

临时把某张已入库图 `git rm --cached` 后跑用例，确认转红并点名；随后恢复。防止写出「永远绿」的空守卫（历史教训：空态守卫看起来全绿，实际断言不到目标）。

## D6 不做的事

- 不校验图片尺寸/体积上限、命名规范、是否为最新 UI（截图时效性属人工验收，脚本产线另有 `manual-screenshots.mjs`）；
- 不改 `manual-screenshots.mjs` 的产线清单（产线占位 `16-02-dashboard-filter` 仍需在数据可达时补拍）；
- 不在 CI 之外新增 hook（如 pre-commit 跑全量 pytest 不合适）。
