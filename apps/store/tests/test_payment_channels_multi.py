"""多渠道（支付宝 + 微信支付）在前台与下单路径上的行为。

这里验证的是一件业务上很要紧的事：**顾客能选渠道，但不能绕开运营的开关**。
一个请求字段不能让顾客决定走哪个商户号收款。
"""

from __future__ import annotations

import pytest

from sqlalchemy import select

from apps.store.core.models import Order
from apps.store.payments import wechat as wechat_module
from apps.store.ops import site_settings as site_config
from apps.store.tests.support import create_account, first_product

BUYER = "buyer@example.com"
ADMIN = "admin@example.com"


@pytest.fixture
def both_channels(make_settings, make_app, make_client, merchant_keys, platform_keys):
    """支付宝与微信都配齐凭据，并且都启用。"""
    merchant_private, merchant_public = merchant_keys
    _platform_private, platform_public = platform_keys
    settings = make_settings(
        payment_provider="alipay",
        alipay_app_id="2021000000000000",
        alipay_seller_id="2088000000000000",
        alipay_app_private_key=merchant_private,
        alipay_public_key=merchant_public,
        wechat_mch_id="1900000001",
        wechat_app_id="wx1234567890abcdef",
        wechat_api_v3_key="0123456789abcdef0123456789abcdef",
        wechat_merchant_private_key=merchant_private,
        wechat_merchant_serial_no="49B1C2D3E4F5A6B7",
        wechat_platform_public_key=platform_public,
        mail_mode="log",
    )
    app = make_app(settings)
    with app.state.database.session() as session:
        site_config.update_setting(session, payment_channels_json='["alipay","wechat"]')
    return app


@pytest.fixture
def stub_gateway(monkeypatch):
    """微信网关打桩：下单时**绝不能**真的出网（那既慢又不可复现）。"""
    calls: list[dict] = []

    class _Response:
        status_code = 200
        text = '{"code_url":"weixin://wxpay/bizpayurl?pr=abc"}'
        payload = {"code_url": "weixin://wxpay/bizpayurl?pr=abc"}

        def json(self):
            return self.payload

    def fake(method, url, *, content, headers, timeout):
        calls.append({"method": method, "url": url})
        return _Response()

    monkeypatch.setattr(wechat_module, "_http_request", fake)
    return calls


def _checkout(client, product_id, **extra):
    body = {"productId": product_id, "email": BUYER, **extra}
    return client.post("/store/v1/orders", json=body)


@pytest.fixture
def buyer(both_channels, make_client):
    app = both_channels
    create_account(app.state.database, email=BUYER)
    product_id = first_product(app.state.database)
    client = make_client(app)
    with client as session_client:
        login = session_client.post(
            "/store/v1/auth/login", json={"email": BUYER, "password": "pw123456"}
        )
        assert login.status_code == 200, login.text
        yield app, session_client, product_id


def test_storefront_lists_both_channels_with_availability(
    both_channels, make_client
) -> None:
    """前台能看到两个渠道、各自带可用性，以及哪个是默认。"""
    with make_client(both_channels) as client:
        payment = client.get("/store/v1/configuration").json()["payment"]
    channels = {item["provider"]: item for item in payment["channels"]}
    assert set(channels) == {"alipay", "wechat"}
    assert all(item["available"] for item in channels.values())
    assert channels["alipay"]["isDefault"] is True
    assert channels["wechat"]["displayName"] == "微信支付"
    # 微信的提示语必须是微信的：让用户拿微信扫支付宝的码是最常见的事故。
    assert "微信" in channels["wechat"]["note"]
    assert "支付宝" in channels["alipay"]["note"]
    # 顶层字段仍是默认渠道（老前台JS兼容）
    assert payment["provider"] == "alipay"
    assert payment["available"] is True


def test_customer_choice_freezes_the_channel_on_the_order(buyer, stub_gateway) -> None:
    app, client, product_id = buyer
    response = _checkout(client, product_id, paymentChannel="wechat")
    assert response.status_code == 201, response.text
    payload = response.json()
    assert payload["payment"]["type"] == "wechat"
    assert payload["payment"]["qrCode"]
    with app.state.database.session() as session:
        order = session.scalars(
            select(Order).where(Order.order_no == payload["orderNo"])
        ).first()
        assert order is not None and order.payment_provider == "wechat"
    # 网关确实被调用了，且打的是 Native 下单接口
    assert stub_gateway and stub_gateway[0]["url"].endswith("/v3/pay/transactions/native")


