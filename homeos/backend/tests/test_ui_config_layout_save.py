"""UI 布局保存的密钥 / 空布局 / 乐观锁回归。

覆盖四处容易悄悄写坏数据的保存路径：
1. 脱敏占位符回传时必须保留库中真实密钥；
2. 库里没有真值时占位符绝不能落库（否则消费方会把它当成有效密钥）；
3. 请求缺少 ``layout`` 时不能把整份方案清空；
4. ``expectedUpdatedAt`` 过期时必须 409，而不是静默覆盖别的终端刚写的整份快照。

运行：node ops/lib/py.mjs -m unittest discover -s homeos/backend/tests -t homeos/backend -v
"""

from __future__ import annotations

import asyncio
import sys
import unittest
from pathlib import Path
from unittest.mock import patch

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from src.domains.app_config.constants import CONFIG_MASK_PLACEHOLDER
from src.domains.ui_config.layout_secrets import merge_layout_secrets_on_save
from src.domains.ui_config.service import UiConfigService, _iso
from src.platform.core.errors import BusinessException, ErrorCode

MASK = CONFIG_MASK_PLACEHOLDER


class LayoutSecretMergeTest(unittest.TestCase):
    def test_mask_keeps_stored_secrets(self) -> None:
        merged = merge_layout_secrets_on_save(
            {
                "agentConfig": {"apiKey": MASK, "apiKeyConfigured": True},
                "channelConfig": {
                    "email": {"smtpPassword": MASK},
                    "webpush": {"vapidPrivateKey": MASK},
                    "wecom": {"corpSecret": MASK},
                },
            },
            {
                "agentConfig": {"apiKey": "sk-real"},
                "channelConfig": {
                    "email": {"smtpPassword": "mail-pw"},
                    "webpush": {"vapidPrivateKey": "vapid"},
                    "wecom": {"corpSecret": "wecom-secret"},
                },
            },
        )
        self.assertEqual(merged["agentConfig"]["apiKey"], "sk-real")
        # 展示态字段不入库
        self.assertNotIn("apiKeyConfigured", merged["agentConfig"])
        self.assertEqual(merged["channelConfig"]["email"]["smtpPassword"], "mail-pw")
        self.assertEqual(merged["channelConfig"]["webpush"]["vapidPrivateKey"], "vapid")
        self.assertEqual(merged["channelConfig"]["wecom"]["corpSecret"], "wecom-secret")

    def test_mask_without_stored_value_is_not_persisted(self) -> None:
        merged = merge_layout_secrets_on_save(
            {
                "agentConfig": {"apiKey": MASK, "mcpGatewaySecret": MASK},
                "channelConfig": {
                    "email": {"smtpPassword": MASK},
                    "webpush": {"vapidPrivateKey": MASK},
                    "wecom": {"corpSecret": MASK},
                },
            },
            None,
        )
        self.assertEqual(merged["agentConfig"]["apiKey"], "")
        self.assertEqual(merged["agentConfig"]["mcpGatewaySecret"], "")
        self.assertEqual(merged["channelConfig"]["email"]["smtpPassword"], "")
        self.assertEqual(merged["channelConfig"]["webpush"]["vapidPrivateKey"], "")
        self.assertEqual(merged["channelConfig"]["wecom"]["corpSecret"], "")

    def test_new_plaintext_wins_over_stored_value(self) -> None:
        merged = merge_layout_secrets_on_save(
            {"agentConfig": {"apiKey": "sk-new"}},
            {"agentConfig": {"apiKey": "sk-old"}},
        )
        self.assertEqual(merged["agentConfig"]["apiKey"], "sk-new")


class _FakeAppConfig:
    def get(self, section: str) -> object:  # pragma: no cover - 仅满足构造签名
        return {}


class _DummySession:
    def __enter__(self) -> _DummySession:
        return self

    def __exit__(self, *_args: object) -> bool:
        return False


