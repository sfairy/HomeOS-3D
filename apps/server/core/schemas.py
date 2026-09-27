"""接口的请求 / 响应模型（pydantic）。
"""
from __future__ import annotations

import re
from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from .body_limits import MAX_JSON_DEPTH, MAX_SCENE_DOCUMENT_BYTES, json_nesting_depth
from .design import DESIGN_HEIGHT, DESIGN_WIDTH
from .canonical_json import canonical_json_bytes
from .ha_url import HAClientError, normalize_base_url

# 禁止出现在用户名 / 设备名里的控制字符（含 NUL 与 DEL）。
CONTROL_CHARACTERS = re.compile('[\\x00-\\x1f\\x7f]')


def _validated_device_name(value: str | None) -> str | None:
    """设备名去首尾空白并挡住控制字符；去空白后为空视为非法。
    """
    if value is None:
        return None
    value = value.strip()
    if not value or CONTROL_CHARACTERS.search(value):
        raise ValueError('设备名称无效。')
    return value


def _validated_project_name(value: str) -> str:
    """项目名去首尾空白；全空白视为非法。
    """
    value = value.strip()
    if not value:
        raise ValueError('项目名称不能为空。')
    return value


class SetupAdminRequest(BaseModel):
    """首次初始化管理员的请求体。"""

    model_config = ConfigDict(populate_by_name=True)

    username: str = Field(min_length=3, max_length=64)
    password: str = Field(min_length=8, max_length=256)
    password_confirmation: str = Field(alias='passwordConfirmation', min_length=8, max_length=256)
    #: 首次初始化窗口的引导密钥。从本机（loopback）直连时可以留空；
    setup_token: str = Field(default='', alias='setupToken', max_length=256)

    @model_validator(mode='after')
    def validate_setup(self) -> 'SetupAdminRequest':
        """去空白后重新校验用户名，并确认两次口令一致。
        """
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
    """生成配对码的请求体。"""

    model_config = ConfigDict(populate_by_name=True, extra='forbid')

    # 项目 id 固定 36 位（UUID），长度本身就是一道校验。
    project_id: str = Field(alias='projectId', min_length=36, max_length=36)
    name: str | None = Field(default=None, min_length=1, max_length=128)
    # 允许客户端指定 6 位数字码；不传则由服务端随机生成。
    code: str | None = Field(default=None, min_length=6, max_length=6, pattern='^\\d{6}$')

    @field_validator('name')
    @classmethod
    def _validate_name(cls, value: str | None) -> str | None:
        """设备名去空白校验（口径见模块级 `_validated_device_name`）。
        """
        return _validated_device_name(value)


class DisplayPairingCodeUpdateRequest(BaseModel):
    """修改配对码属性的请求体；三个字段都可选，只改传了的那些。"""

    model_config = ConfigDict(populate_by_name=True, extra='forbid')

    name: str | None = Field(default=None, min_length=1, max_length=128)
    project_id: str | None = Field(default=None, alias='projectId', min_length=36, max_length=36)
    enabled: bool | None = None

    @field_validator('name')
    @classmethod
    def _validate_name(cls, value: str | None) -> str | None:
        """设备名去空白校验（口径见模块级 `_validated_device_name`）。
        """
        return _validated_device_name(value)


class DisplayPairRequest(BaseModel):
    """中控设备用 6 位配对码换取长期令牌的请求体。"""

    model_config = ConfigDict(populate_by_name=True, extra='forbid')

    code: str = Field(min_length=6, max_length=6, pattern='^\\d{6}$')
    device_name: str | None = Field(default=None, alias='deviceName', min_length=1, max_length=128)

    @field_validator('device_name')
    @classmethod
    def _validate_name(cls, value: str | None) -> str | None:
        """设备名去空白校验（口径见模块级 `_validated_device_name`）。
        """
        return _validated_device_name(value)


class DisplayDeviceUpdateRequest(BaseModel):
    """修改已配对设备（改名 / 改绑项目）的请求体。"""

    model_config = ConfigDict(populate_by_name=True, extra='forbid')

    name: str | None = Field(default=None, min_length=1, max_length=128)
    project_id: str | None = Field(default=None, alias='projectId', min_length=36, max_length=36)

    @field_validator('name')
    @classmethod
    def _validate_name(cls, value: str | None) -> str | None:
        """设备名去空白校验（口径见模块级 `_validated_device_name`）。
        """
        return _validated_device_name(value)


