"""真实收款渠道的口径：渠道表、订单有效期、沙箱可见性、遗留显示名。

这几条都是「不报错、只静默失效」的失效方式：渠道名写错会静默变成不可用、
订单 TTL 太短会让每笔支付都变成人工核对、沙箱会被当成正式环境。
"""

from __future__ import annotations

import logging

import pytest

from apps.store.config import ALIPAY_ORDER_TTL_FLOOR_SECONDS, load_settings
from apps.store.tests.support import create_account


def test_default_order_ttl_matches_qr_lifetime() -> None:
    """默认订单有效期必须跟得上支付宝二维码的寿命（约 2 小时）。

    120 秒的旧默认只在模拟收银台上说得通：真实收款下顾客扫码稍慢就会变成
    「订单过期后才到账」的复活单，每一笔都要人工核对库存与优惠码。
    """
    from pathlib import Path
    import tempfile

    settings = load_settings(
        data_dir=Path(tempfile.mkdtemp()),
        license_keys_dir=Path(tempfile.mkdtemp()),
        project_root=Path("."),
    )
    assert settings.order_ttl_seconds == 900
    assert settings.order_ttl_seconds >= ALIPAY_ORDER_TTL_FLOOR_SECONDS


def test_alipay_with_short_ttl_warns_at_startup(caplog) -> None:
    """渠道是支付宝而 TTL 太短：必须在启动日志里点名。"""
    from dataclasses import replace
    from pathlib import Path
    import tempfile

    from apps.store.config import _warn_order_ttl_against_qr

    settings = load_settings(
        data_dir=Path(tempfile.mkdtemp()),
        license_keys_dir=Path(tempfile.mkdtemp()),
        project_root=Path("."),
    )
    with caplog.at_level(logging.WARNING, logger="apps.store.config"):
        _warn_order_ttl_against_qr(replace(settings, payment_provider="alipay", order_ttl_seconds=120))
    assert "订单" in caplog.text or "TTL" in caplog.text
    caplog.clear()
    # 调到安全值就不该再吵
    with caplog.at_level(logging.WARNING, logger="apps.store.config"):
        _warn_order_ttl_against_qr(replace(settings, payment_provider="alipay", order_ttl_seconds=900))
    assert caplog.text == ""


def test_mock_channel_is_gone_and_cannot_come_back() -> None:
    """模拟收银台必须**不存在**，而不只是被关掉。

    被关掉的免费发码通道只要还在渠道表里，就有被误开的一天；而且历史库里残留的
    'mock' 值必须被当成「未知渠道」拒绝，否则它会以一个已删除的名字继续参与解析。
    """
    from apps.store.payments import PROVIDER_NAMES, is_known_provider, normalize_provider_name

    assert "mock" not in PROVIDER_NAMES
    assert set(PROVIDER_NAMES) == {"alipay", "wechat"}
    assert not is_known_provider("mock")
    assert not is_known_provider("MOCK")
    assert is_known_provider("alipay")
    # 空串仍然合法：它的含义是「跟随环境变量」，不是某个具体渠道。
    assert is_known_provider("")
    assert normalize_provider_name(None) == ""


def test_mock_provider_module_is_deleted() -> None:
    """provider 实现与收银台模块必须是真的删掉了（不是只剩开关）。"""
    import importlib

    with pytest.raises(ModuleNotFoundError):
        importlib.import_module("apps.store.payments.mock")
    with pytest.raises(ModuleNotFoundError):
        importlib.import_module("apps.store.commerce.cashier")


def test_retired_display_name_falls_back_to_channel_default() -> None:
    """库里残留的「模拟支付」不再作为显示名 —— 否则顾客看到它却要付真钱。"""
    from apps.store.core.models import StoreSetting
    from apps.store.ops import site_settings as sc

    setting = StoreSetting(id=1, payment_provider="alipay", payment_display_name="模拟支付")
    payload = sc.payment_configuration_payload(setting, _settings(), include_credentials=False)
    assert payload["displayName"] == "支付宝"

    custom = StoreSetting(id=1, payment_provider="alipay", payment_display_name="扫码付款")
    payload = sc.payment_configuration_payload(custom, _settings(), include_credentials=False)
    assert payload["displayName"] == "扫码付款"


def _settings():
    from pathlib import Path
    import tempfile

    return load_settings(
        data_dir=Path(tempfile.mkdtemp()),
        license_keys_dir=Path(tempfile.mkdtemp()),
        project_root=Path("."),
    )


def test_sandbox_is_gone_entirely() -> None:
    """沙箱必须**整块不存在** —— 而不是「有开关但默认关」。

    它能下单、能出码，只是那张码只有沙箱买家账号付得了：在生产上被打开的后果是
    静默停收，而页面上看不出来。所以它和模拟收银台同命运：删掉，而不是留着开关。
    """
    import inspect

    from apps.store.core.models import StoreSetting
    from apps.store.ops import site_settings as sc
    from apps.store.payments import alipay as alipay_module

    # 1) 模型上没有沙箱开关（存量库里那一列也不再被读取）
    columns = {column.name for column in StoreSetting.__table__.columns}
    assert "alipay_sandbox" not in columns

    # 2) 支付模块里没有沙箱网关常量，且代码里不再出现沙箱域名
    assert not hasattr(alipay_module, "SANDBOX_GATEWAY_URL")
    code_lines = [
        line
        for line in inspect.getsource(alipay_module).splitlines()
        if line.strip() and not line.lstrip().startswith("#")
    ]
    assert not any("alipaydev" in line for line in code_lines)

    # 3) 店面配置里也不再下发 sandbox 标记
    payload = sc.payment_configuration_payload(
        StoreSetting(id=1, payment_provider="alipay"), _settings(), include_credentials=False
    )
    assert "sandbox" not in payload


def test_admin_cannot_write_back_the_retired_display_name(make_settings, make_app, make_client) -> None:
    """后台保存时也要拦住：显示名不能再写回「模拟支付」。"""
    app = make_app(make_settings(mail_mode="log"))
    create_account(app.state.database, email="admin2@example.com", admin=True)

    with make_client(app) as client:
        login = client.post(
            "/store/v1/auth/login",
            json={"email": "admin2@example.com", "password": "pw123456"},
        )
        assert login.status_code == 200, login.text
        response = client.put(
            "/store-admin/v1/settings",
            json={"paymentDisplayName": "模拟支付"},
        )
        assert response.status_code == 422, response.text
        assert "模拟支付" in response.json()["detail"]

        # mock 也不能被写回成渠道
        channel = client.put("/store-admin/v1/settings", json={"paymentProvider": "mock"})
        assert channel.status_code == 422, channel.text
