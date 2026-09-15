from __future__ import annotations

import re
from typing import Any

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from .ha.client import HAClientError, normalize_base_url

CONTROL_CHARACTERS = re.compile('[\\x00-\\x1f\\x7f]')


class SetupAdminRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    username: str = Field(min_length=3, max_length=64)
    password: str = Field(min_length=8, max_length=256)
    password_confirmation: str = Field(alias='passwordConfirmation', min_length=8, max_length=256)

    @model_validator(mode='after')
    def validate_setup(self) -> 'SetupAdminRequest':
        self.username = self.username.strip()
        if len(self.username) < 3 or CONTROL_CHARACTERS.search(self.username):
            raise ValueError('账号长度至少为3个字符，且不能包含控制字符。')
        if self.password != self.password_confirmation:
            raise ValueError('两次输入的密码不一致。')
        return self


class LoginRequest(BaseModel):
    username: str = Field(min_length=1, max_length=64)
    password: str = Field(min_length=1, max_length=256)


class DisplayPairingCodeRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True, extra='forbid')

    project_id: str = Field(alias='projectId', min_length=36, max_length=36)
    name: str | None = Field(default=None, min_length=1, max_length=128)
    code: str | None = Field(default=None, min_length=6, max_length=6, pattern='^\\d{6}$')

    @field_validator('name')
    @classmethod
    def trim_pairing_name(cls, value: str | None) -> str | None:
        if value is None:
            return None
        value = value.strip()
        if not value or CONTROL_CHARACTERS.search(value):
            raise ValueError('设备名称无效。')
        return value


class DisplayPairingCodeUpdateRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True, extra='forbid')

    name: str | None = Field(default=None, min_length=1, max_length=128)
    project_id: str | None = Field(default=None, alias='projectId', min_length=36, max_length=36)
    enabled: bool | None = None

    @field_validator('name')
    @classmethod
    def trim_pairing_name(cls, value: str | None) -> str | None:
        if value is None:
            return None
        value = value.strip()
        if not value or CONTROL_CHARACTERS.search(value):
            raise ValueError('设备名称无效。')
        return value


class DisplayPairRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True, extra='forbid')

    code: str = Field(min_length=6, max_length=6, pattern='^\\d{6}$')
    device_name: str | None = Field(default=None, alias='deviceName', min_length=1, max_length=128)

    @field_validator('device_name')
    @classmethod
    def trim_device_name(cls, value: str | None) -> str | None:
        if value is None:
            return None
        value = value.strip()
        if not value or CONTROL_CHARACTERS.search(value):
            raise ValueError('设备名称无效。')
        return value


class DisplayDeviceUpdateRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True, extra='forbid')

    name: str | None = Field(default=None, min_length=1, max_length=128)
    project_id: str | None = Field(default=None, alias='projectId', min_length=36, max_length=36)

    @field_validator('name')
    @classmethod
    def trim_display_name(cls, value: str | None) -> str | None:
        if value is None:
            return None
        value = value.strip()
        if not value or CONTROL_CHARACTERS.search(value):
            raise ValueError('设备名称无效。')
        return value


class UserResponse(BaseModel):
    id: str
    username: str
    role: str


class SetupStatusResponse(BaseModel):
    initialized: bool
    version: str


class HAConnectionInput(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    base_url: str = Field(alias='baseUrl', min_length=8, max_length=512)
    access_token: str | None = Field(default=None, alias='accessToken', max_length=4096)
    verify_tls: bool = Field(default=True, alias='verifyTls')
    name: str = Field(default='Home Assistant', min_length=1, max_length=128)

    @field_validator('base_url')
    @classmethod
    def validate_base_url(cls, value: str) -> str:
        try:
            return normalize_base_url(value)
        except HAClientError as error:
            raise ValueError(str(error)) from error

    @field_validator('access_token')
    @classmethod
    def trim_token(cls, value: str | None) -> str | None:
        if value is None:
            return None
        value = value.strip()
        return value or None


class HATestRequest(HAConnectionInput):
    access_token: str = Field(alias='accessToken', min_length=1, max_length=4096)


class HAServiceCallRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    domain: str = Field(min_length=1, max_length=64, pattern='^[a-z0-9_]+$')
    service: str = Field(min_length=1, max_length=64, pattern='^[a-z0-9_]+$')
    entity_id: str = Field(alias='entityId', min_length=3, max_length=255, pattern='^[a-z0-9_]+\\.[a-z0-9_]+$')
    data: dict[str, Any] = Field(default_factory=dict)


class HABrowseMediaRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True, extra='forbid')

    entity_id: str = Field(alias='entityId', min_length=3, max_length=255, pattern='^[a-z0-9_]+\\.[a-z0-9_]+$')
    media_content_id: str = Field(default='media-source://', alias='mediaContentId', min_length=1, max_length=2048)
    media_content_type: str = Field(default='', alias='mediaContentType', max_length=128)


class ProjectCreateRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True, extra='forbid')

    name: str = Field(min_length=1, max_length=128)
    description: str = Field(default='', max_length=2000)
    canvas_width: int = Field(default=2778, alias='canvasWidth', ge=320, le=7680)
    canvas_height: int = Field(default=1940, alias='canvasHeight', ge=240, le=4320)

    @field_validator('name')
    @classmethod
    def trim_project_name(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError('项目名称不能为空。')
        return value


class ProjectDraftUpdate(BaseModel):
    model_config = ConfigDict(populate_by_name=True, extra='forbid')

    revision: int = Field(ge=1)
    global_popup_revision: int | None = Field(default=None, alias='globalPopupRevision', ge=1)
    global_popups_dirty: bool = Field(default=True, alias='globalPopupsDirty')
    document: dict[str, Any]


class ProjectDuplicateRequest(BaseModel):
    name: str = Field(min_length=1, max_length=128)

    @field_validator('name')
    @classmethod
    def trim_project_name(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError('项目名称不能为空。')
        return value


class ProjectDeleteRequest(BaseModel):
    confirmation: str = Field(min_length=1, max_length=128)


class Studio3DDraftUpdate(BaseModel):
    model_config = ConfigDict(extra='forbid')

    revision: int = Field(ge=0)
    scene: dict[str, Any]


class LicenseActivateRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    activation_code: str = Field(alias='activationCode', min_length=8, max_length=128)
    email: str = Field(min_length=3, max_length=255)
