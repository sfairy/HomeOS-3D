"""UI 布局保存的密钥 / 空布局 / 乐观锁回归。

覆盖五处容易悄悄写坏数据的保存路径：
1. 脱敏占位符回传时必须保留库中真实密钥；
2. 局部 payload（只带 pages 之类）不能把没提到的密钥段整段删掉；
3. 请求缺少 ``layout`` 时不能把整份方案清空；
4. ``expectedUpdatedAt`` 过期时必须 409，而不是静默覆盖别的终端刚写的整份快照；
5. 版本校验必须与写入原子：读完之后、写之前别人提交的改动不能被覆盖（TOCTOU）。

运行：node ops/lib/py.mjs -m unittest discover -s homeos/backend/tests -t homeos/backend -v
"""

from __future__ import annotations

import asyncio
import json
import sys
import unittest
from datetime import UTC, datetime, timedelta
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from src.domains.app_config.constants import CONFIG_MASK_PLACEHOLDER
from src.domains.ui_config import service as ui_service
from src.domains.ui_config.layout_secrets import merge_layout_secrets_on_save
from src.domains.ui_config.service import UiConfigService, _iso
from src.platform.core.db.models import ProjectConfig
from src.platform.core.http.errors import BusinessException, ErrorCode

MASK = CONFIG_MASK_PLACEHOLDER


class _FakeAppConfig:
    """只满足 ``_profiles()`` 需要的最小 app_config 替身。"""

    def __init__(self, profiles: dict[str, object] | None = None) -> None:
        self._profiles = profiles or {}

    def get(self, section: str) -> object:
        # ``UiConfigService._profiles()`` 读的就是 ``get("profiles")`` 的返回值本身
        return self._profiles if section == "profiles" else {}


_ENGINES: list[object] = []


def _session_factory():
    """建一个只含 ``project_configs`` 表的进程内 SQLite（每个用例独立）。"""
    engine = create_engine("sqlite://")
    ProjectConfig.__table__.create(engine)
    _ENGINES.append(engine)
    return sessionmaker(bind=engine)


def tearDownModule() -> None:
    for engine in _ENGINES:
        engine.dispose()  # type: ignore[attr-defined]
    _ENGINES.clear()


def _service(profiles: dict[str, object] | None = None) -> UiConfigService:
    return UiConfigService(
        session_factory=_session_factory(),
        app_config=_FakeAppConfig(profiles),
    )


def _seed(service: UiConfigService, project_id: str, layout: dict, updated_at: datetime) -> None:
    with service._session_factory() as session:
        session.add(
            ProjectConfig(
                project_id=project_id,
                layout=json.dumps(layout, ensure_ascii=False),
                created_at=updated_at,
                updated_at=updated_at,
            )
        )
        session.commit()


def _stored(service: UiConfigService, project_id: str = "default") -> dict:
    with service._session_factory() as session:
        row = session.query(ProjectConfig).filter_by(project_id=project_id).one()
        return json.loads(row.layout)


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

    def test_partial_payload_keeps_unmentioned_secret_sections(self) -> None:
        """局部 payload 不得把没提到的密钥段整段删掉（保存是整份覆盖）。"""
        merged = merge_layout_secrets_on_save(
            {"pages": {"b": 2}},
            {
                "agentConfig": {"apiKey": "sk-real", "mcpGatewaySecret": "gw"},
                "channelConfig": {
                    "email": {"smtpPassword": "mail-pw", "to": "ops@example.com"},
                    "webpush": {"vapidPrivateKey": "vapid"},
                    "wecom": {"corpSecret": "wecom-secret", "corpId": "corp"},
                },
                "pages": {"a": 1},
            },
        )
        self.assertEqual(merged["agentConfig"]["apiKey"], "sk-real")
        self.assertEqual(merged["agentConfig"]["mcpGatewaySecret"], "gw")
        self.assertEqual(merged["channelConfig"]["email"]["smtpPassword"], "mail-pw")
        self.assertEqual(merged["channelConfig"]["email"]["to"], "ops@example.com")
        self.assertEqual(merged["channelConfig"]["webpush"]["vapidPrivateKey"], "vapid")
        self.assertEqual(merged["channelConfig"]["wecom"]["corpSecret"], "wecom-secret")
        # 被显式给出的段仍以 incoming 为准
        self.assertEqual(merged["pages"], {"b": 2})

    def test_partial_channel_section_keeps_other_channels(self) -> None:
        """只改 email 子对象时，webpush / wecom 不能被顺手清空。"""
        merged = merge_layout_secrets_on_save(
            {"channelConfig": {"email": {"to": "new@example.com"}}},
            {
                "channelConfig": {
                    "email": {"smtpPassword": "mail-pw", "to": "old@example.com"},
                    "webpush": {"vapidPrivateKey": "vapid"},
                    "wecom": {"corpSecret": "wecom-secret"},
                }
            },
        )
        self.assertEqual(merged["channelConfig"]["email"]["to"], "new@example.com")
        self.assertEqual(merged["channelConfig"]["email"]["smtpPassword"], "mail-pw")
        self.assertEqual(merged["channelConfig"]["webpush"]["vapidPrivateKey"], "vapid")
        self.assertEqual(merged["channelConfig"]["wecom"]["corpSecret"], "wecom-secret")


