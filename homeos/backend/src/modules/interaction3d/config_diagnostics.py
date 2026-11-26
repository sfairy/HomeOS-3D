"""3D 交互配置的**结构化诊断**（0.8.9 `config_diagnostics.py`）。

为什么需要它：``validate_config`` 只在保存时抛一句 422，用户（和排障的人）拿到的信息是
「配置无效」—— 一份 3D 面板可能有几十个分区，这句话定位不到任何地方。0.8.9 把
「同一条规则」同时用于**保存**与**只读检查**，前者拒绝、后者回报：

    {"valid": false, "findings": [{"scope": "lights", "reason": "…"}, …]}

实现方式（刻意不改各分区校验器）：

- 分区校验器仍是「失败即抛 422」，没有返回值；
- 这里按**分区**逐个跑，每个分区用独立的 :class:`ValidationContext`，
  捕获它的 422 并把 ``scope`` 记进去；
- 因此新增一个分区只需要在 :data:`CONFIG_SECTIONS` 里加一行，
  不需要改任何 ``validate_*`` 的签名。

保存路径（:func:`configured_validate_config`）会把失败的 ``scope`` 放进响应头
``x-homeos-config-scope``，便于前端与日志定位具体分区。
"""

from __future__ import annotations

import logging
from collections.abc import Callable
from dataclasses import dataclass
from typing import Any

from fastapi import HTTPException
from pydantic import BaseModel, Field

from .config_ctx import ValidationContext
from .config_sections_appearance import validate_appearance_sections
from .config_sections_core import validate_core_sections, validate_navigation_defaults
from .config_sections_devices import validate_devices_section
from .config_sections_environment import validate_environment_section
from .config_sections_lights import validate_lights_section
from .config_sections_security import validate_security_section
from ...platform.core.http.errors import BusinessException, ErrorCode, api_error

logger = logging.getLogger("homeos.interaction3d.config")


class ConfigDiagnosticsRequest(BaseModel):
    """只读诊断的请求体：把一份 3D 控件 properties 交给同一套规则检查。"""

    properties: dict[str, Any] = Field(default_factory=dict)


# 路由本身在 `studio_additions.py`（鉴权在路由层，校验纯函数留在这里）。
#
# 为什么不在本模块挂路由：本模块依赖 `config`（保存路径要复用 `configured_validate_config`），
# 而 `access` 又依赖 `config`；路由需要 `require_access`，于是
# `access ↔ config ↔ config_diagnostics` 成环。把路由挪走后本模块退回**纯校验**，
# 环自然断开 —— 这也是它现在完全不 import `access` 的原因。

#: 分区清单：(报告里的 scope 名, 校验函数)。顺序即报错优先级。
CONFIG_SECTIONS: tuple[tuple[str, Callable[[ValidationContext, dict], None]], ...] = (
    ("core", validate_core_sections),
    ("navigation", validate_navigation_defaults),
    ("security", validate_security_section),
    ("appearance", validate_appearance_sections),
    ("lights", validate_lights_section),
    ("environment", validate_environment_section),
    ("devices", validate_devices_section),
)

#: 单个配置允许返回的最大 finding 数（防止一份畸形配置刷出几千条）。
MAX_FINDINGS = 32


@dataclass(frozen=True, slots=True)
class ConfigurationCheck:
    """一条诊断结论。``scope`` 是分区名，``reason`` 是可直接展示的中文原因。"""

    scope: str
    reason: str

    def as_payload(self) -> dict[str, str]:
        return {"scope": self.scope, "reason": self.reason}


#: ``ValidationContext.fail()`` 未指名到具体字段时的兜底文案。
GENERIC_REASON = "3D 交互配置无效，请检查户型、灯光、环境及图标设置。"

#: 分区名的中文标签（报告里给人看）。
SCOPE_LABELS = {
    "core": "基础",
    "navigation": "导航",
    "security": "安防",
    "appearance": "外观",
    "lights": "灯光",
    "environment": "环境设备",
    "devices": "家电",
    "config": "整体",
}


def _scope_label(scope: str) -> str:
    return SCOPE_LABELS.get(scope, scope)


def _failure_reason(error: HTTPException, scope: str) -> str:
    """把分区校验器抛出的 422 归一成一句可展示的原因。

    多数 ``ctx.fail()`` 没带 ``detail``，此时退回「<分区>的配置不合法」——
    至少能定位到分区，比全篇一句「配置无效」有用。
    """
    detail = error.detail
    reason = ""
    if isinstance(detail, str):
        reason = detail.strip()
    elif isinstance(detail, dict):
        message = detail.get("message")
        if isinstance(message, str):
            reason = message.strip()
    if not reason or reason == GENERIC_REASON:
        return f"{_scope_label(scope)}分区的配置不合法。"
    return reason


def check_configuration(properties: Any) -> list[ConfigurationCheck]:
    """跑一遍全部分区，返回**全部**失败项（不抛错）。"""
    if not isinstance(properties, dict):
        return [ConfigurationCheck("config", "3D 控件设置需要是对象。")]
    findings: list[ConfigurationCheck] = []
    for scope, validator in CONFIG_SECTIONS:
        if len(findings) >= MAX_FINDINGS:
            break
        context = ValidationContext()
        try:
            validator(context, properties)
        except HTTPException as error:
            # 单个分区可能有多处问题，但校验器在第一个失败点就停了；
            # 这里只记录它给出的原因，继续跑下一个分区，尽量多报一点。
            # 诊断路径刻意不写日志：它是用户点「检查」触发的高频只读调用，
            # 结论已经通过 `findings` 返回给前端了。
            logger.debug("配置分区 %s 校验未通过：%s", scope, _failure_reason(error, scope))
            findings.append(ConfigurationCheck(scope, _failure_reason(error, scope)))
    return findings


def diagnostic_payload(properties: Any) -> dict[str, object]:
    """诊断接口的响应体：``valid`` + ``findings``。"""
    findings = check_configuration(properties)
    return {
        "valid": not findings,
        "findings": [finding.as_payload() for finding in findings],
    }


def configured_validate_config(properties: dict) -> None:
    """保存路径的入口：失败时抛出带 ``apiErrorCode`` 与分区头的业务异常。

    与 ``config.validate_config`` 的区别：那个失败即抛原始 422；这个按分区捕获，
    统一成 ``apiErrorCode=INTERACTION3D_CONFIG_INVALID``（前端按码分派，不靠文案），
    并把分区名放进 ``x-homeos-config-scope`` 响应头。
    """
    if not isinstance(properties, dict):
        raise BusinessException(ErrorCode.VALIDATION_FAILED, api_error("INTERACTION3D_CONFIG_INVALID"), 422)
    for scope, validator in CONFIG_SECTIONS:
        context = ValidationContext()
        try:
            validator(context, properties)
        except HTTPException as error:
            raise BusinessException(
                ErrorCode.VALIDATION_FAILED,
                api_error("INTERACTION3D_CONFIG_INVALID"),
                422,
                headers={"x-homeos-config-scope": scope},
            ) from error


__all__ = [
    "CONFIG_SECTIONS",
    "ConfigurationCheck",
    "check_configuration",
    "configured_validate_config",
    "diagnostic_payload",
]
