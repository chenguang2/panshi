import sqlite3

conn = sqlite3.connect('data/panshi.db')
cursor = conn.cursor()

cursor.execute('PRAGMA table_info(ps_upstream)')
columns = [row[1] for row in cursor.fetchall()]
print('Current columns:', columns)

if 'hash_location' not in columns:
    cursor.execute('ALTER TABLE ps_upstream ADD COLUMN hash_location TEXT')
    conn.commit()
    print('Added hash_location column')
else:
    print('hash_location column already exists')

if 'hash_key' not in columns:
    cursor.execute('ALTER TABLE ps_upstream ADD COLUMN hash_key TEXT')
    conn.commit()
    print('Added hash_key column')
else:
    print('hash_key column already exists')

conn.close()
