"""认证模块 Pydantic v2 模型（单用户注册登录口径）。

首装流程由「本地管理员账户文件」改为「单用户注册」：注册要求账号、密码、邮箱与
邮箱验证码；邮箱验证码由商店服务器发送与校验。登录用「账号（用户名或邮箱）+ 密码」。
"""

from __future__ import annotations

import re
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from ...platform.security.passwords import (
    PASSWORD_POLICY_MESSAGE,
    is_password_policy_compliant,
)

CONTROL_CHARACTERS = re.compile("[\\x00-\\x1f\\x7f]")
EMAIL_PATTERN = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")

#: 新口令的长度上下界（与 ``is_password_policy_compliant`` 内部判定一致）。
PASSWORD_MIN_LENGTH = 8
PASSWORD_MAX_LENGTH = 128


def _check_password_policy(value: str) -> str:
    """请求解析期就挡下弱口令（早于任何「消费验证码」的副作用）。"""
    if not is_password_policy_compliant(value):
        raise ValueError(PASSWORD_POLICY_MESSAGE)
    return value


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
    password: str = Field(min_length=PASSWORD_MIN_LENGTH, max_length=PASSWORD_MAX_LENGTH)
    password_confirmation: str = Field(
        alias="passwordConfirmation",
        min_length=PASSWORD_MIN_LENGTH,
        max_length=PASSWORD_MAX_LENGTH,
    )

    @field_validator("password", "password_confirmation")
    @classmethod
    def validate_password_policy(cls, value: str) -> str:
        return _check_password_policy(value)

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
    """发送邮箱验证码请求体。

    ``purpose`` 只接受两个语义：首装注册（``register``）与找回本机密码（``reset``）。
    服务端再把它们映射成商店侧的 ``homeos_register`` / ``homeos_reset`` —— 客户端永远
    拿不到「随便指定商店验证码用途」的能力。
    """

    email: str = Field(min_length=3, max_length=255)
    purpose: Literal["register", "reset"] = "register"

    @model_validator(mode="after")
    def validate_email(self) -> VerificationRequest:
        self.email = self.email.strip().lower()
        if not EMAIL_PATTERN.match(self.email):
            raise ValueError("请输入有效的邮箱地址。")
        return self


class PasswordResetRequest(BaseModel):
    """找回本机密码：注册邮箱 + 邮箱验证码 + 新密码。"""

    model_config = ConfigDict(populate_by_name=True)

    email: str = Field(min_length=3, max_length=255)
    code: str = Field(min_length=4, max_length=12)
    password: str = Field(min_length=PASSWORD_MIN_LENGTH, max_length=PASSWORD_MAX_LENGTH)
    password_confirmation: str = Field(
        alias="passwordConfirmation",
        min_length=PASSWORD_MIN_LENGTH,
        max_length=PASSWORD_MAX_LENGTH,
    )

    @field_validator("password", "password_confirmation")
    @classmethod
    def validate_password_policy(cls, value: str) -> str:
        return _check_password_policy(value)

    @model_validator(mode="after")
    def normalize(self) -> PasswordResetRequest:
        self.email = self.email.strip().lower()
        if not EMAIL_PATTERN.match(self.email):
            raise ValueError("请输入有效的邮箱地址。")
        if self.password != self.password_confirmation:
            raise ValueError("两次输入的密码不一致。")
        return self


class PasswordChangeRequest(BaseModel):
    """已登录管理员修改本机密码。"""

    model_config = ConfigDict(populate_by_name=True)

    current_password: str = Field(alias="currentPassword", min_length=1, max_length=256)
    new_password: str = Field(
        alias="newPassword", min_length=PASSWORD_MIN_LENGTH, max_length=PASSWORD_MAX_LENGTH
    )
    new_password_confirmation: str = Field(
        alias="newPasswordConfirmation",
        min_length=PASSWORD_MIN_LENGTH,
        max_length=PASSWORD_MAX_LENGTH,
    )

    @field_validator("new_password", "new_password_confirmation")
    @classmethod
    def validate_password_policy(cls, value: str) -> str:
        return _check_password_policy(value)

    @model_validator(mode="after")
    def validate_change(self) -> PasswordChangeRequest:
        if self.new_password != self.new_password_confirmation:
            raise ValueError("两次输入的新密码不一致。")
        return self


class LoginRequest(BaseModel):
    """登录请求体：``username`` 可填用户名或注册邮箱。"""

    username: str = Field(min_length=1, max_length=255)
    password: str = Field(min_length=1, max_length=256)


class UserResponse(BaseModel):
    id: str
    username: str
    email: str | None = None


class SetupStatusResponse(BaseModel):
    initialized: bool


__all__ = [
    "LoginRequest",
    "PasswordChangeRequest",
    "PasswordResetRequest",
    "RegisterRequest",
    "SetupStatusResponse",
    "UserResponse",
    "VerificationRequest",
]
