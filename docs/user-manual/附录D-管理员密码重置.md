# 管理员密码重置

## 步骤一：确认当前数据库

```bash
# 开发环境（假设项目目录为 /home/user/panshi）
cd /home/user/panshi/backend && python3 -c "
import json
with open('db_config.json') as f:
    cfg = json.load(f)
for c in cfg['connections']:
    if c['id'] == cfg['active']:
        print(f'类型: {c[\"type\"]}')
        print(f'连接: {c.get(\"path\") or c.get(\"database\")}')
        break
"

# 生产环境（假设安装目录为 /opt/panshi）
cd /opt/panshi/backend && .venv/bin/python3 -c "
import json
with open('db_config.json') as f:
    cfg = json.load(f)
for c in cfg['connections']:
    if c['id'] == cfg['active']:
        print(f'类型: {c[\"type\"]}')
        print(f'连接: {c.get(\"path\") or c.get(\"database\")}')
        break
"
```

## 步骤二：重置密码

根据上一步输出的类型，选择对应命令：

### SQLite

```bash
# 开发环境
cd /home/user/panshi/backend && uv run python3 -c "
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

# 生产环境
cd /opt/panshi/backend && .venv/bin/python3 -c "
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

### PostgreSQL

```bash
# 开发环境
cd /home/user/panshi/backend && uv run python3 -c "
import json, psycopg2
from app.core.security import hash_password

with open('db_config.json') as f:
    cfg = json.load(f)
for c in cfg['connections']:
    if c['id'] == cfg['active']:
        pg = c
        break

conn = psycopg2.connect(host=pg['host'], port=pg['port'], database=pg['database'], user=pg['username'], password=pg.get('password', ''))
new_pw = '你的新密码'
conn.cursor().execute('UPDATE sys_user SET password_hash = %s WHERE username = %s', (hash_password(new_pw), 'admin'))
conn.commit()
conn.close()
print(f'admin 密码已更新为: {new_pw}')
"

# 生产环境
cd /opt/panshi/backend && .venv/bin/python3 -c "
import json, psycopg2
from app.core.security import hash_password

with open('db_config.json') as f:
    cfg = json.load(f)
for c in cfg['connections']:
    if c['id'] == cfg['active']:
        pg = c
        break

conn = psycopg2.connect(host=pg['host'], port=pg['port'], database=pg['database'], user=pg['username'], password=pg.get('password', ''))
new_pw = '你的新密码'
conn.cursor().execute('UPDATE sys_user SET password_hash = %s WHERE username = %s', (hash_password(new_pw), 'admin'))
conn.commit()
conn.close()
print(f'admin 密码已更新为: {new_pw}')
"
```

## 验证

登录页面使用新密码登录即可。
