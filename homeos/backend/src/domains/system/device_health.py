"""设备健康概览服务（对齐 ``modules/system/device/health.service.ts``）。

## 统计口径（2026-11 修正）

旧实现把 ``state in ("unavailable", "unknown")`` 都算离线，于是 ``scene`` / ``button`` /
``select`` 这类**逻辑实体**（HA 里常态就是 ``unknown``）被算成「离线设备」，界面上
「离线设备 131」下面列的全是场景与按钮 —— 数字和列表都不成立。

现在的口径：

1. **离线只认 ``unavailable``**。这是 HA 表达「集成联系不上实体」的唯一信号；
   ``unknown`` 是「还没有状态」，对 scene / button / select 是常态，对刚重启的设备也是常态，
   把它当离线会让数字长期虚高。
2. **排除逻辑实体**（``NON_DEVICE_DOMAINS``）：场景、脚本、自动化、各类 ``input_*`` 辅助实体、
   计数器 / 计时器 / 通知 / 标签 / 人 / 太阳 / 天气。它们没有「在不在线」这回事。
3. **按域给分解**（``by_domain``）：一个总数无法判断「是某个集成整体挂了，还是零星几台」。
   分解让「传感器 88 · 开关 21 · 灯 12」一眼可读，也让「某域全部掉线」这种信号不被平均掉。
4. **采样按域轮转**（``SAMPLE_PER_DOMAIN``）：先每个域各取 1 条，不够再从已出现过的域补，
   避免列表被单一域（如几十个传感器）占满 —— 那恰好是最没信息量的展示。

固件更新沿用 HA 约定：``domain == "update"`` 且 ``state in {on, available}``。
"""

from __future__ import annotations

from collections import Counter
from datetime import UTC, datetime
from typing import Any

from ...platform.core.db.json_field import object_field
from ...platform.core.entity.controllable import CONTROLLABLE_DOMAINS
from ...platform.core.entity.entity_domain import get_entity_domain

#: 每类采样上限，避免响应体过大
SAMPLE_LIMIT = 8

#: 每个域在采样里至少占 1 条（轮转的第一轮），剩余名额再按出现顺序补。
SAMPLE_PER_DOMAIN = 1

#: 唯一算「离线」的状态。``unknown`` 不算：它是「还没有状态」，不是「联系不上」。
OFFLINE_STATES: frozenset[str] = frozenset({"unavailable"})


def _device_key(entity_id: str, attributes: dict[str, Any]) -> str:
    """离线聚合键：优先设备归属，没有则退化为实体本身。

    为什么要按设备：一台掉线的多传感器设备会贡献 5~10 条 ``unavailable`` 实体
    （电量、信号、各测量项），按实体计数会让「离线 131」实际只有十几台设备连不上 ——
    与用户「几台设备没连上」的直觉差一个数量级。

    退化规则与前端 ``groupOfflineByDevice`` 完全一致（两边必须同口径，否则首页角标与
    诊断页数字对不上）：没有 ``device_id`` 的实体（未进注册表的集成 / 模板实体）
    **各自算一台**，用实体 ID 作键。
    """
    device_id = str(attributes.get("device_id") or "").strip()
    return device_id or entity_id


#: 逻辑实体：没有「在线 / 离线」语义，不参与设备健康统计。
#:
#: 判据是「这个东西有没有物理对应或网络连接」。``sensor`` / ``binary_sensor`` **保留**：
#: 它们是设备的观测面，掉线通常意味着设备本身不可达，属于本面板要回答的问题。
NON_DEVICE_DOMAINS: frozenset[str] = frozenset(
    {
        "scene",
        "script",
        "automation",
        "button",
        "input_button",
        "input_boolean",
        "input_number",
        "input_select",
        "input_text",
        "select",
        "number",
        "text",
        "counter",
        "timer",
        "schedule",
        "zone",
        "person",
        "sun",
        "weather",
        "calendar",
        "todo",
        "image",
        "conversation",
        "tts",
        "stt",
        "template",
        "datetime",
        "date",
        "time",
        "event",
        "tag",
        "persistent_notification",
        "homeassistant",
        "group",
    }
)


def _iso_now() -> str:
    now = datetime.now(UTC)
    return now.strftime("%Y-%m-%dT%H:%M:%S.") + f"{now.microsecond // 1000:03d}Z"


