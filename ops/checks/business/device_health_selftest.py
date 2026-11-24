#!/usr/bin/env python3
"""设备健康自检：钉住「离线」的统计口径。

背景：旧实现把 ``state in ("unavailable", "unknown")`` 都算离线，于是 ``scene`` /
``button`` / ``select`` 这类逻辑实体（HA 里常态就是 ``unknown``）被算成「离线设备」——
界面上「离线设备 131」下面列的全是场景与按钮。数字与列表都不成立，而**没有任何测试**
能发现它，因为「统计口径写错」不报错、只是安静地给出一个看起来合理的数字。

本自检钉住四件事：

1. ``unknown`` 不算离线（只有 ``unavailable`` 才算）；
2. 逻辑实体域（场景 / 脚本 / 自动化 / 各类 ``input_*``）即使 ``unavailable`` 也不计入；
3. 计数是**全量**而非采样长度，且 ``byDomain`` 与计数自洽（求和相等、按数量降序）；
4. 采样按域轮转：单一域不能占满整个列表，否则列表对该域之外的问题完全无信息。

用法：
    node ops/lib/py.mjs ops/checks/business/device_health_selftest.py
"""

from __future__ import annotations

import sys
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[3]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from homeos.backend.src.domains.system.device_health import (
    NON_DEVICE_DOMAINS,
    OFFLINE_STATES,
    SAMPLE_LIMIT,
    DeviceHealthService,
)

CHECKS: list[str] = []


def check(name: str, condition: bool, detail: str = "") -> None:
    if not condition:
        raise AssertionError(f"{name} 失败：{detail}")
    CHECKS.append(name)


class FakeStateStore:
    """只提供 `get_all()` 的最小状态库假件。"""

    def __init__(self, entities: list[dict[str, Any]]) -> None:
        self._entities = entities

    def get_all(self) -> list[dict[str, Any]]:
        return list(self._entities)


def entity(entity_id: str, state: str, name: str | None = None, device_id: str | None = None) -> dict[str, Any]:
    attributes: dict[str, Any] = {"friendly_name": name or entity_id}
    if device_id is not None:
        attributes["device_id"] = device_id
    return {"entity_id": entity_id, "state": state, "attributes": attributes}


def summary(entities: list[dict[str, Any]]) -> dict[str, Any]:
    return DeviceHealthService(FakeStateStore(entities)).get_summary()


def test_unknown_is_not_offline() -> None:
    """`unknown` 是「还没有状态」，不是「联系不上」。"""
    result = summary(
        [
            entity("light.a", "unknown"),
            entity("scene.mode", "unknown"),
            entity("light.b", "unavailable"),
        ]
    )
    offline = result["offline"]
    check("unknown 不算离线", offline["count"] == 1, f"count={offline['count']}")
    check(
        "只有 unavailable 的实体进入采样",
        [item["entityId"] for item in offline["samples"]] == ["light.b"],
        str(offline["samples"]),
    )
    check("OFFLINE_STATES 只含 unavailable", frozenset({"unavailable"}) == OFFLINE_STATES, str(OFFLINE_STATES))


def test_logic_entities_excluded() -> None:
    """场景 / 脚本 / 自动化 / input_* 没有「在线」概念，即使 unavailable 也不计入。"""
    logic = [
        entity("scene.away", "unavailable"),
        entity("script.reboot", "unavailable"),
        entity("automation.night", "unavailable"),
        entity("input_select.mode", "unavailable"),
        entity("input_boolean.guest", "unavailable"),
        entity("button.refresh", "unavailable"),
        entity("select.source", "unavailable"),
        entity("counter.visits", "unavailable"),
        entity("timer.boil", "unavailable"),
    ]
    for item in logic:
        domain = item["entity_id"].split(".", 1)[0]
        check(f"{domain} 在 NON_DEVICE_DOMAINS 里", domain in NON_DEVICE_DOMAINS, domain)

    result = summary([*logic, entity("switch.plug", "unavailable")])
    offline = result["offline"]
    check("逻辑实体不计入离线数", offline["count"] == 1, f"count={offline['count']}")
    check(
        "逻辑实体不出现在采样里",
        [item["entityId"] for item in offline["samples"]] == ["switch.plug"],
        str(offline["samples"]),
    )


