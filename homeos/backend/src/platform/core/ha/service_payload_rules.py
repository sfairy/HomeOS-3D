"""HA 服务调用参数的**唯一**校验实现。

为什么单独一个模块：``/ha/services/call`` 原本自带完整白名单，而 ``/services/call``
（前端实体控制走的就是这条）**一份都没有** —— 同一个判据被实现两次，然后只有一处
在演化。这里把它收敛成一份纯函数，两条 HTTP 通道与命令代理出口共用：

- ``domains/ha/integration/service_call.py``：把 ``ServicePayloadRejected`` 翻成原有的
  ``ServiceCallRejected``（状态码与文案逐字保持，前端与冒烟脚本依赖它们）；
- ``domains/proxy/command_proxy.py``：翻成 ``BusinessException``，成为**唯一执行出口**的
  准入闸门，于是「新增一条下发通道」不会再绕开白名单。

策略（``policy``）：

- ``http``：``ALLOWED_SERVICES`` 服务键 + **字段级**白名单 + 实体域匹配（原 ``/ha`` 口径）；
- ``agent``：仅服务键（``agent_service_allowed``，叠加 toggle / scene 例外）。字段过滤由
  调用方的 ``sanitize_service_data`` 负责 —— 那里按「已知安全字段」放行，比逐服务白名单更宽，
  两者不能互换，否则管家就说不出合法的 ``code`` / 播放参数。

本模块不 import FastAPI，也不读请求对象：只做纯判定，HTTP 形状由调用方决定。
"""

from __future__ import annotations

import math
import re
from typing import Any, NoReturn

from .ha_service_catalog import (
    ALLOWED_SERVICES,
    TOGGLE_ENTITY_DOMAINS,
    agent_service_allowed,
)

#: 域内表达 HTTP 结果用的状态码（与 FastAPI ``status`` 同值，但不 import 它）。
FORBIDDEN = 403
UNPROCESSABLE = 422

MEDIA_PLAYER_PATTERN = re.compile(r"media_player\.[a-z0-9_]+")

#: 灯光颜色字段 → 每分量上界（顺序敏感：``hs_color`` 是 [hue, saturation]）。
_COLOR_FIELDS: tuple[tuple[str, tuple[float, ...]], ...] = (
    ("hs_color", (360, 100)),
    ("rgb_color", (255, 255, 255)),
    ("rgbw_color", (255, 255, 255, 255)),
    ("rgbww_color", (255, 255, 255, 255, 255)),
    ("xy_color", (1, 1)),
)


class ServicePayloadRejected(Exception):
    """服务调用参数被拒（纯领域异常，由调用方翻译成自己的 HTTP 形状）。"""

    def __init__(self, status_code: int, detail: str) -> None:
        super().__init__(detail)
        self.status_code = status_code
        self.detail = detail


def _reject(status_code: int, detail: str) -> NoReturn:
    raise ServicePayloadRejected(status_code, detail)


def _validate_light_color(data: dict[str, Any]) -> None:
    color_fields = {
        "white",
        "hs_color",
        "rgb_color",
        "rgbw_color",
        "rgbww_color",
        "xy_color",
        "color_temp_kelvin",
        # 与 ``color_temp_kelvin`` 同义的别名，同样参与「只能指定一种颜色或色温」互斥。
        "kelvin",
    } & set(data)
    if len(color_fields) > 1:
        _reject(UNPROCESSABLE, "一次灯光指令只能指定一种颜色或色温。")
    if "white" in data:
        white = data["white"]
        if not (isinstance(white, bool) or (isinstance(white, int) and 0 <= white <= 255)):
            _reject(UNPROCESSABLE, "白光亮度参数无效。")
    for field, bounds in _COLOR_FIELDS:
        if field not in data:
            continue
        values = data[field]
        if (
            not isinstance(values, list)
            or len(values) != len(bounds)
            or any(
                isinstance(v, bool) or not isinstance(v, (int, float)) or not math.isfinite(v) or not (0 <= v <= bound)
                for v, bound in zip(values, bounds, strict=True)
            )
        ):
            _reject(UNPROCESSABLE, f"灯光颜色参数无效：{field}")


