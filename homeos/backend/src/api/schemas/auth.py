"""认证模块 Pydantic v2 模型（单用户注册登录口径）。

首装流程由「本地管理员账户文件」改为「单用户注册」：注册要求账号、密码、邮箱与
邮箱验证码；邮箱验证码由商店服务器发送与校验。登录用「账号（用户名或邮箱）+ 密码」。
"""

from __future__ import annotations

import re

from pydantic import BaseModel, ConfigDict, Field, model_validator

CONTROL_CHARACTERS = re.compile("[\\x00-\\x1f\\x7f]")
EMAIL_PATTERN = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


def _clean_username(value: str) -> str:
    cleaned = value.strip()
    if len(cleaned) < 3 or CONTROL_CHARACTERS.search(cleaned):
        raise ValueError("账号长度至少为3个字符，且不能包含控制字符。")
    # 登录框一个输入框兼容「账号或邮箱」：账号里出现 `@` 或空格会让这行输入产生歧义
    # （到底是账号还是邮箱），所以在注册这一步就挡住。
    if "@" in cleaned or re.search(r"\s", cleaned):
        raise ValueError("账号不能包含 @ 或空格（@ 保留给邮箱登录）。")
    return cleaned


class RegisterRequest(BaseModel):
    """注册请求体：账号 + 邮箱 + 密码 + 邮箱验证码。"""

    model_config = ConfigDict(populate_by_name=True)

    username: str = Field(min_length=3, max_length=64)
    email: str = Field(min_length=3, max_length=255)
    code: str = Field(min_length=4, max_length=12)
    password: str = Field(min_length=8, max_length=256)
    password_confirmation: str = Field(
        alias="passwordConfirmation", min_length=8, max_length=256
    )

    @model_validator(mode="after")
    def validate_register(self) -> RegisterRequest:
        self.username = _clean_username(self.username)
        self.email = self.email.strip().lower()
        if not EMAIL_PATTERN.match(self.email):
            raise ValueError("请输入有效的邮箱地址。")
        if self.password != self.password_confirmation:
            raise ValueError("两次输入的密码不一致。")
        return self


class VerificationRequest(BaseModel):
    """发送邮箱验证码请求体。"""

    email: str = Field(min_length=3, max_length=255)

    @model_validator(mode="after")
    def validate_email(self) -> VerificationRequest:
        self.email = self.email.strip().lower()
        if not EMAIL_PATTERN.match(self.email):
            raise ValueError("请输入有效的邮箱地址。")
        return self


class LoginRequest(BaseModel):
    """登录请求体：``username`` 可填用户名或注册邮箱。"""

    username: str = Field(min_length=1, max_length=255)
    password: str = Field(min_length=1, max_length=256)


class UserResponse(BaseModel):
    id: str
    username: str
    role: str
    email: str | None = None


class SetupStatusResponse(BaseModel):
    initialized: bool


__all__ = [
    "LoginRequest",
    "RegisterRequest",
    "SetupStatusResponse",
    "UserResponse",
    "VerificationRequest",
]
