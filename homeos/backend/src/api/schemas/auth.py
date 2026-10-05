"""认证模块 Pydantic v2 请求模型（DTO）。

对应 Nest 的 class-validator DTO；``extra="forbid"`` 复刻全局
``whitelist + forbidNonWhitelisted``：未声明字段直接 400。
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict

#: 密码强度提示文案（与 Nest cookie-cors.util 一致）。
PASSWORD_POLICY_MESSAGE = "密码至少 8 位，且须同时包含字母和数字"


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class LoginDto(StrictModel):
    username: str
    password: str


class SetupDto(StrictModel):
    username: str
    password: str


class UpdateProfileDto(StrictModel):
    username: str | None = None
    password: str | None = None
    currentPassword: str | None = None


class CreateUserDto(StrictModel):
    username: str
    password: str
    role: Literal["admin", "adult", "child", "guest"] | None = None
    entityRestrictions: list[str] | None = None


class UpdateUserDto(StrictModel):
    username: str | None = None
    password: str | None = None
    role: Literal["admin", "adult", "child", "guest"] | None = None
    entityRestrictions: list[str] | None = None


class GuestTokenDto(StrictModel):
    validHours: float | None = None
    restrictions: list[str] | None = None
    allowedSceneIds: list[str] | None = None


class GuestLoginDto(StrictModel):
    token: str


class GuestExchangeDto(StrictModel):
    code: str


class MfaVerifyDto(StrictModel):
    code: str
    username: str
    password: str


class MfaSetupConfirmDto(StrictModel):
    code: str


class UpdateUserPreferencesDto(StrictModel):
    defaultTemperature: int | float | None = None
    preferredLightKelvin: int | float | None = None
    autoNightMode: bool | None = None
    nightModeTime: str | None = None
    presencePersonId: str | None = None
    temperatureUnit: Literal["celsius", "fahrenheit"] | None = None
