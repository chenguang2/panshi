import pytest
from app.models.user import User
from app.core.security import hash_password, verify_password

async def test_create_user(test_db):
    user = User(
        username="testuser",
        password_hash=hash_password("password123"),
        role="user",
        status=1
    )
    test_db.add(user)
    await test_db.commit()
    await test_db.refresh(user)
    
    assert user.id is not None
    assert user.username == "testuser"
    assert user.role == "user"

async def test_password_hashing():
    password = "mysecretpassword"
    hashed = hash_password(password)
    
    assert hashed != password
    assert verify_password(password, hashed)
    assert not verify_password("wrongpassword", hashed)

async def test_user_password_flow(test_db):
    user = User(
        username="authtest",
        password_hash=hash_password("oldpassword"),
        role="user",
        status=1
    )
    test_db.add(user)
    await test_db.commit()
    
    assert verify_password("oldpassword", user.password_hash)
    
    user.password_hash = hash_password("newpassword")
    await test_db.commit()
    
    assert verify_password("newpassword", user.password_hash)
    assert not verify_password("oldpassword", user.password_hash)