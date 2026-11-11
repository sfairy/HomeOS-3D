"""命令代理模块 Pydantic v2 请求模型（DTO），对齐 Nest class-validator 定义。"""

from __future__ import annotations

from typing import Any

from pydantic import Field, model_validator

from .base import StrictModel


class CallServiceDto(StrictModel):
    domain: str = Field(min_length=1, max_length=64, pattern=r"^[a-z0-9_]+$")
    service: str = Field(min_length=1, max_length=64, pattern=r"^[a-z0-9_]+$")
    #: 目标实体。这里与 ``/ha/services/call`` 用同一套形态约束，避免「校验 A、下发 B」：
    #: 放开到任意字符串时，空格/大写/中文都会被原样送给 HA，再由 HA 静默跳过。
    entity_id: str = Field(
        min_length=3,
        max_length=255,
        pattern=r"^[a-z0-9_]+\.[a-z0-9_]+$",
    )
    service_data: dict[str, Any] | None = None
    return_response: bool | None = None
    idempotency_key: str | None = Field(default=None, max_length=128)

    @model_validator(mode="before")
    @classmethod
    def _accept_data_key(cls, value: Any) -> Any:
        """把前端统一的参数键 ``data`` 归一成 ``service_data``。

        前端（实体 store / 预报拉取）按 ``/ha/services/call`` 的契约发 ``data``，
        而本 DTO 历史上叫 ``service_data``；``StrictModel`` 会拒绝未知键并回 400
        ``data: Extra inputs are not permitted``，导致一次亮灯 / 调温都下发不了。
        两个键同时出现时以显式非空的 ``service_data`` 为准，``data`` 始终被移除，
        否则仍会触发 extra_forbid。
        """
        if isinstance(value, dict) and "data" in value:
            mapped = dict(value)
            data = mapped.pop("data")
            if mapped.get("service_data") is None:
                mapped["service_data"] = data if isinstance(data, dict) else {}
            return mapped
        return value


class BatchCallServiceDto(StrictModel):
    """批量控制请求。

    批量下发本身是「一个手势 N 条命令」，所以：

    - 上限硬编码在 DTO 层（``max_length``）而不是业务层 —— 反序列化阶段就挡住超大请求，
      避免先读进内存再判断；
    - ``concurrency`` 缺省 4：串行太慢（100 台设备要几十秒），无上限会打爆 HA 与连接池；
    - ``cancelOnError`` 只在「第一条失败」时停止后续下发，已下发的如实回报。
    """

    items: list[CallServiceDto] = Field(min_length=1, max_length=200)
    concurrency: int | None = Field(default=None, ge=1, le=16)
    cancelOnError: bool | None = None
