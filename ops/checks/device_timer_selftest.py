#!/usr/bin/env python3
"""设备倒计时自检：校验、覆盖语义、落库续算与失败不静默。

最关键的两条：
- **同一实体同一服务只保留一条**（再点「30 分钟」是覆盖，不是叠加）；
- **进程重启续算**：停机期间到期的计时器在启动时立即补发一次，而不是静默消失
  —— 「设了 30 分钟关灯」在重启后失效，灯会亮一整夜。
"""

from __future__ import annotations

import asyncio
import tempfile
from datetime import UTC, datetime, timedelta
from pathlib import Path

from _selftest_support import CHECKS, check, ensure_repo_on_path, report

ensure_repo_on_path()

from sqlalchemy import create_engine, select
from sqlalchemy.orm import sessionmaker

from homeos.backend.src.domains.device_timer.service import (
    DeviceTimerService,
    validate_timer_request,
)
from homeos.backend.src.platform.core.db import models  # noqa: F401
from homeos.backend.src.platform.core.db.database import Base
from homeos.backend.src.platform.core.db.models import DeviceTimer


class FakeDatabase:
    def __init__(self, session_factory) -> None:
        self.session_factory = session_factory


class FakeProxy:
    def __init__(self, fail: bool = False) -> None:
        self.calls: list[dict] = []
        self.fail = fail

    async def call_service(self, dto, *, policy="http"):
        if self.fail:
            raise RuntimeError("HA 不可用")
        self.calls.append(dto)
        return {"success": True}


class FakeNotification:
    def __init__(self) -> None:
        self.messages: list[tuple] = []

    async def notify(self, level, message, source, entity_id=None, opts=None):
        self.messages.append((level, message, source, entity_id))
        return {"id": "n1"}


def build_db(tmp: Path):
    engine = create_engine(f"sqlite:///{tmp / 'timer.db'}", future=True)
    Base.metadata.create_all(engine)
    return FakeDatabase(sessionmaker(bind=engine, expire_on_commit=False))


def test_validation() -> None:
    check("允许 light.turn_off", validate_timer_request("light.a", "turn_off", 60)[2] == 60)
    check("允许 light.turn_on（延后开启）", validate_timer_request("light.a", "turn_on", 60)[1] == "turn_on")
    check("允许 cover.close_cover", validate_timer_request("cover.c", "close_cover", 60)[1] == "close_cover")
    check("允许 cover.open_cover", validate_timer_request("cover.c", "open_cover", 60)[1] == "open_cover")
    for entity, service, seconds, label in (
        ("sensor.t", "turn_off", 60, "不支持 sensor 域"),
        ("lock.front", "unlock", 60, "锁类动作不进定时（一次性副作用必须人工确认）"),
        ("light.a", "toggle", 60, "toggle 不幂等，不能定时"),
        ("light.a", "turn_off", 0, "秒数须大于 0"),
        ("no_dot", "turn_off", 60, "entity_id 非法"),
    ):
        try:
            validate_timer_request(entity, service, seconds)
        except ValueError:
            CHECKS.append(label)
        else:
            raise AssertionError(f"{label} 失败：未抛错")
    check("超过 24 小时被夹到上限", validate_timer_request("light.a", "turn_off", 999999)[2] == 24 * 3600)


def test_one_timer_per_entity() -> None:
    """同一实体只保留一条定时：从「关闭」改成「开启」会顶掉旧的。

    ``1h 后关 + 8h 后开`` 在设备上表现为「关掉又被打开」，用户真正要的是「切到某个状态」。
    """

    async def scenario():
        with tempfile.TemporaryDirectory() as raw:
            db = build_db(Path(raw))
            service = DeviceTimerService(database=db, command_proxy=FakeProxy())
            await service.set_timer(entity_id="light.a", service="turn_off", seconds=600)
            await service.set_timer(entity_id="light.a", service="turn_on", seconds=900)
            items = await service.list_timers()
            check("同一实体只剩一条定时", len(items) == 1, str(items))
            check("保留的是最新设定的服务", items[0]["service"] == "turn_on", str(items))
            await service.stop()

    asyncio.run(scenario())


def test_set_and_overwrite() -> None:
    async def scenario():
        with tempfile.TemporaryDirectory() as raw:
            db = build_db(Path(raw))
            proxy = FakeProxy()
            service = DeviceTimerService(database=db, command_proxy=proxy)
            first = await service.set_timer(entity_id="light.a", seconds=60)
            second = await service.set_timer(entity_id="light.a", seconds=120)
            check(
                "同一实体同一服务返回同一条记录（覆盖）",
                first["id"] == second["id"],
                f"{first['id']} vs {second['id']}",
            )
            with db.session_factory() as session:
                rows = session.scalars(select(DeviceTimer)).all()
                check("库里只有一条", len(rows) == 1, str(len(rows)))
                check(
                    "到期时间被更新为 120 秒",
                    rows[0].fire_at > datetime.now(UTC).replace(tzinfo=None) + timedelta(seconds=60),
                )
            await service.stop()

    asyncio.run(scenario())


def test_cancel() -> None:
    async def scenario():
        with tempfile.TemporaryDirectory() as raw:
            db = build_db(Path(raw))
            service = DeviceTimerService(database=db, command_proxy=FakeProxy())
            await service.set_timer(entity_id="light.a", seconds=600)
            check("能列出进行中的倒计时", len(await service.list_timers()) == 1)
            check("取消成功", await service.cancel("light.a") is True)
            check("取消后列表为空", await service.list_timers() == [])
            check("重复取消返回 False", await service.cancel("light.a") is False)
            await service.stop()

    asyncio.run(scenario())


def test_overdue_replay_on_start() -> None:
    """停机期间到期的计时器：启动时立即补发一次（不能静默丢）。"""

    async def scenario():
        with tempfile.TemporaryDirectory() as raw:
            db = build_db(Path(raw))
            with db.session_factory() as session:
                session.add(
                    DeviceTimer(
                        entity_id="light.a",
                        domain="light",
                        service="turn_off",
                        service_data="{}",
                        fire_at=datetime.now(UTC).replace(tzinfo=None) - timedelta(minutes=5),
                    )
                )
                session.commit()
            proxy = FakeProxy()
            service = DeviceTimerService(database=db, command_proxy=proxy)
            await service.start()
            check("过期计时器启动时补发", len(proxy.calls) == 1, str(proxy.calls))
            check("补发的是关灯", proxy.calls[0]["service"] == "turn_off", str(proxy.calls))
            with db.session_factory() as session:
                check("补发后记录被清掉", session.scalars(select(DeviceTimer)).all() == [])
            await service.stop()

    asyncio.run(scenario())


def test_fire_failure_notifies() -> None:
    """执行失败要通知用户：静默失败会让用户以为灯已经关了。"""

    async def scenario():
        with tempfile.TemporaryDirectory() as raw:
            db = build_db(Path(raw))
            notification = FakeNotification()
            service = DeviceTimerService(
                database=db,
                command_proxy=FakeProxy(fail=True),
                notification=notification,
            )
            await service.set_timer(entity_id="light.a", seconds=1)
            await asyncio.sleep(1.2)
            check("执行失败会发通知", len(notification.messages) == 1, str(notification.messages))
            check("通知来源是 device-timer", notification.messages[0][2] == "device-timer", str(notification.messages))
            await service.stop()

    asyncio.run(scenario())


def main() -> int:
    test_validation()
    test_one_timer_per_entity()
    test_set_and_overwrite()
    test_cancel()
    test_overdue_replay_on_start()
    test_fire_failure_notifies()
    report("设备倒计时")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
