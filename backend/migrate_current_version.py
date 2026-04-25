import asyncio
import sqlite3
import os

def migrate():
    db_path = os.path.join(os.path.dirname(__file__), "data", "panshi.db")
    
    if not os.path.exists(db_path):
        print(f"Database not found at {db_path}")
        return
    
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    # Check existing columns
    cursor.execute("PRAGMA table_info(ps_upstream)")
    upstream_cols = [col[1] for col in cursor.fetchall()]
    print(f"ps_upstream columns: {upstream_cols}")
    
    cursor.execute("PRAGMA table_info(ps_route)")
    route_cols = [col[1] for col in cursor.fetchall()]
    print(f"ps_route columns: {route_cols}")
    
    # Add current_version to ps_upstream if not exists
    if "current_version" not in upstream_cols:
        cursor.execute("ALTER TABLE ps_upstream ADD COLUMN current_version INTEGER")
        print("Added current_version to ps_upstream")
    
    # Add current_version to ps_route if not exists
    if "current_version" not in route_cols:
        cursor.execute("ALTER TABLE ps_route ADD COLUMN current_version INTEGER")
        print("Added current_version to ps_route")
    
    conn.commit()
    conn.close()
    print("Migration completed!")

if __name__ == "__main__":
    migrate()