def test_unknown_channel_is_refused(buyer) -> None:
    """已删除的渠道名（mock）必须被拒 —— 否则等于把免费发码开关重新交回顾客手里。"""
    _app, client, product_id = buyer
    response = _checkout(client, product_id, paymentChannel="mock")
    assert response.status_code == 400
    assert "不支持" in response.json()["detail"]


def test_disabled_channel_is_refused(buyer) -> None:
    """渠道存在但运营没启用：必须拒，而且要说清楚是「未启用」。"""
    app, client, product_id = buyer
    with app.state.database.session() as session:
        site_config.update_setting(session, payment_channels_json='["alipay"]')
    response = _checkout(client, product_id, paymentChannel="wechat")
    assert response.status_code == 400
    assert "未启用" in response.json()["detail"]


def test_channel_without_credentials_is_refused(
    make_settings, make_app, make_client
) -> None:
    """启用了但凭据不全：报 503 并说清是「不可用」，而不是建完单再失败。

    注意不能用「把后台的字段清空」来造这个场景：留空 = 跟随环境变量，
    环境变量里配着凭据时渠道照样可用（那是本商店的既定口径）。所以要真的让环境里也没有。
    """
    settings = make_settings(
        payment_provider="alipay", mail_mode="log"
    )
    app = make_app(settings)
    create_account(app.state.database, email=BUYER)
    product_id = first_product(app.state.database)
    with app.state.database.session() as session:
        site_config.update_setting(session, payment_channels_json='["wechat","alipay"]')
    with make_client(app) as client:
        login = client.post(
            "/store/v1/auth/login", json={"email": BUYER, "password": "pw123456"}
        )
        assert login.status_code == 200, login.text
        response = _checkout(client, product_id, paymentChannel="wechat")
        assert response.status_code == 503, response.text
        assert "不可用" in response.json()["detail"]
    with app.state.database.session() as session:
        assert session.query(Order).count() == 0


def test_single_channel_deployment_reports_one_channel(make_settings, make_app, make_client) -> None:
    """只启用了支付宝的老部署：清单里只有一项，前台不会弹选择框。"""
    settings = make_settings(payment_provider="alipay", mail_mode="log")
    app = make_app(settings)
    with make_client(app) as client:
        payment = client.get("/store/v1/configuration").json()["payment"]
    assert [item["provider"] for item in payment["channels"]] == ["alipay"]
    # 凭据未配 → 不可用（前台收起入口）
    assert payment["available"] is False

# ---- 后台保存 → 前台可见 → 下单，整条闭环 ---- #
#
# 这条链上每一段都可能静默失效：字段名拼错（后台发了但服务端不认识）、校验缺失
# （把解不开的密钥存进库）、渠道清单没存（前台永远只画一个按钮）。所以必须端到端
# 走一遍，而不是只测各段。


@pytest.fixture
def admin_client(make_settings, make_app, make_client):
    """一个已登录的商店管理员客户端（微信凭据留空，等测试自己填）。"""
    app = make_app(make_settings(payment_provider="", mail_mode="log"))
    create_account(app.state.database, email=ADMIN, admin=True)
    client = make_client(app)
    with client as session_client:
        login = session_client.post(
            "/store/v1/auth/login", json={"email": ADMIN, "password": "pw123456"}
        )
        assert login.status_code == 200, login.text
        yield app, session_client


def _wechat_payload(merchant_keys, platform_keys) -> dict:
    merchant_private, _merchant_public = merchant_keys
    _platform_private, platform_public = platform_keys
    return {
        "wechatMchId": "1900000001",
        "wechatAppId": "wx1234567890abcdef",
        "wechatMerchantSerialNo": "49b1c2d3e4f5a6b7",
        "wechatApiV3Key": "0123456789abcdef0123456789abcdef",
        "wechatMerchantPrivateKey": merchant_private,
        "wechatPlatformPublicKey": platform_public,
        "paymentChannels": ["alipay", "wechat"],
    }


