---
name: md-format-standard
description: Use when markdown documents need to conform to standard authoritative markdown conventions — multiple H1 headings, skipped heading levels, bare URLs, malformed tables, or other markdownlint violations. Also use when the user asks to fix/standardize md format, or convert md to follow proper heading hierarchy.
---

# MD 文档规范标准化

将 markdown 文档修正为符合权威规范的格式（markdownlint + Microsoft Learn 规范）。

## 权威依据

- **markdownlint**（事实标准，VS Code 默认）：MD001-MD060 规则
- **Microsoft Learn 文档规范**：标题深度、行宽等
- **CommonMark / GFM**：语法基础

## 核心规则

### 标题（最重要）

| 规则 | 编号 | 要求 |
|---|---|---|
| 每文档一个 H1 | MD025 | 全文只能有一个 `#`，作为文档标题 |
| 首行是 H1 | MD041 | 文档第一个非空行应为 `#` |
| 标题逐级递增 | MD001 | 不能跳级（H1→H3 不允许） |
| 深度限制 | — | 建议 ≤3 级，最多 ≤5 级（Microsoft + Embrace 模板要求） |
| 标题前后空行 | MD022 | 标题上下各留一个空行 |
| 标题内不用粗体 | — | 避免 `## **加粗标题**` |

### 其他常见规则

| 规则 | 编号 | 要求 |
|---|---|---|
| 裸 URL | MD034 | `http://x` → `<http://x>` |
| 表格管道空格 | MD060 | 分隔行 `| --- | --- |`（管道两侧留空格） |
| 表格列数一致 | MD056 | 所有行列数相同 |
| 列表前后空行 | MD032 | 列表上下留空行（含引用块内列表） |
| 列表符号统一 | MD004 | 统一用 `-` |
| 列表缩进 | MD007 | 嵌套缩进 2 空格 |
| 行尾无空格 | MD009 | 删除行尾多余空格 |
| 无连续多空行 | MD012 | 最多一个空行 |
| 代码块指定语言 | MD040 | ` ```python ` 而非裸 ` ``` ` |
| 文件结尾换行 | MD047 | 文件以单个换行结尾 |
| 行宽 | — | ≤100 字符（Microsoft） |

## 工作流

1. **分析结构**：列出所有标题，检查 H1 数量、层级是否递增、深度是否 ≤3
2. **修正标题层级**：
   - 保留唯一 H1（文档标题）
   - 章节降为 H2，子节降为 H3
   - 去掉手动编号（`### 1. xxx` → `### xxx`），编号由 Word 模板自动生成
3. **修正其他问题**：裸 URL、表格分隔行、列表空行、行尾空格等
4. **验证**：

```bash
cd docs/new && npx --yes markdownlint-cli <file>.md
```

退出码 0 = 全部通过。逐条修复报错直到通过。

## 常见问题

| 症状 | 原因 | 修复 |
|---|---|---|
| 多个 `#` 标题 | 章节误用 H1 | 保留文档标题为 H1，其余降级 |
| `### 1. xxx` 手动编号 | 编号冗余 | 去掉编号，由 Word 自动编号 |
| 裸 URL 报错 | 未用尖括号 | `<http://...>` |
| 表格报 MD060 | 分隔行无空格 | `| --- | --- |` |
| 引用块内列表报 MD032 | 列表前无空行 | `> 文字` + `>` + `> - 列表项` |

## 注意事项

- **不破坏原文件**：修正版存为 `原文件名-1.md`（如 `00-login-1.md`），原文件保留
- **内容不变**：只改格式（标题层级、空格、URL 包裹），不改文字内容
- **只处理 md**：本 skill 只做 md 规范化，不转 Word。Word 转换是独立的 `md-to-word-template` skill，仅在用户明确要求时才执行