def test_sensors_still_counted() -> None:
    """传感器是设备的观测面：掉线通常意味着设备不可达，必须保留。"""
    result = summary([entity("sensor.temp", "unavailable"), entity("binary_sensor.door", "unavailable")])
    check("传感器计入离线", result["offline"]["count"] == 2, str(result["offline"]))


def test_by_domain_matches_count() -> None:
    """`byDomain` 必须与计数自洽，且按数量降序。"""
    entities = [
        *[entity(f"sensor.s{i}", "unavailable") for i in range(5)],
        *[entity(f"switch.s{i}", "unavailable") for i in range(3)],
        entity("light.l0", "unavailable"),
        # 各种「不该算」的干扰项
        entity("scene.noise", "unavailable"),
        entity("light.unknown_one", "unknown"),
    ]
    offline = summary(entities)["offline"]

    check("计数是全量而非采样长度", offline["count"] == 9, f"count={offline['count']}")
    check("byDomain 求和等于 count", sum(item["count"] for item in offline["byDomain"]) == offline["count"])
    check(
        "byDomain 按数量降序",
        [item["domain"] for item in offline["byDomain"]] == ["sensor", "switch", "light"],
        str(offline["byDomain"]),
    )
    check(
        "byDomain 各域计数正确",
        [(item["domain"], item["count"]) for item in offline["byDomain"]]
        == [("sensor", 5), ("switch", 3), ("light", 1)],
        str(offline["byDomain"]),
    )


def test_samples_round_robin_across_domains() -> None:
    """采样必须跨域轮转：否则几十个传感器会把列表占满。"""
    entities = [entity(f"sensor.s{i:02d}", "unavailable") for i in range(20)]
    entities += [entity("switch.plug", "unavailable"), entity("light.bulb", "unavailable")]

    offline = summary(entities)["offline"]
    sampled_domains = {item["domain"] for item in offline["samples"]}

    check("采样长度不超过上限", len(offline["samples"]) <= SAMPLE_LIMIT, str(len(offline["samples"])))
    check("采样覆盖所有出现的域", sampled_domains == {"sensor", "switch", "light"}, str(sampled_domains))
    check("计数仍为全量", offline["count"] == 22, f"count={offline['count']}")


def test_samples_stable_and_short_list_kept_whole() -> None:
    """同样输入得到同样输出；不足上限时全部列出。"""
    entities = [entity("light.b", "unavailable"), entity("light.a", "unavailable")]
    first = summary(entities)["offline"]["samples"]
    second = summary(list(reversed(entities)))["offline"]["samples"]

    check(
        "采样按 entityId 排序（与输入顺序无关）", [i["entityId"] for i in first] == ["light.a", "light.b"], str(first)
    )
    check("两次调用结果一致", [i["entityId"] for i in first] == [i["entityId"] for i in second])


def test_firmware_updates_use_ha_convention() -> None:
    """固件更新沿用 HA 约定：update 域且 state 为 on/available。"""
    result = summary(
        [
            entity("update.hub", "on"),
            entity("update.cam", "available"),
            entity("update.off", "off"),
            entity("update.unknown", "unknown"),
        ]
    )
    firmware = result["firmwareUpdates"]
    check("只有 on/available 算有可用更新", firmware["count"] == 2, f"count={firmware['count']}")
    check(
        "采样只含有更新的实体",
        [item["entityId"] for item in firmware["samples"]] == ["update.cam", "update.hub"],
        str(firmware["samples"]),
    )


def test_empty_store_and_missing_attributes() -> None:
    """空状态库与缺 `friendly_name` 都不能抛错。"""
    empty = summary([])
    check("空状态库返回零计数", empty["offline"]["count"] == 0 and empty["firmwareUpdates"]["count"] == 0)
    check("空状态库返回空分解", empty["offline"]["byDomain"] == [])
    check("空状态库 totalEntities 为 0", empty["totalEntities"] == 0, str(empty["totalEntities"]))

    no_attributes = DeviceHealthService(FakeStateStore([{"entity_id": "light.x", "state": "unavailable"}]))
    result = no_attributes.get_summary()
    check("缺 attributes 时用 entity_id 兜底", result["offline"]["samples"][0]["name"] == "light.x")


