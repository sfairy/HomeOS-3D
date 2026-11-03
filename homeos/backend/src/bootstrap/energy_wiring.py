"""启动期装配「能耗绑定」的三个取数回调。

从 ``lifespan`` 拆出来只为两件事：

1. ``lifespan`` 是超长文件，装配细节往里塞会把文件体积棘轮顶穿；
2. 这三个回调共享同一份口径语义（主表 / 佐证表 / 实体角色），放在一起才看得出
   它们必须一致 —— 聚合用的主表、粒度权威表、保存校验用的实体属性都从这里出。
"""

from __future__ import annotations

import logging
from collections.abc import Callable
from typing import Any

logger = logging.getLogger(__name__)


def make_energy_primary_provider(app_config: Any) -> Callable[[], set[str]]:
    """「本次应计入总耗的电表集合」回调（能耗聚合只认绑定值）。

    HA 里同一块物理表经常同时暴露日累计、月累计、年累计三四个 sensor，再叠加各回路
    电量表。全部当作候选实体聚合会把同一度电重复计费。这里只返回主电表；日/月累计是
    同一块表的另一个统计口径，回路表是主表的下游拆分，二者都不能再加一遍。
    没有绑定主电表时返回空集合，调用方回退到全量识别（老装机不丢数据）。
    """

    def _energy_primary_entities() -> set[str]:
        energy = app_config.get("energy") or {}
        meter_id = str(energy.get("meterEntityId") or "").strip()
        return {meter_id} if meter_id else set()

    return _energy_primary_entities


def make_energy_bindings_provider(app_config: Any) -> Callable[[], dict[str, str]]:
    """「能源绑定全貌」回调，决定每一档粒度的权威读数来源。

    主表口径（``meterScope``）决定它自己在哪一档能直接读表；``dayMeterEntityId`` /
    ``monthMeterEntityId`` 是对应粒度的佐证表。聚合按「有权威读数用读数，没有才差分」
    合并，既拿到账本级精度，又不会把同一度电算两遍。
    """

    def _energy_bindings() -> dict[str, str]:
        energy = app_config.get("energy") or {}
        return {
            "primary": str(energy.get("meterEntityId") or "").strip(),
            "scope": str(energy.get("meterScope") or "total").strip(),
            "day": str(energy.get("dayMeterEntityId") or "").strip(),
            "month": str(energy.get("monthMeterEntityId") or "").strip(),
        }

    return _energy_bindings


def make_energy_attrs_provider(
    resolve_store: Callable[[], Any],
) -> Callable[[str], dict[str, Any] | None]:
    """能源实体属性解析器，供配置保存时的实体角色校验使用。

    ``resolve_store`` 用回调而不是直接给 state_store：配置服务在状态仓之前构造，
    这里必须延迟到真正校验时再去取。查不到实体（未同步 / 刚删除）时返回 None，
    让校验跳过该字段，避免把「暂时没同步」误判成「填错了」。
    """

    def _resolve(entity_id: str) -> dict[str, Any] | None:
        try:
            state = resolve_store().get(entity_id)
        except Exception as error:  # 状态仓未就绪 / 已关闭：跳过角色校验
            logger.debug("能源实体属性读取失败，跳过角色校验: %s", error)
            return None
        if not state:
            return None
        attrs = state.get("attributes") if isinstance(state, dict) else None
        return attrs if isinstance(attrs, dict) else None

    return _resolve


__all__ = [
    "make_energy_attrs_provider",
    "make_energy_bindings_provider",
    "make_energy_primary_provider",
]
