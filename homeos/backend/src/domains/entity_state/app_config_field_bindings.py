"""app_config 里「单字段绑定」的表格：(section, 字段, 引用 id, 名称, 跳转)。

扫描（:func:`entity_references._scan_app_config_bindings`）与解绑**共用**这张表：
两边的字段名一旦漂移，就会出现「界面提示已解绑、实际没清」。

单独成模块是为了让 ``entity_references.py`` 不再继续长：那个文件已经越过文件规模
棘轮，新增能源绑定只能在拆出配置表之后落地。
"""

from __future__ import annotations

APP_CONFIG_FIELD_BINDINGS: tuple[tuple[str, str, str, str, str], ...] = (
    ("circadian", "weatherEntityId", "circadian-weather", "昼夜节律 · 天气", "/settings?tab=bindings"),
    ("water", "mainValveEntityId", "water-main-valve", "用水 · 总阀", "/settings?tab=bindings"),
    ("energy", "meterEntityId", "energy-meter", "能源 · 主电表", "/settings?tab=bindings"),
    ("energy", "mainPowerEntityId", "energy-main-power", "能源 · 总功率", "/settings?tab=bindings"),
    ("energy", "monthMeterEntityId", "energy-month-meter", "能源 · 月累计电量", "/settings?tab=bindings"),
    ("energy", "dayMeterEntityId", "energy-day-meter", "能源 · 日累计电量", "/settings?tab=bindings"),
    ("voice", "sttEntityId", "voice-stt", "语音 · STT", "/settings?tab=voice"),
)

__all__ = ["APP_CONFIG_FIELD_BINDINGS"]
