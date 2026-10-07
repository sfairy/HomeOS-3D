"""认证模块 Pydantic v2 模型（逐字节对齐 homeos-3d ``schemas.py``）。

只承载 homeos-3d 原生的初始化 / 登录 / 身份三类契约；homeos 多用户体系的 DTO
（用户 CRUD、偏好、MFA、访客令牌）已随机制一并移除。
"""

from __future__ import annotations

import re

from pydantic import BaseModel, ConfigDict, Field, model_validator

CONTROL_CHARACTERS = re.compile("[\\x00-\\x1f\\x7f]")


class SetupAdminRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    username: str = Field(min_length=3, max_length=64)
    password: str = Field(min_length=8, max_length=256)
    password_confirmation: str = Field(
        alias="passwordConfirmation", min_length=8, max_length=256
    )

    @model_validator(mode="after")
    def validate_setup(self) -> SetupAdminRequest:
        self.username = self.username.strip()
        if len(self.username) < 3 or CONTROL_CHARACTERS.search(self.username):
            raise ValueError("账号长度至少为3个字符，且不能包含控制字符。")
        if self.password != self.password_confirmation:
            raise ValueError("两次输入的密码不一致。")
        return self


class LoginRequest(BaseModel):
    username: str = Field(min_length=1, max_length=64)
    password: str = Field(min_length=1, max_length=256)


class UserResponse(BaseModel):
    id: str
    username: str
    role: str


class SetupStatusResponse(BaseModel):
    initialized: bool


__all__ = [
    "LoginRequest",
    "SetupAdminRequest",
    "SetupStatusResponse",
    "UserResponse",
]
