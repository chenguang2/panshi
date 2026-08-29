"""共享的文件名/文本清洗工具。"""

import re


def sanitize_filename(name: str, *, extra_unsafe: str = "", fallback: str = "") -> str:
    """将文件系统不安全字符替换为下划线并去除首尾空白。

    - ``extra_unsafe``: 额外需要替换的字符（如导出场景的 "#"）。
    - ``fallback``: 清洗结果为空时返回的兜底值（如备份场景的 "cluster"）。
    """
    unsafe = re.escape('\\/:*?"<>|' + extra_unsafe)
    cleaned = re.sub(f"[{unsafe}]", "_", name).strip()
    return cleaned or fallback