def test_admin_saves_wechat_credentials_and_both_channels_go_live(
    admin_client, merchant_keys, platform_keys, stub_gateway
) -> None:
    """后台存下微信凭据并启用两个渠道 → 前台能看到两个 → 选微信下单成功。"""
    app, client = admin_client

    saved = client.put("/store-admin/v1/settings", json=_wechat_payload(merchant_keys, platform_keys))
    assert saved.status_code == 200, saved.text
    body = saved.json()
    # 序列号要归一成大写（人工抄进来的常常是小写）
    assert body["wechat"]["merchantSerialNo"] == "49B1C2D3E4F5A6B7"
    assert body["wechat"]["configured"] is True
    # 密钥只打码回显，绝不落明文
    assert "0123456789abcdef" not in saved.text
    assert set(body["channels"]) == {"alipay", "wechat"}

    # 前台：两个渠道都在，且都可用
    payment = client.get("/store/v1/configuration").json()["payment"]
    channels = {item["provider"]: item for item in payment["channels"]}
    assert set(channels) == {"alipay", "wechat"}
    assert channels["wechat"]["available"] is True

    # 选微信下单：网关被调用，且订单冻结在 wechat 上
    create_account(app.state.database, email=BUYER)
    product_id = first_product(app.state.database)
    login = client.post("/store/v1/auth/login", json={"email": BUYER, "password": "pw123456"})
    assert login.status_code == 200, login.text
    response = client.post(
        "/store/v1/orders",
        json={"productId": product_id, "email": BUYER, "paymentChannel": "wechat"},
    )
    assert response.status_code == 201, response.text
    assert response.json()["payment"]["type"] == "wechat"
    assert stub_gateway[0]["url"].endswith("/v3/pay/transactions/native")


@pytest.mark.parametrize(
    "override, expect",
    [
        # APIv3 密钥不是 32 字符：解不开回调就等于回调永远处理不了，必须在保存时拦住
        ({"wechatApiV3Key": "too-short"}, "32 个字符"),
        # 序列号里带了冒号
        ({"wechatMerchantSerialNo": "49:B1:C2"}, "16 进制"),
        # 私钥根本不是 PEM
        ({"wechatMerchantPrivateKey": "not-a-pem"}, "私钥"),
        # 网关不是 https
        ({"wechatGatewayUrl": "http://api.mch.weixin.qq.com"}, "https"),
        # 回调地址是本机
        ({"wechatNotifyUrl": "http://127.0.0.1:18082/x"}, "内网"),
    ],
)
def test_admin_rejects_bad_wechat_values(
    admin_client, merchant_keys, platform_keys, override, expect
) -> None:
    """五种最常见的配错都必须在**保存时**被拒，而不是等顾客付款那一刻。"""
    _app, client = admin_client
    payload = {**_wechat_payload(merchant_keys, platform_keys), **override}
    response = client.put("/store-admin/v1/settings", json=payload)
    assert response.status_code == 422, response.text
    assert expect in response.json()["detail"]


def test_admin_rejects_swapped_wechat_keys(admin_client, merchant_keys, platform_keys) -> None:
    """把私钥填进公钥框（或反过来）是最常见的「配了但验不过」，必须当场报错。"""
    _app, client = admin_client
    _merchant_private, merchant_public = merchant_keys
    _platform_private, _platform_public = platform_keys
    merchant_private = _merchant_private

    swapped_private = {
        **_wechat_payload(merchant_keys, platform_keys),
        "wechatMerchantPrivateKey": merchant_public,
    }
    response = client.put("/store-admin/v1/settings", json=swapped_private)
    assert response.status_code == 422, response.text

    swapped_public = {
        **_wechat_payload(merchant_keys, platform_keys),
        "wechatPlatformPublicKey": merchant_private,
    }
    response = client.put("/store-admin/v1/settings", json=swapped_public)
    assert response.status_code == 422, response.text


def test_admin_cannot_enable_an_unknown_channel(admin_client) -> None:
    """渠道清单里塞进已删除的渠道名：必须拒（否则前台会画出点下去 400 的按钮）。"""
    _app, client = admin_client
    response = client.put("/store-admin/v1/settings", json={"paymentChannels": ["alipay", "mock"]})
    assert response.status_code == 422, response.text
    assert "mock" in response.json()["detail"]


