from pydantic import BaseModel, Field


class LoginRequest(BaseModel):
    username: str = Field(..., min_length=1, max_length=50)
    password: str = Field(..., min_length=1)


class LoginResponse(BaseModel):
    access_token: str
    token_type: str = "Bearer"
    user: "UserInfo"


class UserInfo(BaseModel):
    id: int
    username: str
    role: str
    status: int

    class Config:
        from_attributes = True


class ChangePasswordRequest(BaseModel):
    old_password: str = Field(..., min_length=6)
    new_password: str = Field(..., min_length=6)


LoginResponse.model_rebuild()