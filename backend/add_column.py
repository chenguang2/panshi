import sqlite3

conn = sqlite3.connect('data/panshi.db')
cursor = conn.cursor()

cursor.execute('PRAGMA table_info(ps_route)')
columns = [row[1] for row in cursor.fetchall()]
print('Current columns:', columns)

if 'advanced_match_enabled' not in columns:
    cursor.execute('ALTER TABLE ps_route ADD COLUMN advanced_match_enabled INTEGER DEFAULT 0')
    conn.commit()
    print('Added advanced_match_enabled column')
else:
    print('Column already exists')

conn.close()