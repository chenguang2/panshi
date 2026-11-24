# Spec Delta

## ADDED Requirements

### Requirement: 手册图片资产三向完整性守卫

系统 SHALL 提供自动化测试，对操作手册的图片资产做三向对账（正文引用 ↔ 磁盘文件 ↔ git 索引），任一不一致即测试失败并点名具体文件：

1. 正文（`docs/user-manual/*.md`）引用的每个 `images/<文件名>` SHALL 存在于 `docs/user-manual/images/`（防止破图）；
2. 上述每个被引用文件 SHALL 已被 git 跟踪（防止「本机有、clone 后破图」——该缺陷在 2026-11-24 实测潜伏 8 张）；
3. `docs/user-manual/images/` 下的每个文件 SHALL 至少被一章引用（防止零引用孤儿堆积）。

校验 SHALL NOT 修改任何图片或 Markdown；SHALL 在一次测试运行内完成（批量取 git 索引，不逐文件起子进程）。git 工作区不可用时 SHALL 显式跳过（`skip` 并说明原因），SHALL NOT 静默通过。

#### Scenario: 引用与资产一致

- **WHEN** 全部引用图都存在且已被跟踪、目录内无零引用文件
- **THEN** 测试 SHALL 通过

#### Scenario: 引用图未入库

- **WHEN** 某章引用了 `images/x.png`，文件在磁盘上但未被 git 跟踪
- **THEN** 测试 SHALL 失败
- **AND** 失败信息 SHALL 点名 `x.png` 并提示执行 `git add`

#### Scenario: 引用图缺失

- **WHEN** 某章引用了 `images/y.png` 但磁盘上不存在
- **THEN** 测试 SHALL 失败并点名 `y.png` 与引用它的章节

#### Scenario: 零引用孤儿图

- **WHEN** `docs/user-manual/images/` 下存在没有任何章节引用的文件
- **THEN** 测试 SHALL 失败并列出这些文件

#### Scenario: 非 git 环境

- **WHEN** 运行环境不是 git 工作区（无法读取索引）
- **THEN** 测试 SHALL 跳过的同时给出原因说明，不判为通过
