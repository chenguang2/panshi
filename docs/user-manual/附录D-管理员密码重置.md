# 管理员密码重置

## 前置：确认当前数据库

密码存储在活动数据库中，路径由 `backend/db_config.json` 的 `active` 字段决定：

```bash
cd /home/qcg/panshi/backend
python3 -c "
import json
with open('db_config.json') as f:
    cfg = json.load(f)
for c in cfg['connections']:
    if c['id'] == cfg['active']:
        print(f'当前数据库: {c[\"type\"]} → {c.get(\"path\") or c.get(\"database\")}')
        break
"
```

## 通过 SQLite 直接修改

密码使用 **bcrypt** 加密存储。

### 一条命令

```bash
cd /home/qcg/panshi/backend && uv run python3 -c "
import sqlite3, json
from app.core.security import hash_password

# 读取活动数据库路径
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

### 分步操作

```bash
# 1. 生成新密码的 bcrypt hash
cd /home/qcg/panshi/backend && uv run python3 -c "
from app.core.security import hash_password
print(hash_password('你的新密码'))
"

# 2. 更新数据库（替换为实际数据库路径）
sqlite3 /path/to/your/database.db "UPDATE sys_user SET password_hash='上一步得到的hash' WHERE username='admin';"
```

### 验证

登录页面使用新密码登录即可。
