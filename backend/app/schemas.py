"""接口的请求 / 响应模型（pydantic）。

约定：
- 字段名用 snake_case，别名用前端 JSON 的 camelCase，`populate_by_name=True`
  让两种写法都能被接受。
- 面向「后台表单已提交」的请求体一律 `extra='forbid'`：字段名拼错时直接报错，
  而不是静默丢弃用户刚在界面上做的改动。
- 所有用户输入的名字都跑一遍 `CONTROL_CHARACTERS` 检查，
  防止控制字符进入日志与展示页。
"""
from __future__ import annotations

import re
from typing import Any

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from .ha.client import HAClientError, normalize_base_url

# 禁止出现在用户名 / 设备名里的控制字符（含 NUL 与 DEL）。
CONTROL_CHARACTERS = re.compile('[\\x00-\\x1f\\x7f]')


class SetupAdminRequest(BaseModel):
    """首次初始化管理员的请求体。"""

    model_config = ConfigDict(populate_by_name=True)

    username: str = Field(min_length=3, max_length=64)
    password: str = Field(min_length=8, max_length=256)
    password_confirmation: str = Field(alias='passwordConfirmation', min_length=8, max_length=256)

    @model_validator(mode='after')
    def validate_setup(self) -> 'SetupAdminRequest':
        """去空白后重新校验用户名，并确认两次口令一致。

        长度限制在 Field 上已经校验过一次，但那是针对未去空白的原值，
        所以去掉首尾空白后需要再判一次下限。
        """
        self.username = self.username.strip()
        if len(self.username) < 3 or CONTROL_CHARACTERS.search(self.username):
            raise ValueError('账号长度至少为3个字符，且不能包含控制字符。')
        if self.password != self.password_confirmation:
            raise ValueError('两次输入的密码不一致。')
        return self


class LoginRequest(BaseModel):
    """登录请求体；这里不做长度以外的格式约束，避免泄露账号规则。"""

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
    def trim_pairing_name(cls, value: str | None) -> str | None:
        """去掉首尾空白后校验设备名；去空白后为空视为非法。"""
        if value is None:
            return None
        value = value.strip()
        if not value or CONTROL_CHARACTERS.search(value):
            raise ValueError('设备名称无效。')
        return value


class DisplayPairingCodeUpdateRequest(BaseModel):
    """修改配对码属性的请求体；三个字段都可选，只改传了的那些。"""

    model_config = ConfigDict(populate_by_name=True, extra='forbid')

    name: str | None = Field(default=None, min_length=1, max_length=128)
    project_id: str | None = Field(default=None, alias='projectId', min_length=36, max_length=36)
    enabled: bool | None = None

    @field_validator('name')
    @classmethod
    def trim_pairing_name(cls, value: str | None) -> str | None:
        """去空白后校验设备名；去空白后为空视为非法。"""
        if value is None:
            return None
        value = value.strip()
        if not value or CONTROL_CHARACTERS.search(value):
            raise ValueError('设备名称无效。')
        return value


class DisplayPairRequest(BaseModel):
    """中控设备用 6 位配对码换取长期令牌的请求体。"""

    model_config = ConfigDict(populate_by_name=True, extra='forbid')

    code: str = Field(min_length=6, max_length=6, pattern='^\\d{6}$')
    device_name: str | None = Field(default=None, alias='deviceName', min_length=1, max_length=128)

    @field_validator('device_name')
    @classmethod
    def trim_device_name(cls, value: str | None) -> str | None:
        """去空白后校验设备名；去空白后为空视为非法。"""
        if value is None:
            return None
        value = value.strip()
        if not value or CONTROL_CHARACTERS.search(value):
            raise ValueError('设备名称无效。')
        return value


class DisplayDeviceUpdateRequest(BaseModel):
    """修改已配对设备（改名 / 改绑项目）的请求体。"""

    model_config = ConfigDict(populate_by_name=True, extra='forbid')

    name: str | None = Field(default=None, min_length=1, max_length=128)
    project_id: str | None = Field(default=None, alias='projectId', min_length=36, max_length=36)

    @field_validator('name')
    @classmethod
    def trim_display_name(cls, value: str | None) -> str | None:
        """去空白后校验设备名；去空白后为空视为非法。"""
        if value is None:
            return None
        value = value.strip()
        if not value or CONTROL_CHARACTERS.search(value):
            raise ValueError('设备名称无效。')
        return value


class UserResponse(BaseModel):
    """当前登录用户的公开信息（不含任何凭据）。"""

    id: str
    username: str
    role: str


class SetupStatusResponse(BaseModel):
    """初始化状态：前端据此决定跳 /setup 还是 /login。"""

    initialized: bool
    version: str


class HAConnectionInput(BaseModel):
    """HA 连接配置；测试连接与保存连接共用这一套字段。"""

    model_config = ConfigDict(populate_by_name=True)

    base_url: str = Field(alias='baseUrl', min_length=8, max_length=512)
    access_token: str | None = Field(default=None, alias='accessToken', max_length=4096)
    verify_tls: bool = Field(default=True, alias='verifyTls')
    name: str = Field(default='Home Assistant', min_length=1, max_length=128)

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

    # 域与服务名限定小写字母数字下划线，避免拼出任意 URL 路径。
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
    canvas_width: int = Field(default=2778, alias='canvasWidth', ge=320, le=7680)
    canvas_height: int = Field(default=1940, alias='canvasHeight', ge=240, le=4320)

    @field_validator('name')
    @classmethod
    def trim_project_name(cls, value: str) -> str:
        """去空白后校验项目名；全空白视为非法。"""
        value = value.strip()
        if not value:
            raise ValueError('项目名称不能为空。')
        return value


class ProjectDraftUpdate(BaseModel):
    """保存项目草稿。

    `revision` 是乐观锁：必须与库内当前版本一致，否则接口返回 409
    并带上服务端版本，让用户选择覆盖还是加载服务端版本。

    `global_popups_dirty` 为 False 时跳过全局弹窗的合并与写回，
    避免每次自动保存都去改写共享的全局弹窗表（那会让 revision 无谓增长）。
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
    def trim_project_name(cls, value: str) -> str:
        """去空白后校验新项目名；全空白视为非法。"""
        value = value.strip()
        if not value:
            raise ValueError('项目名称不能为空。')
        return value


class ProjectDeleteRequest(BaseModel):
    """删除仪表盘：要求前端回填项目名称作为二次确认。"""

    confirmation: str = Field(min_length=1, max_length=128)


class Studio3DDraftUpdate(BaseModel):
    """保存 3D 户型的编辑器草稿。

    revision 从 0 起（与项目草稿不同），同样用于冲突检测；
    scene 是完整的场景 JSON 快照，服务端不解析其内部结构。
    """

    model_config = ConfigDict(extra='forbid')

    revision: int = Field(ge=0)
    scene: dict[str, Any]


class LicenseActivateRequest(BaseModel):
    """用激活码 + 购买邮箱激活本机授权。"""

    model_config = ConfigDict(populate_by_name=True)

    activation_code: str = Field(alias='activationCode', min_length=8, max_length=128)
    email: str = Field(min_length=3, max_length=255)
