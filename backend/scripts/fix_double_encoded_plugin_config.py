"""
一次性存量数据修复脚本：解包双重 JSON 编码的插件配置。

背景：前端 JSON 编辑模式曾把插件 config 双重编码（'"{\n \"headers\": {...}}"'），
导致发布时 json.loads 一次仍得到字符串，Edge API 报 400。

修复范围：
1. ps_route_plugin.config  —— 行级 json.loads 一次后仍为 str 的行解包一层
2. ps_plugin_config.plugins / ps_global_rule.plugins —— 整个 dict，递归检查每个插件值，
   对"可解析 JSON 的字符串"解包为对象（当前两表为 0 行，防御未来）

用法：
    uv run python scripts/fix_double_encoded_plugin_config.py [--db path] [--dry-run]

安全：运行前自动备份 DB 为 <db>.bak-<timestamp>；默认 dry-run 只打印不改写。
"""
import argparse
import json
import shutil
import sqlite3
import sys
from datetime import datetime
from pathlib import Path


def unwrap_once(value):
    """若 value 是字符串且本身是 JSON 文本，解析一次；否则原样返回。"""
    if not isinstance(value, str):
        return value, False
    stripped = value.strip()
    if not stripped:
        return value, False
    try:
        parsed = json.loads(stripped)
    except json.JSONDecodeError:
        return value, False
    # 只解"字符串里套 JSON 对象/数组"的情况；标量(如 "abc")不解，避免误伤
    if isinstance(parsed, (dict, list)):
        return parsed, True
    return value, False


def fix_route_plugin(conn):
    """ps_route_plugin.config 行级解包。返回修复行数与详情。"""
    cur = conn.cursor()
    cur.execute("SELECT id, route_id, plugin_name, config FROM ps_route_plugin")
    rows = cur.fetchall()
    fixed, details = 0, []
    for rid, route_id, plugin_name, config in rows:
        if not config:
            continue
        once = json.loads(config) if config.strip().startswith(("{", "[")) or config.strip().startswith('"') else None
        if once is None:
            continue
        if isinstance(once, str):
            # 双重编码：json.loads 一次是字符串 → 解包一层
            fixed += 1
            details.append(f"route={route_id} plugin={plugin_name} id={rid}")
            cur.execute(
                "UPDATE ps_route_plugin SET config=?, updated_at=datetime('now') WHERE id=?",
                (once, rid),
            )
    return fixed, details


def fix_plugins_column(conn, table):
    """ps_plugin_config.plugins / ps_global_rule.plugins：递归解包 dict 中每个插件值。"""
    cur = conn.cursor()
    cur.execute(f"SELECT id, name, plugins FROM {table}")
    rows = cur.fetchall()
    fixed, details = 0, []
    for pid, name, plugins in rows:
        if not plugins:
            continue
        try:
            parsed = json.loads(plugins)
        except json.JSONDecodeError:
            continue
        if not isinstance(parsed, dict):
            continue
        changed = False
        for pname, pval in parsed.items():
            unwrapped, did = unwrap_once(pval)
            if did:
                parsed[pname] = unwrapped
                changed = True
        if changed:
            fixed += 1
            details.append(f"{table} id={pid} name={name}")
            cur.execute(
                f"UPDATE {table} SET plugins=?, updated_at=datetime('now') WHERE id=?",
                (json.dumps(parsed, ensure_ascii=False), pid),
            )
    return fixed, details


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--db", default=str(Path(__file__).resolve().parent.parent / "data" / "panshi.db"))
    parser.add_argument("--dry-run", action="store_true", help="只打印不改写")
    args = parser.parse_args()

    db_path = Path(args.db)
    if not db_path.exists():
        print(f"DB 不存在: {db_path}")
        sys.exit(1)

    if not args.dry_run:
        backup = db_path.with_suffix(f".db.bak-{datetime.now().strftime('%Y%m%d%H%M%S')}")
        shutil.copy2(db_path, backup)
        print(f"已备份: {backup}")

    conn = sqlite3.connect(db_path)
    try:
        rp_fixed, rp_details = fix_route_plugin(conn)
        pc_fixed, pc_details = fix_plugins_column(conn, "ps_plugin_config")
        gr_fixed, gr_details = fix_plugins_column(conn, "ps_global_rule")

        print(f"\nps_route_plugin: 修复 {rp_fixed} 行")
        for d in rp_details:
            print(f"  - {d}")
        print(f"ps_plugin_config: 修复 {pc_fixed} 行")
        for d in pc_details:
            print(f"  - {d}")
        print(f"ps_global_rule: 修复 {gr_fixed} 行")
        for d in gr_details:
            print(f"  - {d}")

        if args.dry_run:
            print("\n[dry-run] 未写入任何修改")
        else:
            conn.commit()
            print("\n已提交")
    finally:
        conn.close()


if __name__ == "__main__":
    main()