class UserResponse(BaseModel):
    """当前登录用户的公开信息（不含任何凭据）。"""

    id: str
    username: str
    role: str


class SetupStatusResponse(BaseModel):
    """初始化状态：前端据此决定跳 /setup 还是 /login。"""

    initialized: bool
    version: str


class LoginSessionResponse(BaseModel):
    """一条管理员登录会话（供「登录会话」列表展示与撤销）。
    """

    model_config = ConfigDict(populate_by_name=True)

    id: str
    #: 是否就是发起本次请求的那条会话（前端把它排在最前并标注「本机」）。
    current: bool
    created_at: datetime = Field(alias='createdAt')
    last_seen_at: datetime = Field(alias='lastSeenAt')
    #: 滑动有效期：活跃会往后推。
    expires_at: datetime = Field(alias='expiresAt')
    #: 绝对寿命上限（created_at + 硬上限）；配成 0（不设上限）时为 None。
    absolute_expires_at: datetime | None = Field(default=None, alias='absoluteExpiresAt')
    ip_address: str = Field(alias='ipAddress')
    user_agent: str = Field(alias='userAgent')


class LoginSessionListResponse(BaseModel):
    """登录会话列表。"""

    model_config = ConfigDict(populate_by_name=True)

    items: list[LoginSessionResponse]
    total: int


class HAConnectionInput(BaseModel):
    """HA 连接配置；测试连接与保存连接共用这一套字段。
    """

    model_config = ConfigDict(populate_by_name=True)

    #: 内网（优先）地址，必填：HomeOS 平时就装在家里，这一路是常态。
    base_url: str = Field(alias='baseUrl', min_length=8, max_length=512)
    #: 外网（备用）地址，选填。留空表示内网不通就直接报错。
    external_base_url: str | None = Field(default=None, alias='externalBaseUrl', max_length=512)
    access_token: str | None = Field(default=None, alias='accessToken', max_length=4096)
    #: 内网地址是否校验 HTTPS 证书。默认 False：内网部署基本是 http（该校验对 http 无效）
    verify_tls: bool = Field(default=False, alias='verifyTls')
    #: 外网地址是否校验 HTTPS 证书。默认 True。
    external_verify_tls: bool = Field(default=True, alias='externalVerifyTls')
    name: str = Field(default='Home Assistant', min_length=1, max_length=128)
    #: 换地址时是否确认「继续复用已保存的令牌」。默认 False：把 HA 地址换成另一个
    reuse_token_for_new_url: bool = Field(default=False, alias='reuseTokenForNewUrl')

    @field_validator('name')
    @classmethod
    def trim_connection_name(cls, value: str) -> str:
        """去空白后再校验连接名。
        """
        value = value.strip()
        if not value or CONTROL_CHARACTERS.search(value):
            raise ValueError('连接名称无效。')
        return value

    @field_validator('external_base_url')
    @classmethod
    def normalize_external_url(cls, value: str | None) -> str | None:
        """外网地址去空白；空串一律归一成 None。
        """
        if value is None:
            return None
        value = value.strip()
        return value or None

    @field_validator('base_url')
    @classmethod
    def validate_base_url(cls, value: str) -> str:
        """复用 HA 客户端的归一化逻辑，保证存库的地址与运行时用的完全一致。"""
        try:
            return normalize_base_url(value)
        except HAClientError as error:
            # 把客户端异常转成校验错误，让接口统一返回 422 而不是 500。
            raise ValueError(str(error)) from error

    @field_validator('access_token')
    @classmethod
    def trim_token(cls, value: str | None) -> str | None:
        """令牌去空白；空串归一成 None，表示"不修改已保存的令牌"。"""
        if value is None:
            return None
        value = value.strip()
        return value or None


class HATestRequest(HAConnectionInput):
    """测试连接：与保存不同，这里必须提供令牌才能真的连一次。"""

    access_token: str = Field(alias='accessToken', min_length=1, max_length=4096)


