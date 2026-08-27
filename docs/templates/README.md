# 文档模板

本目录存放 md→Word 转换使用的公司文档模板（版本控制，防止 /mnt/z 被清理后丢失）。

## 文件

- `Embrace文档模板-2024.docx` — Embrace 公司文档模板（Word 版，内置 dot 格式）

## 用途

`md-to-word-template` skill 的转换脚本（`.opencode/skills/md-to-word-template/scripts/convert_md_to_word.py`）以此模板为基底，把 `docs/new/*.md` 手册章节转换为套用公司格式的 Word 文档。

脚本优先使用本目录的模板副本；`/mnt/z/Embrace文档模板-2024.docx` 仅作后备；可用环境变量 `EMBRACE_TEMPLATE` 指定其他模板。

## 更新模板

当公司发布新模板时：

1. 把新模板复制到本目录（覆盖同名文件）
2. 提交到 git：

```bash
cp /mnt/z/Embrace文档模板-2024.docx docs/templates/
git add docs/templates/Embrace文档模板-2024.docx
git commit -m "docs: 更新文档模板"
```