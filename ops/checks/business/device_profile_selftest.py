#!/usr/bin/env python3
"""设备画像自检（纯标准库 + 项目运行期依赖，不需要 pytest）。

覆盖「容易被后续改动悄悄改坏」的纯逻辑与读写契约：

- 分类规则（媒体 / 空调 / 热水器）与别名归一；
- 「在线」与「可自动选中」是两个概念；
- 确认 / 只改别名 / 撤销确认（保留或清空别名）/ 审计；
- 房间默认设备的落点校验与可用性；
- climate / water_heater 命令的能力与形态校验；
- 快路径：别名房间作用域、有画像但未确认时不再 fail-open、点歌房间限定。

用法：
    node ops/lib/py.mjs ops/checks/device_profile_selftest.py
"""

from __future__ import annotations

import asyncio
import atexit
import shutil
import sys
import tempfile
from pathlib import Path
from types import SimpleNamespace

ROOT = Path(__file__).resolve().parents[3]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

import homeos.backend.src.platform.core.db.device_profile_models as profile_models  # noqa: F401
from homeos.backend.src.domains.agent.runtime.fast_path import FastPathService
from homeos.backend.src.domains.agent.runtime.lang_templates import get_lang_template
from homeos.backend.src.domains.device_profile.classify import (
    AVAILABLE_CONFIDENCE,
    CLIMATE_KINDS,
    CLIMATE_RENDER_TYPE_BY_KIND,
)
from homeos.backend.src.domains.device_profile.climate import validate_climate_command
from homeos.backend.src.domains.device_profile.service import (
    DeviceProfileService,
    classify,
    is_reachable,
    is_usable_profile,
    normalize_aliases,
)
from homeos.backend.src.platform.core.db.database import Base

CHECKS: list[str] = []


def check(name: str, condition: bool, detail: str = "") -> None:
    if not condition:
        raise AssertionError(f"{name} 失败{('：' + detail) if detail else ''}")
    CHECKS.append(name)


class FakeStore:
    """最小状态库：只实现服务用到的 ``get_all`` / ``get``。"""

    def __init__(self, items: list[dict]) -> None:
        self.items = items

    def get_all(self, domain: str | None = None) -> list[dict]:
        if not domain:
            return list(self.items)
        return [item for item in self.items if str(item["entity_id"]).startswith(f"{domain}.")]

    def get(self, entity_id: str) -> dict | None:
        return next((item for item in self.items if item["entity_id"] == entity_id), None)


def session_factory():
    """临时文件库（内存库 + 线程池会各自连到不同的空库，``to_thread`` 里读不到表）。"""
    directory = Path(tempfile.mkdtemp(prefix="homeos-profile-selftest-"))
    atexit.register(shutil.rmtree, directory, True)
    engine = create_engine(
        f"sqlite+pysqlite:///{directory / 'selftest.db'}",
        connect_args={"check_same_thread": False},
    )
    Base.metadata.create_all(engine)
    return sessionmaker(bind=engine)


def entity(entity_id: str, state: str = "on", **attrs) -> dict:
    return {"entity_id": entity_id, "state": state, "attributes": attrs}


