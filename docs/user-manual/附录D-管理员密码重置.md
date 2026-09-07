# 管理员密码重置

## 前置：确认环境

| 环境 | 数据库类型 | Python 路径 |
|---|---|---|
| 开发 | SQLite (`backend/data/`) | `uv run python3` |
| 生产 | PostgreSQL | `/opt/panshi/backend/venv/bin/python3` |

## 方案一：Python 脚本（推荐，通用）

```bash
# 开发环境
cd /home/qcg/panshi/backend && uv run python3 reset_password.py

# 生产环境
cd /opt/panshi/backend && venv/bin/python3 reset_password.py
```

`reset_password.py` 内容：

```python
import sys
import getpass
from app.core.security import hash_password

# 自动检测数据库类型
try:
    import sqlite3
    import json
    with open('db_config.json') as f:
        cfg = json.load(f)
    for c in cfg['connections']:
        if c['id'] == cfg['active']:
            db_path = c.get('path', '')
            break
    conn = sqlite3.connect(db_path)
    db_type = 'sqlite'
except FileNotFoundError:
    import os
    conn = psycopg2.connect(os.environ['DATABASE_URL'])
    db_type = 'postgresql'

new_pw = getpass.getpass('输入新密码: ')
confirm = getpass.getpass('再次输入: ')
if new_pw != confirm:
    print('两次密码不一致'); sys.exit(1)

hashed = hash_password(new_pw)
cur = conn.cursor()
cur.execute('UPDATE sys_user SET password_hash = ? WHERE username = ?', (hashed, 'admin'))
conn.commit()
conn.close()
print(f'admin 密码已更新')
```

## 方案二：命令行快速重置

### SQLite（开发环境）

```bash
cd /home/qcg/panshi/backend && uv run python3 -c "
import sqlite3, json
from app.core.security import hash_password

with open('db_config.json') as f:
    cfg = json.load(f)
for c in cfg['connections']:
    if c['id'] == cfg['active']:
        db_path = c.get('path', '')
        break

new_pw = '你的新密码'
conn = sqlite3.connect(db_path)
conn.execute('UPDATE sys_user SET password_hash = ? WHERE username = ?', (hash_password(new_pw), 'admin'))
conn.commit()
conn.close()
print(f'admin 密码已更新为: {new_pw}')
"
```

### PostgreSQL（生产环境）

```bash
cd /opt/panshi/backend && venv/bin/python3 -c "
import os, psycopg2
from app.core.security import hash_password

new_pw = '你的新密码'
conn = psycopg2.connect(os.environ['DATABASE_URL'])
conn.cursor().execute('UPDATE sys_user SET password_hash = %s WHERE username = %s', (hash_password(new_pw), 'admin'))
conn.commit()
conn.close()
print(f'admin 密码已更新为: {new_pw}')
"
```

## 验证

登录页面使用新密码登录即可。
