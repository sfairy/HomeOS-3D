"""配置双写的回归（HS-BC-13）。

``SystemConfig`` 只有一个 ``default`` 行，但有两个写者：

- ``AppConfigService``（设置页，整份内存快照）；
- ``notification/settings.py`` → ``merge_raw_config_section``（只改 ``notification`` 分区）。

修前：改完通知开关，再保存任意其它设置，``notification`` 分区被启动时的旧快照整表覆盖，
而 ``updated_at`` 没被外部写者推进，``expected_updated_at`` 的 CAS 恒通过 —— 保存返回成功，
数据已被静默还原。这里锁四件事：

1. 外部写的分区在一次 ``update()`` 之后仍然在；
2. 外部写会推进 ``updated_at``（否则 CAS 永远发现不了它）；
3. 单分区 ``reset`` 不影响其它分区；
4. 改完的通知设置在 ``get_all()`` 里可见（内存快照被吸收）。
"""

from __future__ import annotations

import json
import sys
import unittest
from datetime import UTC, datetime
from pathlib import Path
from typing import Any, cast

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from src.domains.app_config.defaults import DEFAULT_APP_CONFIG
from src.domains.app_config.service import AppConfigService
from src.platform.core.db.models import SystemConfig
from src.platform.core.runtime.app_config import merge_raw_config_section

_ENGINES: list[object] = []


def _session_factory():
    engine = create_engine("sqlite://")
    SystemConfig.metadata.create_all(engine)
    _ENGINES.append(engine)
    return sessionmaker(bind=engine)


def tearDownModule() -> None:  # pragma: no cover - 资源清理
    for engine in _ENGINES:
        engine.dispose()  # type: ignore[attr-defined]
    _ENGINES.clear()


def _row(session_factory) -> dict:
    with session_factory() as session:
        row = session.get(SystemConfig, "default")
        return json.loads(row.data)


def _service() -> tuple[AppConfigService, Any]:
    factory = _session_factory()
    service = AppConfigService(factory)
    service.start()
    return service, factory


class ExternalWriteSurvivesUpdateTest(unittest.TestCase):
    def test_notification_written_elsewhere_is_not_reverted(self) -> None:
        service, factory = _service()
        merge_raw_config_section(factory, "notification", {"dndStart": "22:00", "dndEnd": "07:00"})

        # 用户随后改了「任意其它设置」——修前这一步会把 notification 整段打回启动快照。
        service.update({"energy": {**DEFAULT_APP_CONFIG["energy"], "currency": "CNY"}})

        stored = _row(factory)
        self.assertEqual(stored["notification"]["dndStart"], "22:00")
        self.assertEqual(stored["notification"]["dndEnd"], "07:00")
        # 内存快照也要吸收外部写入，否则下一次保存又会拿旧值覆盖。
        self.assertEqual(service.get_all()["notification"]["dndStart"], "22:00")

    def test_merge_advances_updated_at(self) -> None:
        service, factory = _service()
        merge_raw_config_section(factory, "notification", {"dndStart": "01:00"})
        with factory() as session:
            row = session.get(SystemConfig, "default")
            assert row is not None
            stored_at = cast(datetime, row.updated_at)
        # 列是无时区 DateTime，SQLite 读回来是 naive；比较前统一口径。
        if stored_at.tzinfo is not None:
            stored_at = stored_at.astimezone(UTC).replace(tzinfo=None)
        before = cast(datetime, service._config_updated_at)  # pyright: ignore[reportPrivateUsage]
        self.assertGreater(stored_at, before.astimezone(UTC).replace(tzinfo=None))

    def test_section_reset_leaves_other_sections_alone(self) -> None:
        service, factory = _service()
        merge_raw_config_section(factory, "notification", {"dndStart": "23:30"})
        service.reset("energy")
        stored = _row(factory)
        self.assertEqual(stored["notification"]["dndStart"], "23:30")

    def test_conflicting_client_version_is_rejected(self) -> None:
        """外部写推进版本号后，拿着旧版本号保存必须 409 而不是静默覆盖。"""
        from src.platform.core.http.errors import BusinessException, ErrorCode

        service, factory = _service()
        expected = cast(datetime, service._config_updated_at).isoformat()  # pyright: ignore[reportPrivateUsage]
        merge_raw_config_section(factory, "notification", {"dndStart": "05:00"})
        with self.assertRaises(BusinessException) as ctx:
            service.update({"energy": {**DEFAULT_APP_CONFIG["energy"], "currency": "USD"}}, expected)
        self.assertEqual(ctx.exception.error_code, ErrorCode.CONFLICT)


class ConfigEventNameTest(unittest.TestCase):
    """HS-BC-14：订阅端必须同时挂权威名与兼容别名。

    修前 7 个模块只订阅 ``SYSTEM_CONFIG_UPDATED``，而真正保存设置的是
    ``app.config.updated`` —— 改 SMTP / 地震开关 / Agent 模型都不会热更新。
    """

    def test_subscribe_covers_both_names(self) -> None:
        from src.domains.security.bus import LocalEventBus
        from src.platform.core.runtime.config_events import (
            CONFIG_UPDATED,
            LEGACY_CONFIG_UPDATED,
            subscribe,
        )

        bus = LocalEventBus()
        hits: list[object] = []
        subscribe(bus, lambda payload=None: hits.append(payload))

        import asyncio

        asyncio.run(bus.dispatch_local(CONFIG_UPDATED, ["channels"]))
        asyncio.run(bus.dispatch_local(LEGACY_CONFIG_UPDATED, ["layout"]))
        self.assertEqual(hits, [["channels"], ["layout"]])

    def test_app_config_publishes_the_canonical_name(self) -> None:
        from src.domains.app_config.service import APP_CONFIG_UPDATED
        from src.platform.core.runtime.config_events import CONFIG_UPDATED

        self.assertEqual(APP_CONFIG_UPDATED, CONFIG_UPDATED)


if __name__ == "__main__":
    unittest.main()
