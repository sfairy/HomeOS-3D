"""T5 回归：只配环境变量的部署也必须能启用支付渠道。

缺陷背景：enabled_channel_names 以前只读库里的 payment_channels_json，而全新部署
store_settings 行的该列默认是 []（ensure_default_settings 只 INSERT 默认值）。
于是只按 README 设置 STORE_PAYMENT_PROVIDER=alipay + 一套 STORE_ALIPAY_* 的部署
建单时渠道集合为空 → resolve_provider 抛「尚未配置支付渠道」→ 下单 503。
凭证合并早已是「站点优先、env 兜底」，渠道启用集合现在保持同一口径。
"""

from __future__ import annotations

import sys
import unittest
from pathlib import Path
from types import SimpleNamespace

REPO_ROOT = Path(__file__).resolve().parents[4]
BACKEND_ROOT = REPO_ROOT / "homeos-store" / "backend"
SHARED_ROOT = REPO_ROOT / "packages" / "shared-py"

# 后端以 python -m src.run 运行，把 backend 目录放进 path 即可 import src.*；
# 不要把 src 本身放进 path（会遮蔽同名顶层包）。homeos_shared 在 packages/shared-py。
sys.path.insert(0, str(BACKEND_ROOT))
sys.path.insert(0, str(SHARED_ROOT))

from src.payments import resolve_provider
from src.payments.base import PaymentError
from src.payments.channels import (
    default_channel_name,
    enabled_channel_names,
)


def _db_setting(*, channels: str = "[]", provider: str = "") -> SimpleNamespace:
    """只带 channels 助手实际读取的两个字段，避免依赖完整 ORM 行。"""
    return SimpleNamespace(payment_channels_json=channels, payment_provider=provider)


def _env_settings(*, provider: str = "") -> SimpleNamespace:
    return SimpleNamespace(payment_provider=provider)


class EnvFallbackChannelTests(unittest.TestCase):
    def test_env_provider_enables_channel_when_db_empty(self) -> None:
        setting = _db_setting(channels="[]", provider="")
        settings = _env_settings(provider="alipay")
        self.assertEqual(enabled_channel_names(setting, settings), ("alipay",))
        self.assertEqual(default_channel_name(setting, settings), "alipay")

    def test_env_provider_name_is_normalized(self) -> None:
        setting = _db_setting()
        settings = _env_settings(provider="WeChat")
        self.assertEqual(enabled_channel_names(setting, settings), ("wechat",))
        self.assertEqual(default_channel_name(setting, settings), "wechat")

    def test_malformed_db_channels_json_falls_back_to_env(self) -> None:
        setting = _db_setting(channels="not-json", provider="")
        settings = _env_settings(provider="wechat")
        self.assertEqual(enabled_channel_names(setting, settings), ("wechat",))

    def test_site_channels_win_over_env(self) -> None:
        setting = _db_setting(channels='["wechat"]', provider="wechat")
        settings = _env_settings(provider="alipay")
        self.assertEqual(enabled_channel_names(setting, settings), ("wechat",))
        self.assertEqual(default_channel_name(setting, settings), "wechat")

    def test_site_provider_used_when_channels_empty(self) -> None:
        setting = _db_setting(channels="[]", provider="wechat")
        settings = _env_settings(provider="alipay")
        self.assertEqual(enabled_channel_names(setting, settings), ("wechat",))
        self.assertEqual(default_channel_name(setting, settings), "wechat")

    def test_unknown_env_provider_is_ignored(self) -> None:
        setting = _db_setting()
        settings = _env_settings(provider="paypal")
        self.assertEqual(enabled_channel_names(setting, settings), ())
        self.assertEqual(default_channel_name(setting, settings), "")

    def test_no_configuration_still_fails_closed(self) -> None:
        setting = _db_setting()
        settings = _env_settings()
        self.assertEqual(enabled_channel_names(setting, settings), ())
        with self.assertRaises(PaymentError):
            resolve_provider(settings, setting)  # type: ignore[arg-type]

    def test_unknown_site_provider_does_not_enable_anything(self) -> None:
        setting = _db_setting(channels="[]", provider="mock")
        settings = _env_settings(provider="")
        self.assertEqual(enabled_channel_names(setting, settings), ())


if __name__ == "__main__":
    unittest.main()