class HAServiceCallRequest(BaseModel):
    """调用 HA 服务（控制设备）的请求体。"""

    model_config = ConfigDict(populate_by_name=True)

    domain: str = Field(min_length=1, max_length=64, pattern='^[a-z0-9_]+$')
    service: str = Field(min_length=1, max_length=64, pattern='^[a-z0-9_]+$')
    entity_id: str = Field(alias='entityId', min_length=3, max_length=255, pattern='^[a-z0-9_]+\\.[a-z0-9_]+$')
    data: dict[str, Any] = Field(default_factory=dict)


class HABrowseMediaRequest(BaseModel):
    """浏览 HA 媒体源目录的请求体；默认从根媒体源开始。"""

    model_config = ConfigDict(populate_by_name=True, extra='forbid')

    entity_id: str = Field(alias='entityId', min_length=3, max_length=255, pattern='^[a-z0-9_]+\\.[a-z0-9_]+$')
    media_content_id: str = Field(default='media-source://', alias='mediaContentId', min_length=1, max_length=2048)
    media_content_type: str = Field(default='', alias='mediaContentType', max_length=128)


class ProjectCreateRequest(BaseModel):
    """新建仪表盘；画布尺寸上下限与编辑器输入框约束一致。"""

    model_config = ConfigDict(populate_by_name=True, extra='forbid')

    name: str = Field(min_length=1, max_length=128)
    description: str = Field(default='', max_length=2000)
    canvas_width: int = Field(default=DESIGN_WIDTH, alias='canvasWidth', ge=320, le=7680)
    canvas_height: int = Field(default=DESIGN_HEIGHT, alias='canvasHeight', ge=240, le=4320)

    @field_validator('name')
    @classmethod
    def _validate_project_name(cls, value: str) -> str:
        """项目名去空白校验（口径见模块级 `_validated_project_name`）。"""
        return _validated_project_name(value)


class ProjectDraftUpdate(BaseModel):
    """保存项目草稿。
    """

    model_config = ConfigDict(populate_by_name=True, extra='forbid')

    revision: int = Field(ge=1)
    global_popup_revision: int | None = Field(default=None, alias='globalPopupRevision', ge=1)
    global_popups_dirty: bool = Field(default=True, alias='globalPopupsDirty')
    document: dict[str, Any]


class ProjectDuplicateRequest(BaseModel):
    """复制仪表盘：只需给出新名称，内容由服务端深拷贝。"""

    name: str = Field(min_length=1, max_length=128)

    @field_validator('name')
    @classmethod
    def _validate_project_name(cls, value: str) -> str:
        """项目名去空白校验（口径见模块级 `_validated_project_name`）。"""
        return _validated_project_name(value)


class ProjectDeleteRequest(BaseModel):
    """删除仪表盘：要求前端回填项目名称作为二次确认。"""

    confirmation: str = Field(min_length=1, max_length=128)


class Studio3DDraftUpdate(BaseModel):
    """保存 3D 户型的编辑器草稿。
    """

    model_config = ConfigDict(extra='forbid')

    revision: int = Field(ge=0)
    scene: dict[str, Any]
    interaction_confirmation: str | None = Field(default=None, alias='interactionConfirmation', max_length=64)

    @field_validator('scene')
    @classmethod
    def validate_scene_size(cls, value: dict[str, Any]) -> dict[str, Any]:
        """在类型边界上声明场景的体积与嵌套深度上限。
        """
        encoded = canonical_json_bytes(value)
        if len(encoded) > MAX_SCENE_DOCUMENT_BYTES:
            raise ValueError('户型图数据过大，无法保存。')
        if json_nesting_depth(encoded) > MAX_JSON_DEPTH:
            raise ValueError(f'户型图的嵌套层级超过 {MAX_JSON_DEPTH} 层，无法保存。')
        return value


class LicenseActivateRequest(BaseModel):
    """用激活码 + 购买邮箱激活本机授权。"""

    model_config = ConfigDict(populate_by_name=True)

    activation_code: str = Field(alias='activationCode', min_length=8, max_length=128)
    email: str = Field(min_length=3, max_length=255)