def test_classify() -> None:
    apple = classify(entity("media_player.a", source_list=["App Store", "Netflix"]))
    check("分类: App Store → Apple TV", apple["kind"] == "apple_tv" and apple["confidence"] >= 0.9, str(apple))
    tv = classify(entity("media_player.b", device_class="tv"))
    check("分类: device_class=tv → tv", tv["kind"] == "tv", str(tv))
    speaker_hint = classify(entity("media_player.c", friendly_name="客厅音箱"))
    check("分类: 名称含音箱 → speaker", speaker_hint["kind"] == "speaker", str(speaker_hint))
    climate = classify(entity("climate.a", hvac_modes=["off", "cool"]))
    check(
        "分类: 有制冷档 → 推断为分体空调，但仍需确认",
        climate["kind"] == "ac_split"
        and climate["confidence"] < AVAILABLE_CONFIDENCE
        and any("requires_confirmation" in item for item in climate["evidence"]),
        str(climate),
    )
    bath = classify(entity("climate.b", friendly_name="主卫浴霸", hvac_modes=["off", "heat", "vent"]))
    check(
        "分类: 名称/换气档 → 推断为浴霸，但仍需确认",
        bath["kind"] == "bath_heater"
        and bath["confidence"] < AVAILABLE_CONFIDENCE
        and any("requires_confirmation" in item for item in bath["evidence"]),
        str(bath),
    )
    heat_only = classify(entity("climate.c", hvac_modes=["off", "heat"]))
    check(
        "分类: 只有制热档 → 低置信推断为浴霸",
        heat_only["kind"] == "bath_heater" and heat_only["confidence"] < AVAILABLE_CONFIDENCE,
        str(heat_only),
    )
    heater = classify(entity("water_heater.a", operation_list=["off", "eco", "heat"]))
    check(
        "分类: 热水器恒为 unknown 且要求确认",
        heater["kind"] == "unknown" and any("water_heater" in item for item in heater["evidence"]),
        str(heater),
    )
    check("分类: 不支持的域", classify(entity("light.a"))["evidence"] == ["unsupported_domain"])


def test_kind_render_map() -> None:
    """kind → 渲染形态：表必须覆盖全部 kind，且只产出三种 UI 形态。"""
    check(
        "kind 映射覆盖全部 climate kind",
        set(CLIMATE_RENDER_TYPE_BY_KIND) == set(CLIMATE_KINDS),
        f"{sorted(CLIMATE_RENDER_TYPE_BY_KIND)} vs {sorted(CLIMATE_KINDS)}",
    )
    check(
        "kind 映射只产出三种渲染形态",
        set(CLIMATE_RENDER_TYPE_BY_KIND.values()) == {"air-conditioner", "bath-heater", "water-heater"},
        str(sorted(set(CLIMATE_RENDER_TYPE_BY_KIND.values()))),
    )
    check("浴霸 kind 映射到浴霸面板", CLIMATE_RENDER_TYPE_BY_KIND["bath_heater"] == "bath-heater")
    check("热水器 kind 映射到热水器面板", CLIMATE_RENDER_TYPE_BY_KIND["water_heater"] == "water-heater")


def test_aliases() -> None:
    check("别名: 大小写 / 空白去重", normalize_aliases(["Netflix", " netflix ", "B站"]) == ["Netflix", "B站"])
    try:
        normalize_aliases(["x" * 61])
    except ValueError:
        check("别名: 超长拒绝", True)
    else:
        raise AssertionError("别名超长未被拒绝")
    try:
        normalize_aliases([str(index) for index in range(31)])
    except ValueError:
        check("别名: 超量拒绝", True)
    else:
        raise AssertionError("别名超量未被拒绝")


def test_reachability() -> None:
    offline = entity("climate.a", state="unavailable")
    check("在线: unavailable 视为不在线", not is_reachable(offline))
    check("在线: 缺失实体不在线", not is_reachable(None))
    check(
        "可用: 未确认的规则猜测不自动选中",
        not is_usable_profile({"confirmed": False, "confidence": 0.4, "kind": "speaker"}, entity("media_player.a")),
    )
    check(
        "可用: 高置信自动可用",
        is_usable_profile({"confirmed": False, "confidence": 0.96, "kind": "tv"}, entity("media_player.b")),
    )
    check(
        "可用: 已确认离线仍不可用",
        not is_usable_profile({"confirmed": True, "confidence": 1.0, "kind": "tv"}, offline),
    )


