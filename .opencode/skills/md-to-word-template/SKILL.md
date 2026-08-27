---
name: md-to-word-template
description: Use when converting markdown documentation (docs/new/*.md) to Word documents following the Embrace company template (Embrace文档模板-2024.docx). Also use when the user asks to convert md to Word/docx, apply the Embrace template format, or batch-convert the manual chapters.
---

# MD 转 Word（Embrace 模板）

将 `docs/new/*.md` 手册章节转换为套用 Embrace 公司模板格式的 Word 文档。

## 前置条件

- `pandoc` 已安装（`sudo apt-get install -y pandoc`）
- 模板文件在 `/mnt/z/Embrace文档模板-2024.docx`（可用环境变量 `EMBRACE_TEMPLATE` 覆盖）
- 输出到 `/mnt/z/` 供 Windows 查看

## 转换命令

```bash
python3 .opencode/skills/md-to-word-template/scripts/convert_md_to_word.py \
  docs/new/00-login.md /mnt/z/00-login.docx
```

可选参数：`<md文件> <输出docx> [封面标题] [封面副标题]`（默认"磐石 Admin" / "操作手册"）。

批量转换全部章节：

```bash
cd /home/qcg/panshi
for f in docs/new/[0-9]*.md docs/new/附录*.md; do
  out="/mnt/z/$(basename "${f%.md}").docx"
  python3 .opencode/skills/md-to-word-template/scripts/convert_md_to_word.py "$f" "$out"
done
```

## 工作原理

脚本以**模板文件为基底**，只替换正文内容，完整保留模板的封面/目录/分节/页眉页脚：

1. **构建 pandoc 参考文档**：从模板 styles.xml 加 pandoc 样式映射（FirstParagraph/BodyText/BlockText/Compact/CaptionedFigure/ImageCaption/TableCaption）、重命名「代码段」→Source Code、「文档表格」→Table、去掉标题自动编号（避免与 md 手动编号双重编号）
2. **pandoc 转换**：`--reference-doc` + `--no-highlight`（代码保持纯文本），cwd 设为 md 所在目录（图片相对路径才能解析）
3. **提取内容**：pandoc 输出的 body 内容（去掉最终 sectPr）
4. **后处理**：
   - 去掉跨章节超链接（`[第 X 章](file.md)` → 纯文本）
   - 表格：表头行→「表头」样式 + 蓝色底纹 0B699B + 白字加粗居中 + 1.5倍行距 + 五号；表体→「表内容」样式 + 左对齐 + 1.15倍行距 + 小五号；边框蓝色 2F8EC1（**直接格式**，不依赖样式解析）
   - 代码段：包进单行单列表格（代码框，Table Grid 样式）
5. **拼入模板**：封面节 + 目 录标题 + 新 TOC 字段 + 内容节分节符 + 内容 + 最终 sectPr（边界动态计算，不硬编码字节位置）
6. **收尾**：图片 rId 重映射到 rId100+（避免与模板 rels 冲突）、media 重命名（image→md）、补 drawingml 命名空间、Content_Types 模板类型→文档类型

## 模板格式规则（来自模板文档内部说明）

| 元素 | 规则 |
|---|---|
| 标题 1-7 级 | 模板 heading 样式（蓝色加粗），无自动编号（md 已带手动编号） |
| 正文 | 首行缩进2字符、1.5倍行距、宋体五号 |
| 图形 | 居中、无缩进；图注在图形下方（题注样式：居中、宋体五号加粗） |
| 表格 | 表注在表格上方；框架=文档表格样式（蓝色边框）；表头行=居中+白字加粗+蓝色底纹；表内容=左对齐+小五号+1.15倍行距 |
| 代码段 | 代码框（单行单列表格）+ 代码段样式（Courier New、小五号、1.15倍行距） |
| 列表 | 基于正文样式 |

## 验证

转换后必须验证：

```bash
python3 -c "
import docx
d = docx.Document('输出.docx')   # 打不开 = 损坏
print(len(d.paragraphs), len(d.tables))
"
```

常见损坏原因：
- **Content_Types 是模板类型**（`template.main+xml`）→ 脚本已自动修复为 document 类型
- **未绑定命名空间前缀**（wp14/a14/pic）→ 脚本已自动补声明
- **图片 rId 冲突**（模板用 rId1-26，pandoc 也用 rId21+）→ 脚本已重映射

## 常见问题

| 问题 | 原因 | 解决 |
|---|---|---|
| 图片丢失 | pandoc 从错误目录运行，相对路径解析失败 | 脚本已设 cwd=md 目录 |
| 表格无格式 | 样式未渲染 | 脚本已用直接格式（边框/底纹/字体） |
| 双重编号 | 模板标题自动编号 + md 手动编号 | 脚本已去掉模板标题 numPr |
| 文件损坏 | Content_Types 模板类型 | 脚本已修复 |