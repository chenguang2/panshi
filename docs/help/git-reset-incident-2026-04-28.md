# Git Reset 事故报告 - 2026-04-28

## 事故概要

| 项目 | 内容 |
|------|------|
| 日期 | 2026-04-28 |
| 类型 | Git 操作事故 |
| 影响 | 丢失 2 个功能提交 (f380f97, 53f241d) |
| 恢复耗时 | ~30 分钟 |

## 问题描述

在 main 分支上执行了 `git reset` 操作，导致 2 个已提交但未推送的功能丢失：

1. **f380f97** - 高级路由匹配功能增强（POST参数、内置参数、8种运算符）
2. **53f241d** - 集群节点和上游字段验证

## 根因分析

### reflog 显示的操作序列

```
6e64aee HEAD@{0}: commit: fix(plugin): support plugin_metadata in VersionManagementModal
b420280 HEAD@{1}: commit: feat(cluster): add node and upstream validation with column config improvements
1230cc5 HEAD@{2}: commit: Recover lost changes: advanced route matching (POST params, builtin params, 8 operators) and plugin metadata models
df1c174 HEAD@{3}: checkout: moving from recovery/f380f97-recovery to main
f380f97 HEAD@{4}: checkout: moving from main to recovery/f380f97-recovery
df1c174 HEAD@{5}: reset: moving to HEAD
df1c174 HEAD@{6}: reset: moving to origin/main    ← 关键操作：强制回退到远程
66606bd HEAD@{7}: reset: moving to HEAD
66606bd HEAD@{8}: reset: moving to HEAD
66606bd HEAD@{9}: reset: moving to df1c174~1
df1c174 HEAD@{10}: commit: add plug metadata
66606bd HEAD@{11}: reset: moving to origin/main    ← 第一次丢失 53f241d
53f241d HEAD@{12}: checkout: moving from feature/global-plugins to main
```

### 问题本质

**执行了 `git reset --hard origin/main`**，这会强制将本地 main 指针回退到与远程一致。

## 恢复过程

1. 使用 `git reflog` 找到丢失的提交
2. 使用 `git cherry-pick --no-commit` 逐个合并到 main 分支
3. 手动修复合并冲突（如有）
4. 测试验证功能正常

## 预防措施

### 1. 分支管理规范

- **功能开发使用 feature 分支**，不直接在 main 开发
- **main 只做合并**，不执行 reset 等破坏性操作
- **保护分支设置**：GitHub 设置 main 分支保护，禁止 force push

### 2. 操作前检查

```bash
# 操作前确认当前状态
git status
git log --oneline -5
git reflog show -10

# 确认没有未提交的修改
git diff --staged
```

### 3. 频繁提交和推送

- 小批量提交，避免一次性丢失太多
- 每个功能单独 commit，便于选择性恢复
- 每天结束前 push 到远程备份

### 4. 使用 reflog 恢复

如果发生 reset，可以恢复：

```bash
# 查看 reflog 找到丢失的提交
git reflog

# 恢复到指定状态
git reset --hard HEAD@{N}
```

### 5. Git 配置保护

在 `.git/config` 或 global 配置中增加保护：

```bash
# 禁止 force push 到 main
git config branch.main.protected true

# 或者在 GitHub 设置 branch protection rules
```

## 相关提交记录

| 提交 | 功能 | 状态 |
|------|------|------|
| f380f97 | 高级路由匹配增强 | 已恢复 |
| 53f241d | 节点/上游字段验证 | 已恢复 |
| 6e64aee | VersionManagementModal 修复 | 新增 |
| 1230cc5 | 合并恢复提交 | 已归档 |

## 教训

1. **永远不要在 main 分支执行破坏性操作**（reset, rebase, hard reset）
2. **功能开发必须用 feature 分支**
3. **reflog 是救命稻草**，养成定期查看的习惯
4. **频繁 push** 是最好的保护，不要等到一天结束才 push