def test_service() -> None:
    store = FakeStore(
        [
            entity("media_player.tv", friendly_name="客厅电视", device_class="tv", area_id="living", area_name="客厅"),
            entity(
                "climate.ac", friendly_name="客厅空调", area_id="living", area_name="客厅", min_temp=16, max_temp=30
            ),
            entity("water_heater.wh", friendly_name="热水器", area_id="living", min_temp=35, max_temp=70),
        ]
    )
    service = DeviceProfileService(session_factory(), store)
    check("服务: 首次刷新建出三台", service.refresh()["created"] == 3)
    check("服务: 空调分类未定", service.kind_of("climate.ac") == "unknown")
    check("服务: 确认拒绝 unknown", not service.confirm("climate.ac", "unknown")["success"])
    check("服务: 确认不存在的设备被拒", not service.confirm("climate.ghost", "ac_central")["success"])
    check("服务: 确认空调", service.confirm("climate.ac", "ac_central", ["冷气"], actor="tester")["success"])
    check("服务: kind 落到画像", service.kind_of("climate.ac") == "ac_central")
    check("服务: 只改别名", service.set_aliases("climate.ac", ["冷气", "客厅冷气"], actor="tester")["success"])
    check("服务: 别名匹配同房间", service.match_aliases("把客厅冷气调到 26 度", "climate") == ["climate.ac"])
    check("服务: 别名不跨域", service.match_aliases("客厅冷气", "media_player") == [])
    check("服务: 热水器确认", service.confirm("water_heater.wh", "water_heater")["success"])

    actions = [row["action"] for row in service.audit(limit=10)]
    check("审计: 记录确认与别名", "confirm_with_aliases" in actions and "aliases" in actions, str(actions))

    check("默认设备: 电视落点", service.set_default("living", "tv", entity_id="media_player.tv")["success"])
    check("默认设备: 房间不一致被拒", not service.set_default("bedroom", "tv", entity_id="media_player.tv")["success"])
    check(
        "默认设备: 音箱必须给播放器",
        not service.set_default("living", "speaker", entity_id="media_player.tv")["success"],
    )
    defaults = service.defaults()
    check(
        "默认设备: 带可用性与名称",
        defaults[0]["available"] is True and defaults[0]["name"] == "客厅电视",
        str(defaults),
    )

    cleared = service.clear_confirmation("climate.ac")
    check("撤销: 保留别名", cleared["success"] and cleared["aliases"] == ["冷气", "客厅冷气"], str(cleared))
    check("撤销: 回到未定", service.kind_of("climate.ac") == "unknown")
    service.confirm("climate.ac", "ac_central", ["冷气"])
    dropped = service.clear_confirmation("climate.ac", keep_aliases=False)
    check("撤销: 可显式清空别名", dropped["success"] and not service.match_aliases("冷气", "climate"))

    store.items = [item for item in store.items if item["entity_id"] != "media_player.tv"]
    rows = {row["entityId"]: row for row in service.list()}
    check("消失: 标记不在线", rows["media_player.tv"]["available"] is False)
    check("消失: 保留确认与别名", rows["climate.ac"]["aliases"] == [])
    check("筛选: 按域", [row["entityId"] for row in service.list(domain="water_heater")] == ["water_heater.wh"])
    check("筛选: 按关键字", [row["entityId"] for row in service.list(query="热水")] == ["water_heater.wh"])


def test_climate_guard() -> None:
    attrs = {
        "friendly_name": "客厅空调",
        "min_temp": 16,
        "max_temp": 30,
        "hvac_modes": ["off", "cool", "heat"],
        "fan_modes": ["low", "high"],
    }
    heater = {"friendly_name": "热水器", "min_temp": 35, "max_temp": 70, "operation_list": ["off", "eco", "heat"]}
    check(
        "校验: 温度合法",
        validate_climate_command("climate.a", attrs, "ac_central", "set_temperature", {"temperature": 26}) is None,
    )
    check(
        "校验: 温度越界",
        validate_climate_command("climate.a", attrs, "ac_central", "set_temperature", {"temperature": 10}) is not None,
    )
    check(
        "校验: 模式不支持",
        validate_climate_command("climate.a", attrs, "ac_central", "set_hvac_mode", {"hvac_mode": "dry"}) is not None,
    )
    check(
        "校验: 地暖不接受制冷",
        validate_climate_command("climate.a", attrs, "floor_heating", "set_hvac_mode", {"hvac_mode": "cool"})
        is not None,
    )
    check(
        "校验: 地暖没有风速",
        validate_climate_command("climate.a", attrs, "floor_heating", "set_fan_mode", {"fan_mode": "low"}) is not None,
    )
    check(
        "校验: 空调风速取值",
        validate_climate_command("climate.a", attrs, "ac_split", "set_fan_mode", {"fan_mode": "turbo"}) is not None,
    )
    check(
        "校验: 热水器温度",
        validate_climate_command("water_heater.a", heater, "water_heater", "set_temperature", {"temperature": 50})
        is None,
    )
    check(
        "校验: 热水器模式",
        validate_climate_command(
            "water_heater.a", heater, "water_heater", "set_operation_mode", {"operation_mode": "performance"}
        )
        is not None,
    )
    check(
        "校验: 非温控域放行",
        validate_climate_command("light.a", attrs, "ac_central", "set_temperature", {"temperature": 26}) is None,
    )