class SaveConfigBodyTest(unittest.TestCase):
    def _service(self) -> UiConfigService:
        service = UiConfigService(session_factory=_DummySession, app_config=_FakeAppConfig())
        # 纯单元测试：不碰数据库，方案一律视为不存在
        patcher = patch.object(service, "_find", return_value=None)
        patcher.start()
        self.addCleanup(patcher.stop)
        return service

    def test_missing_layout_is_rejected(self) -> None:
        service = self._service()
        for body in ({}, {"layout": None}, {"layout": ""}):
            with self.assertRaises(BusinessException, msg=str(body)):
                asyncio.run(service.save_config_from_body("default", body))

    def test_empty_object_layout_is_still_allowed(self) -> None:
        """显式 ``{}`` 是「清空」意图，必须放行（守卫只拦缺失 / null / 空串）。

        这里不落库，只验证守卫不误伤：``save_config`` 被替换成记录调用。
        """
        service = self._service()
        saved: list[object] = []

        def fake_save(project_id: str, layout: object) -> dict[str, object]:
            saved.append(layout)
            return {"projectId": project_id, "layout": layout}

        with patch.object(service, "save_config", side_effect=fake_save):
            result = asyncio.run(service.save_config_from_body("default", {"layout": {}}))
        self.assertEqual(saved, [{}])
        self.assertTrue(result["success"])


class _FakeConfig:
    """足够让 ``_find`` 返回的 ProjectConfig 替身（只用到 layout / 时间戳）。"""

    def __init__(self, layout: dict[str, object], updated_at, project_id: str = "default") -> None:
        import json as _json

        self.id = 1
        self.project_id = project_id
        self.layout = _json.dumps(layout, ensure_ascii=False)
        self.created_at = updated_at
        self.updated_at = updated_at


class LayoutOptimisticLockTest(unittest.TestCase):
    """布局保存的乐观锁：过期版本必须 409，而不是静默覆盖别的终端刚写的整份快照。"""

    @staticmethod
    def _service_with(updated_at):
        service = UiConfigService(session_factory=_DummySession, app_config=_FakeAppConfig())
        patcher = patch.object(
            service, "_find", return_value=_FakeConfig({"a": 1}, updated_at)
        )
        patcher.start()
        return service, patcher

    def _run_save(self, service, body):
        saved: list[object] = []

        def fake_save(project_id: str, layout: object) -> dict[str, object]:
            saved.append(layout)
            return {"projectId": project_id, "layout": layout, "updatedAt": None}

        with patch.object(service, "save_config", side_effect=fake_save):
            result = asyncio.run(service.save_config_from_body("default", body))
        return saved, result

    def test_stale_expected_updated_at_is_rejected(self) -> None:
        from datetime import UTC, datetime, timedelta

        stored = datetime(2026, 1, 1, 12, 0, 0, tzinfo=UTC)
        service, patcher = self._service_with(stored)
        self.addCleanup(patcher.stop)
        with self.assertRaises(BusinessException) as ctx:
            self._run_save(
                service,
                {
                    "layout": {"a": 2},
                    "expectedUpdatedAt": _iso(stored + timedelta(seconds=1)),
                },
            )
        self.assertEqual(ctx.exception.status_code, 409)
        self.assertEqual(ctx.exception.error_code, ErrorCode.CONFLICT)

    def test_matching_expected_updated_at_is_accepted(self) -> None:
        from datetime import UTC, datetime

        # 库里带微秒、对外契约只到毫秒：客户端回传截断值不能被误判成冲突
        stored = datetime(2026, 1, 1, 12, 0, 0, 123456, tzinfo=UTC)
        service, patcher = self._service_with(stored)
        self.addCleanup(patcher.stop)
        saved, result = self._run_save(
            service, {"layout": {"a": 2}, "expectedUpdatedAt": _iso(stored)}
        )
        self.assertEqual(saved, [{"a": 2}])
        self.assertTrue(result["success"])

    def test_missing_expected_updated_at_keeps_backward_compat(self) -> None:
        from datetime import UTC, datetime

        service, patcher = self._service_with(datetime(2026, 1, 1, tzinfo=UTC))
        self.addCleanup(patcher.stop)
        saved, result = self._run_save(service, {"layout": {"a": 3}})
        self.assertEqual(saved, [{"a": 3}])
        self.assertTrue(result["success"])


if __name__ == "__main__":
    unittest.main()