def _validate_media_fields(data: dict[str, Any], entity_id: str) -> None:
    # 播放组：``group_members`` 只能是媒体实体，且不能把自身加进去（HA 会静默忽略，
    # 前端却会显示"已加入"，所以在这里直接拒）。
    if "group_members" in data:
        members = data["group_members"]
        if not isinstance(members, list) or any(
            not isinstance(member, str) or not MEDIA_PLAYER_PATTERN.fullmatch(member) for member in members
        ):
            _reject(UNPROCESSABLE, "播放组成员必须是媒体实体。")
        if entity_id in members:
            _reject(UNPROCESSABLE, "不能把当前设备加入它自己的播放组。")
    # TTS 的播放设备必须是媒体实体（否则 HA 端会报"找不到实体"）。
    if "media_player_entity_id" in data:
        speaker = data["media_player_entity_id"]
        if not isinstance(speaker, str) or not MEDIA_PLAYER_PATTERN.fullmatch(speaker):
            _reject(UNPROCESSABLE, "请选择播放设备。")
    # AI 任务附件：只校验形状，不下载（下载在 client 的 ``generate_image`` 链路里）。
    if "attachments" in data:
        attachments = data["attachments"]
        if not isinstance(attachments, list) or any(
            not isinstance(item, dict)
            or set(item) - {"media_content_id", "media_content_type"}
            or not isinstance(item.get("media_content_id"), str)
            or not item["media_content_id"]
            for item in attachments
        ):
            _reject(UNPROCESSABLE, "附件参数无效。")


def _validate_domains(domain: str, service: str, entity_id: str) -> None:
    if not entity_id:
        # 无实体的服务调用（脚本 / 通知等）没有可比的域，跳过匹配。
        return
    entity_domain = entity_id.partition(".")[0]
    if domain == "homeassistant" and service == "toggle" and entity_domain not in TOGGLE_ENTITY_DOMAINS:
        _reject(UNPROCESSABLE, "该实体类型不支持切换动作。")
    if domain != "homeassistant" and entity_domain != domain:
        _reject(UNPROCESSABLE, "服务域与实体域不匹配。")


def validate_service_payload(
    domain: Any,
    service: Any,
    data: Any,
    entity_id: Any = "",
    *,
    policy: str = "http",
) -> None:
    """校验一次 HA 服务调用；不通过时抛 :class:`ServicePayloadRejected`。

    ``data`` 非 dict 时按空字典处理（DTO 层已保证形状，这里只做防御）。
    调用顺序与文案与原先 ``_validate_service_call`` 逐条一致 —— 前端对文案有依赖。
    """
    domain_text = str(domain or "").strip()
    service_text = str(service or "").strip()
    entity_text = str(entity_id or "").strip()
    payload = data if isinstance(data, dict) else {}

    if "target" in payload:
        # HA REST 也认 body 内的 ``target``（entity_id / area_id / device_id），而这里的
        # 白名单、实体 ACL、后置校验全都只认顶层 ``entity_id``。放行等于「校验 A、下发 B」，
        # 所以统一拒掉：需要按区域 / 设备批量下发就走各自的批量接口。
        _reject(UNPROCESSABLE, "服务参数不允许：target")

    if policy == "agent":
        if not agent_service_allowed(domain_text, service_text):
            _reject(FORBIDDEN, "该 Home Assistant 服务不在允许列表中。")
        return

    if policy != "http":
        _reject(FORBIDDEN, f"未知的服务调用策略：{policy}")

    # 目录的键是小写：先归一再查，避免 ``Light.turn_on`` 绕过查表又跳过灯光参数校验。
    domain_key = domain_text.lower()
    service_key = service_text.lower()
    allowed_fields = ALLOWED_SERVICES.get((domain_key, service_key))
    if allowed_fields is None:
        _reject(FORBIDDEN, "该 Home Assistant 服务不在允许列表中。")
    unknown_fields = set(payload) - allowed_fields
    if unknown_fields:
        _reject(UNPROCESSABLE, f"服务参数不允许：{', '.join(sorted(unknown_fields))}")

    if domain_key == "light" and service_key == "turn_on":
        _validate_light_color(payload)
    _validate_media_fields(payload, entity_text)
    _validate_domains(domain_key, service_key, entity_text)


__all__ = [
    "FORBIDDEN",
    "MEDIA_PLAYER_PATTERN",
    "UNPROCESSABLE",
    "ServicePayloadRejected",
    "validate_service_payload",
]