def test_fast_path() -> None:
    store = FakeStore(
        [
            entity("climate.cool", friendly_name="客厅空调", area_id="living", min_temp=16, max_temp=30),
            entity("climate.floor", friendly_name="卧室地暖", area_id="bedroom", min_temp=10, max_temp=35),
            entity("media_player.tv", friendly_name="客厅电视", device_class="tv", area_id="living"),
            entity("media_player.spk", friendly_name="客厅音箱", device_class="speaker", area_id="living"),
            entity("climate.unc", friendly_name="书房空调", area_id="study"),
        ]
    )
    service = DeviceProfileService(session_factory(), store)
    service.refresh()
    service.confirm("climate.cool", "ac_central", ["冷气"])
    service.confirm("climate.floor", "floor_heating", ["冷气"])

    areas = [
        SimpleNamespace(
            id="living",
            name="客厅",
            entities=[
                SimpleNamespace(entity_id="climate.cool"),
                SimpleNamespace(entity_id="media_player.tv"),
                SimpleNamespace(entity_id="media_player.spk"),
            ],
        ),
        SimpleNamespace(id="bedroom", name="卧室", entities=[SimpleNamespace(entity_id="climate.floor")]),
    ]

    class Areas:
        async def find_all(self):
            return areas

        async def find_one(self, _ident):
            return None

    class Templates:
        current = get_lang_template("zh")

    fast = FastPathService(Areas(), store, Templates())
    fast.bind_device_profiles(service)

    async def run() -> None:
        hit = await fast._resolve_single_device("客厅冷气", "climate", None)
        check("快路径: 房间内别名命中", hit == "climate.cool", str(hit))
        hit = await fast._resolve_single_device("卧室冷气", "climate", None)
        check("快路径: 别名按房间隔离", hit == "climate.floor", str(hit))
        tv = await fast._resolve_single_device("电视", "media_player", None, ("tv", "apple_tv"))
        check("快路径: 画像 kind 收窄到电视", tv == "media_player.tv", str(tv))
        room_hit = await fast._try_parse_music_request("在客厅点歌 稻香")
        check(
            "快路径: 点歌带房间",
            bool(room_hit) and room_hit["args"].get("area_id") == "living",
            str(room_hit),
        )
        plain = await fast._try_parse_music_request("给我点歌 稻香")
        check("快路径: 点歌不带房间", bool(plain) and "area_id" not in plain["args"], str(plain))
        # 有画像但全未确认：不再退回全部候选
        devices = [{"entityId": "climate.unc", "name": "书房空调"}]
        filtered = await fast._profile_filtered(devices, ("ac_central",))
        check("快路径: 未确认不 fail-open", filtered == [], str(filtered))
        # 完全没有画像：保持原候选
        no_profile = [{"entityId": "climate.raw", "name": "新空调"}]
        filtered = await fast._profile_filtered(no_profile, ("ac_central",))
        check("快路径: 无画像仍可匹配", filtered == no_profile, str(filtered))

    asyncio.run(run())


def main() -> int:
    test_classify()
    test_kind_render_map()
    test_aliases()
    test_reachability()
    test_service()
    test_climate_guard()
    test_fast_path()
    print(f"设备画像自检通过：{len(CHECKS)} 项")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
