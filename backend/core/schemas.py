"""接口的请求 / 响应模型（pydantic）。

约定：字段名用 snake_case、别名用前端 JSON 的 camelCase，`populate_by_name=True` 让两种
写法都能被接受；面向「后台表单已提交」的请求体一律 `extra='forbid'`，字段名拼错时直接报错
而不是静默丢弃用户的改动；所有用户输入的名字都跑一遍 `CONTROL_CHARACTERS` 检查。
"""
from __future__ import annotations

import re
from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from ..http.body_guard import MAX_JSON_DEPTH, MAX_SCENE_DOCUMENT_BYTES, json_nesting_depth
from ..panel.documents import DESIGN_HEIGHT, DESIGN_WIDTH
from .canonical_json import canonical_json_bytes
from ..ha.client import HAClientError, normalize_base_url

# 禁止出现在用户名 / 设备名里的控制字符（含 NUL 与 DEL）。
CONTROL_CHARACTERS = re.compile('[\\x00-\\x1f\\x7f]')


def _validated_device_name(value: str | None) -> str | None:
    """设备名去首尾空白并挡住控制字符；去空白后为空视为非法。

    四条路径共用这一份（配对码生成 / 配对码更新 / 设备配对 / 设备改名）：它们改的是同一台
    设备的同一个字段，口径一旦漂开就会出现「生成配对码时能取的名字，改设备名时被拒」。
    """
    if value is None:
        return None
    value = value.strip()
    if not value or CONTROL_CHARACTERS.search(value):
        raise ValueError('设备名称无效。')
    return value


def _validated_project_name(value: str) -> str:
    """项目名去首尾空白；全空白视为非法。

    `ProjectCreateRequest`（新建）与 `ProjectDuplicateRequest`（复制）共用这一份检查。项目名是
    正式展示地址的路径段（见 `display_path`），两处口径必须一致。
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
    #: 其余来源必须与服务端启动日志里给出的那份一致，否则 403。
    setup_token: str = Field(default='', alias='setupToken', max_length=256)

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
    def _validate_name(cls, value: str | None) -> str | None:
        """设备名去空白校验（口径见模块级 `_validated_device_name`）。

        「设备名」在本文件里有四个字段（配对码申请 / 配对码修改 / 已配对设备改名 /
        设备申请），四处的口径必须是同一个，所以校验器同名、都转发到同一个 helper。
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

        「设备名」在本文件里有四个字段（配对码申请 / 配对码修改 / 已配对设备改名 /
        设备申请），四处的口径必须是同一个，所以校验器同名、都转发到同一个 helper。
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

        「设备名」在本文件里有四个字段（配对码申请 / 配对码修改 / 已配对设备改名 /
        设备申请），四处的口径必须是同一个，所以校验器同名、都转发到同一个 helper。
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

        「设备名」在本文件里有四个字段（配对码申请 / 配对码修改 / 已配对设备改名 /
        设备申请），四处的口径必须是同一个，所以校验器同名、都转发到同一个 helper。
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

    `id` 用的是会话令牌的 sha256（库里存的就是它）：它不可逆、也不能当凭据用，
    但足以在撤销时唯一定位一行 —— 这样就不必为了「有个人可读的 id」再加一列。
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
    """HA 连接配置；测试连接与保存连接共用这一套字段。"""

    model_config = ConfigDict(populate_by_name=True)

    base_url: str = Field(alias='baseUrl', min_length=8, max_length=512)
    access_token: str | None = Field(default=None, alias='accessToken', max_length=4096)
    verify_tls: bool = Field(default=True, alias='verifyTls')
    name: str = Field(default='Home Assistant', min_length=1, max_length=128)
    #: 换地址时是否确认「继续复用已保存的令牌」。默认 False：把 HA 地址换成另一个
    #: 主机（哪怕是攻击者搭的同名服务）时，旧的长期令牌不能被静默送到新地址去。
    reuse_token_for_new_url: bool = Field(default=False, alias='reuseTokenForNewUrl')

    @field_validator('name')
    @classmethod
    def trim_connection_name(cls, value: str) -> str:
        """去空白后再校验连接名。

        ``min_length=1`` 判的是**未去空白**的原值，所以 ``" "`` 能过长度这一关，再被路由里的
        ``.strip()`` 存成空串 —— 库里就会出现没有名字的连接。去掉首尾空白后再判一次下限。
        """
        value = value.strip()
        if not value or CONTROL_CHARACTERS.search(value):
            raise ValueError('连接名称无效。')
        return value

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
    # 默认画布 = 设计标称尺寸（见 ``panel/documents.py`` 的 DESIGN_WIDTH/HEIGHT）：这里单向
    # 引用它，别再写一遍字面量 —— 改了设计基准而漏改这里，新建的仪表盘尺寸就会和前端按标称
    # 值算出来的布局对不上。
    canvas_width: int = Field(default=DESIGN_WIDTH, alias='canvasWidth', ge=320, le=7680)
    canvas_height: int = Field(default=DESIGN_HEIGHT, alias='canvasHeight', ge=240, le=4320)

    @field_validator('name')
    @classmethod
    def _validate_project_name(cls, value: str) -> str:
        """项目名去空白校验（口径见模块级 `_validated_project_name`）。"""
        return _validated_project_name(value)


class ProjectDraftUpdate(BaseModel):
    """保存项目草稿。

    `revision` 是乐观锁：必须与库内当前版本一致，否则接口返回 409 并带上服务端版本，让用户
    选择覆盖还是加载服务端版本。`global_popups_dirty` 为 False 时跳过全局弹窗的合并与写回，
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
    def _validate_project_name(cls, value: str) -> str:
        """项目名去空白校验（口径见模块级 `_validated_project_name`）。"""
        return _validated_project_name(value)


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

    @field_validator('scene')
    @classmethod
    def validate_scene_size(cls, value: dict[str, Any]) -> dict[str, Any]:
        """在类型边界上声明场景的体积与嵌套深度上限。

        这两条限制原先只写在路由上（字节数在 body_guard 中间件与写盘函数里、深度只在中间件里），
        而中间件只在装了它的应用上生效 —— 把路由器挂到别的 FastAPI 应用上时，一个几 KB 的深层
        嵌套 JSON 就能把 json.loads 打爆成 500，所以契约要声明在 schema 这一层。

        判据与中间件、写盘共用同一批常量，序列化方式也取写盘那一套，不会出现「接口放行、落盘拒收」。
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