def test_admin_can_clear_a_wechat_secret(admin_client, merchant_keys, platform_keys) -> None:
    """勾「清除」时必须真的把库里那把密钥清掉（而不是当成「不改动」）。"""
    app, client = admin_client
    client.put("/store-admin/v1/settings", json=_wechat_payload(merchant_keys, platform_keys))
    with app.state.database.session() as session:
        setting = site_config.get_setting(session)
        assert setting.wechat_merchant_private_key

    response = client.put("/store-admin/v1/settings", json={"wechatMerchantPrivateKey": ""})
    assert response.status_code == 200, response.text
    # 清空后若环境变量也没有，渠道就该变成「不可用」—— 前台据此收起按钮
    assert response.json()["wechat"]["configured"] is False

# ---- 订单表的「支付渠道」列 ---- #
#
# 列本身是前端画的，但**中文名由服务端给**（channels.provider_label）—— 前端再写一份
# 映射的话，加渠道时就会出现「订单表显示 alipay、报错文案显示支付宝」这种走散。


def test_admin_order_list_exposes_payment_channel_label(
    admin_client, merchant_keys, platform_keys, stub_gateway
) -> None:
    """订单列表要带上渠道名与中文名（微信订单显示「微信支付」）。"""
    app, client = admin_client
    client.put("/store-admin/v1/settings", json=_wechat_payload(merchant_keys, platform_keys))
    create_account(app.state.database, email=BUYER)
    product_id = first_product(app.state.database)
    assert client.post(
        "/store/v1/auth/login", json={"email": BUYER, "password": "pw123456"}
    ).status_code == 200
    created = client.post(
        "/store/v1/orders",
        json={"productId": product_id, "email": BUYER, "paymentChannel": "wechat"},
    )
    assert created.status_code == 201, created.text

    # 换回管理员身份看订单列表
    assert client.post(
        "/store/v1/auth/login", json={"email": ADMIN, "password": "pw123456"}
    ).status_code == 200
    listing = client.get("/store-admin/v1/orders")
    assert listing.status_code == 200, listing.text
    item = listing.json()["items"][0]
    assert item["paymentProvider"] == "wechat"
    assert item["paymentProviderLabel"] == "微信支付"


def test_provider_label_covers_every_value_an_order_can_hold() -> None:
    """订单里可能出现的历史值与特殊值都要有中文名（或原样显示），不能显示成空白。"""
    from apps.store.payments.channels import provider_label

    assert provider_label("alipay") == "支付宝"
    assert provider_label("wechat") == "微信支付"
    # 人工/线下入账：不是渠道，但订单表必须能说清「这笔钱不是在线收的」
    assert provider_label("manual") == "人工/线下"
    # 历史渠道名原样返回：那正是运营需要看到的事实
    assert provider_label("mock") == "mock"
    assert provider_label("") == ""
    assert provider_label(None) == ""


def test_orders_table_column_count_matches_empty_row() -> None:
    """表头列数必须等于空行的 colspan。

    这是一类**只在没有数据时才露出来**的 bug：加了一列但忘了改 colspan，空列表就会
    多出/少掉一格，而有数据时一切正常 —— 上线后往往很久才被发现。
    """
    import re
    from pathlib import Path

    root = Path(__file__).resolve().parents[3]
    html = (root / "apps/store/templates/admin.html").read_text(encoding="utf-8")
    js = (root / "apps/store/static/admin/panels/orders.js").read_text(encoding="utf-8")

    # 订单表的表头：从「订单号」那一行数 <th>
    header = re.search(r"<thead><tr>(?P<cells>.*?)</tr></thead>", html)
    assert header is not None
    order_header = next(
        (m for m in re.finditer(r"<thead><tr>(?P<cells>.*?)</tr></thead>", html, re.S)
         if "订单号" in m.group("cells")),
        None,
    )
    assert order_header is not None, "找不到订单表的表头"
    columns = len(re.findall(r"<th", order_header.group("cells")))

    empty = re.search(r"emptyRow\((\d+)", js)
    assert empty is not None, "找不到订单表的 emptyRow"
    assert columns == int(empty.group(1)), (
        f"订单表有 {columns} 列，但空行 colspan 是 {empty.group(1)} —— 加/减列时两处要一起改"
    )


