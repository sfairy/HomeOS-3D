"""终端电量上报的韧性回归：坏配置 / 内部异常都不能把 10s 一次的遥测通道打成 500。

两条历史故障路径：

1. ``clientPower`` 分区的数值字段是用户可编辑的（设置页表单、导入的配置备份、手改
   的库）。以前 ``int(raw["reportIntervalSec"])`` 这类直接转换遇到 ``"10s"`` 就抛
   ``ValueError`` —— 上报接口与状态面板一起 500。
2. 上报后的广播 / 联动属于副作用，出问题时状态其实已经记下了，接口不该跟着 500。

运行：node ops/lib/py.mjs -m unittest discover -s homeos/backend/tests -t homeos/backend -v
"""

from __future__ import annotations

import asyncio
import sys
import unittest
from pathlib import Path
from typing import Any

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from fastapi import FastAPI
from src.api.client_power import router
from src.domains.client_power.service import ClientPowerService
from src.platform.security.auth_context import require_user
from starlette.testclient import TestClient

CLIENT_ID = "client-1"
REPORT_TOKEN = "token-1"


class _AppConfig:
    """只实现 client_power 用到的两个入口；配置内容由用例注入。"""

    def __init__(self, client_power: Any) -> None:
        self._client_power = client_power

    def get(self, key: str, default: Any = None) -> Any:
        if key == "clientPower":
            return self._client_power
        return default

    def get_home_timezone(self) -> str:
        return "Asia/Shanghai"


class _Bus:
    def on(self, *_args: Any, **_kwargs: Any) -> None:
        return None

    async def emit(self, _name: str, _payload: dict[str, Any]) -> None:
        return None


class _Cooldown:
    def is_in_cooldown(self, *_args: Any, **_kwargs: Any) -> bool:
        return False

    def set_cooldown(self, *_args: Any, **_kwargs: Any) -> None:
        return None


class _Ha:
    async def call_service(self, *_args: Any, **_kwargs: Any) -> None:
        return None


def _session_factory() -> Any:
    raise AssertionError("上报路径不该碰数据库")


def _service(client_power: Any) -> ClientPowerService:
    return ClientPowerService(_AppConfig(client_power), _session_factory, _Ha(), _Bus(), _Cooldown(), None)


def _payload(level: Any = 10) -> dict[str, Any]:
    return {
        "clientId": CLIENT_ID,
        "reportToken": REPORT_TOKEN,
        "systemInfo": {
            "battery": {"supported": True, "level": level, "charging": False},
        },
    }


class BadConfigTest(unittest.TestCase):
    def test_garbage_numbers_fall_back_to_defaults(self) -> None:
        service = _service(
            {
                "reportIntervalSec": "10s",
                "staleTimeoutSec": "abc",
                "cooldownMin": "5m",
                "linkageRetryCount": "x",
                "linkageRetryDelayMs": float("nan"),
            }
        )
        # 每项只告警一次，日志本身就是「配置坏在哪」的唯一线索，顺手断言它存在。
        with self.assertLogs("homeos.client_power", level="WARNING") as logs:
            cfg = service.cfg()
        self.assertEqual(cfg.report_interval_sec, 10)
        self.assertEqual(cfg.stale_timeout_sec, 300)
        self.assertEqual(cfg.cooldown_min, 5.0)
        self.assertEqual(cfg.linkage_retry_count, 0)
        self.assertEqual(cfg.linkage_retry_delay_ms, 0)
        self.assertTrue(any("reportIntervalSec" in line for line in logs.output))

    def test_valid_numbers_still_honoured(self) -> None:
        cfg = _service({"reportIntervalSec": "15", "staleTimeoutSec": 60, "cooldownMin": 2.5}).cfg()
        self.assertEqual(cfg.report_interval_sec, 15)
        self.assertEqual(cfg.stale_timeout_sec, 60)
        self.assertEqual(cfg.cooldown_min, 2.5)

    def test_non_dict_section_is_tolerated(self) -> None:
        self.assertEqual(_service("not-a-section").cfg().report_interval_sec, 10)
        self.assertFalse(_service(None).cfg().enabled)

    def test_report_survives_bad_thresholds(self) -> None:
        service = _service(
            {
                "enabled": True,
                "clients": [
                    {
                        "id": CLIENT_ID,
                        "enabled": True,
                        "reportToken": REPORT_TOKEN,
                        "label": "测试终端",
                        "selfCharge": {"enabled": True, "lowPercent": "abc", "highPercent": None},
                    }
                ],
            }
        )
        with self.assertLogs("homeos.client_power", level="WARNING"):
            result = asyncio.run(service.report(_payload()))
        self.assertTrue(result["accepted"])
        self.assertTrue(result["configured"])

    def test_status_snapshot_survives_bad_config(self) -> None:
        snapshot = _service({"reportIntervalSec": "10s", "clients": "nope"}).get_status_snapshot()
        self.assertEqual(snapshot["clients"], [])
        self.assertEqual(snapshot["configuredClients"], [])


class _ExplodingService:
    async def report(self, _dto: dict[str, Any]) -> dict[str, Any]:
        raise RuntimeError("boom")

    def get_status_snapshot(self) -> dict[str, Any]:
        return {}


class ReportRouteFailSoftTest(unittest.TestCase):
    def _client(self, service: Any) -> TestClient:
        app = FastAPI()
        app.include_router(router, prefix="/api/v1")
        app.state.client_power = service
        app.dependency_overrides[require_user] = lambda: {"userId": "u1"}
        return TestClient(app, raise_server_exceptions=False)

    def test_internal_failure_is_not_500(self) -> None:
        # 异常本身仍要以 ERROR + 堆栈留在日志里，所以用 assertLogs 一并收走。
        with self._client(_ExplodingService()) as client, self.assertLogs("homeos.client_power", level="ERROR"):
            response = client.post(
                "/api/v1/system/client-power/report",
                json={"clientId": CLIENT_ID, "systemInfo": {"battery": {"level": 50}}},
            )
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.json(), {"accepted": False, "configured": False})


if __name__ == "__main__":
    unittest.main()
