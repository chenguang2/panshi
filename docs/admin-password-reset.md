# 管理员密码修改

## 通过 SQLite 直接修改

密码使用 **bcrypt** 加密存储。

### 一条命令

```bash
cd /home/qcg/panshi/backend && uv run python3 -c "
import sqlite3
from app.core.security import hash_password
new_pw = '你的新密码'
conn = sqlite3.connect('data/panshi.db')
conn.execute('UPDATE ps_user SET password_hash = ? WHERE username = ?', (hash_password(new_pw), 'admin'))
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

# 2. 更新数据库
sqlite3 data/panshi.db "UPDATE ps_user SET password_hash='上一步得到的hash' WHERE username='admin';"
```

### 验证

登录页面使用新密码登录即可。