def test_total_entities_is_denominator() -> None:
    """`totalEntities` 是面板 KPI 的分母，必须是**全部实体**而非离线数。

    它同时必须与「跳过无 entity_id 的行」口径一致：否则分母会虚高，
    「9 / 1084」这类比例就失去意义。
    """
    entities = [
        entity("light.a", "on"),
        entity("light.b", "unavailable"),
        entity("sensor.c", "on"),
        entity("scene.d", "unknown"),  # 逻辑实体：不计离线，但属于「全部实体」
        {"state": "on", "attributes": {}},  # 无 entity_id：连分母都不该进
    ]
    result = summary(entities)
    check("totalEntities 统计所有有 entity_id 的实体", result["totalEntities"] == 4, str(result["totalEntities"]))
    check("totalEntities 不等于离线数", result["offline"]["count"] == 1, str(result["offline"]["count"]))


def test_offline_counted_per_device() -> None:
    """离线按**设备**计数：一台设备多个实体全离线只算一次。

    这是面板数字成立的前提。此前按实体算，一台掉线的多传感器设备会贡献
    5~10 条，界面上写着「离线 131」而实际只有十几台设备连不上。
    """
    entities = [
        # 一台设备：开关 + 电量 + 信号，三个实体全 unavailable
        entity("switch.kettle", "unavailable", "电热水壶", device_id="dev-kettle"),
        entity("sensor.kettle_power", "unavailable", "水壶功率", device_id="dev-kettle"),
        entity("sensor.kettle_rssi", "unavailable", "水壶信号", device_id="dev-kettle"),
    ]
    offline = summary(entities)["offline"]
    check("三个实体同属一台设备时只计 1", offline["count"] == 1, f"count={offline['count']}")
    check("采样只出现一条代表实体", len(offline["samples"]) == 1, str(offline["samples"]))
    check(
        "代表实体优先可控域",
        offline["samples"][0]["entityId"] == "switch.kettle",
        str(offline["samples"]),
    )


def test_device_count_across_many_devices() -> None:
    """10 台设备 × 5 实体 = 50 条离线实体，设备数必须是 10。"""
    entities = []
    for device in range(10):
        for index in range(5):
            eid = f"switch.d{device}" if index == 0 else f"sensor.d{device}_{index}"
            entities.append(entity(eid, "unavailable", device_id=f"dev-{device}"))
    offline = summary(entities)["offline"]
    check("设备数按设备聚合", offline["count"] == 10, f"count={offline['count']}")
    check("byDomain 求和等于设备数", sum(item["count"] for item in offline["byDomain"]) == 10)


def test_entities_without_device_id_count_separately() -> None:
    """没有 `device_id` 的实体各自算一台（未进注册表的集成 / 模板实体）。

    把它们并成一台会把互不相关的故障混成一条 —— 排查时找不到源头。
    退化规则必须与前端 `groupOfflineByDevice` 一致，否则角标与诊断页数字对不上。
    """
    entities = [
        entity("sensor.template_a", "unavailable"),
        entity("sensor.template_b", "unavailable"),
        entity("light.no_device", "unavailable", device_id=""),
    ]
    offline = summary(entities)["offline"]
    check("无 device_id 时各自算一台", offline["count"] == 3, f"count={offline['count']}")


def test_logic_entities_do_not_inflate_device_count() -> None:
    """逻辑实体即使共享一个 device_id，也不该把设备数抬起来。"""
    entities = [
        entity("switch.real", "unavailable", device_id="dev-x"),
        entity("button.refresh", "unavailable", device_id="dev-x"),
        entity("scene.mode", "unavailable", device_id="dev-x"),
    ]
    offline = summary(entities)["offline"]
    check("逻辑实体被排除后设备数仍为 1", offline["count"] == 1, f"count={offline['count']}")


def main() -> int:
    test_unknown_is_not_offline()
    test_logic_entities_excluded()
    test_sensors_still_counted()
    test_by_domain_matches_count()
    test_samples_round_robin_across_domains()
    test_samples_stable_and_short_list_kept_whole()
    test_firmware_updates_use_ha_convention()
    test_empty_store_and_missing_attributes()
    test_total_entities_is_denominator()
    test_offline_counted_per_device()
    test_device_count_across_many_devices()
    test_entities_without_device_id_count_separately()
    test_logic_entities_do_not_inflate_device_count()
    print(f"设备健康自检通过：{len(CHECKS)} 项")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
