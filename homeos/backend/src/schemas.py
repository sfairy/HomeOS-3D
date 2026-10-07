"""接口的请求 / 响应模型（pydantic）。"""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel, ConfigDict, Field, field_validator

from .ha.client import HAClientError
from .ha.connection_setup import validate_address_input

# 认证相关模型（SetupAdminRequest / LoginRequest / UserResponse / SetupStatusResponse）
# 已随「本地管理员账户文件」方案一并退役：注册登录口径见 `src/api/schemas/auth.py`。


class HAConnectionInput(BaseModel):

    model_config = ConfigDict(populate_by_name=True)

    base_url: str = Field(alias='baseUrl', min_length=1, max_length=512)
    external_base_url: str | None = Field(default=None, alias='externalBaseUrl', max_length=512)
    access_token: str | None = Field(default=None, alias='accessToken', max_length=4096)
    verify_tls: bool = Field(default=True, alias='verifyTls')
    external_verify_tls: bool = Field(default=True, alias='externalVerifyTls')
    name: str = Field(default='Home Assistant', min_length=1, max_length=128)
    reuse_token_for_new_url: bool = Field(default=False, alias='reuseTokenForNewUrl')

    @field_validator('base_url')
    @classmethod
    def validate_base_url(cls, value: str) -> str:
        try:
            return validate_address_input(value)
        except HAClientError as error:
            raise ValueError(str(error)) from error

    @field_validator('external_base_url')
    @classmethod
    def validate_external_base_url(cls, value: str | None) -> str | None:
        if value is None:
            return None
        value = value.strip()
        if not value:
            return None
        try:
            return validate_address_input(value)
        except HAClientError as error:
            raise ValueError(str(error)) from error

    @field_validator('access_token')
    @classmethod
    def trim_token(cls, value: str | None) -> str | None:
        if value is None:
            return None
        value = value.strip()
        if value and (not value.isascii() or any(char.isspace() or ord(char) < 32 or ord(char) == 127 for char in value)):
            raise ValueError('访问令牌格式不正确，请粘贴完整令牌，不要包含中文、空格或换行。')
        return value or None


class HATestRequest(HAConnectionInput):
    pass


class HAServiceCallRequest(BaseModel):

    model_config = ConfigDict(populate_by_name=True)

    domain: str = Field(min_length=1, max_length=64, pattern='^[a-z0-9_]+$')
    service: str = Field(min_length=1, max_length=64, pattern='^[a-z0-9_]+$')
    entity_id: str = Field(alias='entityId', min_length=3, max_length=255, pattern='^[a-z0-9_]+\\.[a-z0-9_]+$')
    data: dict[str, Any] = Field(default_factory=dict)


class HABrowseMediaRequest(BaseModel):

    model_config = ConfigDict(populate_by_name=True, extra='forbid')

    entity_id: str = Field(alias='entityId', min_length=3, max_length=255, pattern='^[a-z0-9_]+\\.[a-z0-9_]+$')
    media_content_id: str = Field(default='media-source://', alias='mediaContentId', max_length=2048)
    media_content_type: str = Field(default='', alias='mediaContentType', max_length=128)
    player_library: bool = Field(default=False, alias='playerLibrary')


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
    interactionConfirmation: str = Field(default='', max_length=64)


class LicenseActivateRequest(BaseModel):

    model_config = ConfigDict(populate_by_name=True)

    activation_code: str = Field(alias='activationCode', min_length=8, max_length=128)
    email: str = Field(min_length=3, max_length=255)