class SaveConfigBodyTest(unittest.TestCase):
    def test_missing_layout_is_rejected(self) -> None:
        service = _service()
        for body in ({}, {"layout": None}, {"layout": ""}):
            with self.assertRaises(BusinessException, msg=str(body)):
                asyncio.run(service.save_config_from_body("default", body))

    def test_empty_object_layout_is_still_allowed(self) -> None:
        """显式 ``{}`` 是「清空」意图，必须放行（守卫只拦缺失 / null / 空串）。"""
        service = _service()
        asyncio.run(service.save_config_from_body("default", {"layout": {}}))
        self.assertEqual(_stored(service), {})

    def test_invalid_expected_updated_at_is_rejected(self) -> None:
        """版本号解析失败必须 400：静默降级成「不校验」会让乐观锁形同虚设。"""
        service = _service()
        with self.assertRaises(BusinessException) as ctx:
            asyncio.run(
                service.save_config_from_body("default", {"layout": {"a": 1}, "expectedUpdatedAt": "not-a-time"})
            )
        self.assertEqual(ctx.exception.status_code, 400)


class LayoutPartialSaveEndToEndTest(unittest.TestCase):
    """保存流程端到端：局部 payload 落库后，库里的密钥必须还在。"""

    def test_partial_payload_keeps_secrets_in_db(self) -> None:
        service = _service()
        _seed(
            service,
            "default",
            {
                "agentConfig": {"apiKey": "sk-real"},
                "channelConfig": {"wecom": {"corpSecret": "wecom-secret"}},
                "pages": {"a": 1},
            },
            datetime(2026, 1, 1, tzinfo=UTC),
        )
        asyncio.run(service.save_config_from_body("default", {"layout": {"pages": {}}}))

        stored = _stored(service)
        self.assertEqual(stored["agentConfig"]["apiKey"], "sk-real")
        self.assertEqual(stored["channelConfig"]["wecom"]["corpSecret"], "wecom-secret")
        self.assertEqual(stored["pages"], {})