def _round_robin_samples(candidates: list[dict[str, str]], limit: int) -> list[dict[str, str]]:
    """按域轮转取样：先每个域各取 ``SAMPLE_PER_DOMAIN`` 条，剩余名额再依次补。

    ``candidates`` 已按实体 id 排序（调用方保证），因此同样输入得到同样输出 ——
    面板刷新时列表不会无故重排。
    """
    if len(candidates) <= limit:
        return candidates

    buckets: dict[str, list[dict[str, str]]] = {}
    for item in candidates:
        buckets.setdefault(item.get("domain", ""), []).append(item)

    picked: list[dict[str, str]] = []
    depth = 0
    # 第一轮每个域取 SAMPLE_PER_DOMAIN 条，之后逐轮加深，直到取满或取尽。
    while len(picked) < limit:
        added = False
        for bucket in buckets.values():
            start = depth * SAMPLE_PER_DOMAIN
            window = bucket[start : start + SAMPLE_PER_DOMAIN]
            for item in window:
                if len(picked) >= limit:
                    break
                picked.append(item)
                added = True
            if len(picked) >= limit:
                break
        if not added:
            break
        depth += 1
    return picked


class DeviceHealthService:
    """通过组合状态存储，向前端返回统一的设备健康摘要。"""

    def __init__(self, state_store: Any) -> None:
        self._state_store = state_store

    def get_summary(self) -> dict[str, Any]:
        """生成设备健康摘要。

        遍历状态库全部实体，按模块文档里的口径统计离线实体与可用固件更新；
        离线部分额外给出按域分解与按域轮转的采样。
        """
        entities = self._state_store.get_all() if self._state_store is not None else []

        #: 设备键 → 该设备下离线的实体候选。按设备聚合，一台设备只计一次。
        offline_by_device: dict[str, list[dict[str, str]]] = {}
        offline_by_domain: Counter[str] = Counter()
        update_candidates: list[dict[str, str]] = []
        #: 参与统计的实体总数：面板用它做分母（「9 台离线 / 1084 个实体」比光一个 9 有用得多）。
        #: 只数有 entity_id 的，与下面两个分支的判定口径一致。
        total_entities = 0

        for entity in entities:
            entity_id = str(entity.get("entity_id") or "")
            if not entity_id:
                continue
            total_entities += 1
            domain = get_entity_domain(entity_id)
            attributes = object_field(entity, "attributes")
            # friendly_name 为 HA 属性 key，缺失时回退到 entity_id
            name = str(attributes.get("friendly_name") or entity_id)
            state = entity.get("state")

            if str(state or "").lower() in OFFLINE_STATES and domain not in NON_DEVICE_DOMAINS:
                offline_by_device.setdefault(_device_key(entity_id, attributes), []).append(
                    {"entityId": entity_id, "name": name, "domain": domain}
                )

            # 固件更新判定：update 域且 state 为 on/available 表示有可用更新
            if domain == "update" and str(state or "").lower() in ("on", "available"):
                update_candidates.append({"entityId": entity_id, "name": name, "domain": domain, "state": str(state)})

        # 代表实体：优先可控域（点开就是能操作的那个），否则字典序最小 —— 与前端同一规则。
        offline_candidates: list[dict[str, str]] = []
        for members in offline_by_device.values():
            members.sort(key=lambda item: item["entityId"])
            representative = next(
                (member for member in members if get_entity_domain(member["entityId"]) in CONTROLLABLE_DOMAINS),
                members[0],
            )
            offline_candidates.append(representative)
            # 域分解按**设备**计：一台设备只给它的代表实体所在的域记一次，
            # 否则「传感器 88」会把同一台设备的电量与信号各算一遍。
            offline_by_domain[representative["domain"]] += 1

        offline_candidates.sort(key=lambda item: item["entityId"])
        update_candidates.sort(key=lambda item: item["entityId"])

        return {
            "offline": {
                # 设备数，不是实体数：与首页「离线」角标同口径
                "count": len(offline_by_device),
                "samples": _round_robin_samples(offline_candidates, SAMPLE_LIMIT),
                # 按数量降序；同数量按域名排序，保证输出稳定
                "byDomain": [
                    {"domain": domain, "count": count}
                    for domain, count in sorted(offline_by_domain.items(), key=lambda item: (-item[1], item[0]))
                ],
            },
            "firmwareUpdates": {
                "count": len(update_candidates),
                "samples": update_candidates[:SAMPLE_LIMIT],
            },
            "totalEntities": total_entities,
            "generatedAt": _iso_now(),
        }


__all__ = [
    "NON_DEVICE_DOMAINS",
    "OFFLINE_STATES",
    "SAMPLE_LIMIT",
    "SAMPLE_PER_DOMAIN",
    "DeviceHealthService",
]