class LayoutOptimisticLockTest(unittest.TestCase):
    """布局保存的乐观锁：过期版本必须 409，而不是静默覆盖别的终端刚写的整份快照。"""

    def _seeded(self) -> tuple[UiConfigService, datetime]:
        service = _service()
        stored_at = datetime(2026, 1, 1, 12, 0, 0, 123456, tzinfo=UTC)
        _seed(service, "default", {"a": 1}, stored_at)
        return service, stored_at

    def test_stale_expected_updated_at_is_rejected(self) -> None:
        service, stored_at = self._seeded()
        with self.assertRaises(BusinessException) as ctx:
            asyncio.run(
                service.save_config_from_body(
                    "default",
                    {
                        "layout": {"a": 2},
                        "expectedUpdatedAt": _iso(stored_at + timedelta(seconds=1)),
                    },
                )
            )
        self.assertEqual(ctx.exception.status_code, 409)
        self.assertEqual(ctx.exception.error_code, ErrorCode.CONFLICT)
        self.assertEqual(_stored(service), {"a": 1})

    def test_matching_expected_updated_at_is_accepted(self) -> None:
        # 库里带微秒、对外契约只到毫秒：客户端回传截断值不能被误判成冲突
        service, stored_at = self._seeded()
        result = asyncio.run(
            service.save_config_from_body("default", {"layout": {"a": 2}, "expectedUpdatedAt": _iso(stored_at)})
        )
        self.assertTrue(result["success"])
        self.assertEqual(_stored(service), {"a": 2})

    def test_missing_expected_updated_at_keeps_backward_compat(self) -> None:
        service, _ = self._seeded()
        result = asyncio.run(service.save_config_from_body("default", {"layout": {"a": 3}}))
        self.assertTrue(result["success"])
        self.assertEqual(_stored(service), {"a": 3})

    def test_same_stale_version_cannot_be_saved_twice(self) -> None:
        """两台终端拿着同一个版本号：先写的成功，后写的必须 409。"""
        service, stored_at = self._seeded()
        version = _iso(stored_at)
        asyncio.run(
            service.save_config_from_body("default", {"layout": {"a": "terminal-A"}, "expectedUpdatedAt": version})
        )
        with self.assertRaises(BusinessException) as ctx:
            asyncio.run(
                service.save_config_from_body("default", {"layout": {"a": "terminal-B"}, "expectedUpdatedAt": version})
            )
        self.assertEqual(ctx.exception.status_code, 409)
        self.assertEqual(_stored(service), {"a": "terminal-A"})

    def test_write_that_lands_after_read_is_not_overwritten(self) -> None:
        """TOCTOU：读旧版本之后、写之前别的终端提交了，本次保存必须 409。

        旧实现先读 updated_at、在另一个 session 里写，这个窗口内的提交会被静默覆盖；
        现在版本校验是 UPDATE 的 WHERE 条件，窗口消失。
        """
        service, stored_at = self._seeded()
        version = _iso(stored_at)

        original = ui_service.UiConfigService._load_layout_for_secret_backfill

        def interleaved(self, project_id: str):
            loaded = original(self, project_id)
            # 另一个终端在这个窗口里提交了新版本
            self.save_config_checked(project_id, {"a": "terminal-B"})
            return loaded

        ui_service.UiConfigService._load_layout_for_secret_backfill = interleaved
        try:
            with self.assertRaises(BusinessException) as ctx:
                asyncio.run(
                    service.save_config_from_body(
                        "default",
                        {"layout": {"a": "terminal-A"}, "expectedUpdatedAt": version},
                    )
                )
        finally:
            ui_service.UiConfigService._load_layout_for_secret_backfill = original
        self.assertEqual(ctx.exception.status_code, 409)
        self.assertEqual(_stored(service), {"a": "terminal-B"})


class LayoutCreateTest(unittest.TestCase):
    def test_create_with_expected_version_on_missing_row_succeeds(self) -> None:
        service = _service()
        result = asyncio.run(
            service.save_config_from_body("default", {"layout": {"a": 1}, "expectedUpdatedAt": _iso(datetime.now(UTC))})
        )
        self.assertTrue(result["success"])
        self.assertEqual(_stored(service), {"a": 1})

    def test_new_profile_inherits_active_profile_secrets(self) -> None:
        """「以当前布局另存为新方案」必须仍带着激活方案的密钥。"""
        service = _service({"activeProfileId": "default"})
        _seed(service, "default", {"agentConfig": {"apiKey": "sk-real"}}, datetime(2026, 1, 1, tzinfo=UTC))
        asyncio.run(service.save_config_from_body("new-profile", {"layout": {"agentConfig": {"apiKey": MASK}}}))
        self.assertEqual(_stored(service, "new-profile")["agentConfig"]["apiKey"], "sk-real")


if __name__ == "__main__":
    unittest.main()
