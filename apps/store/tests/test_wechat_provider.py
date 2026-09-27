"""微信支付渠道的单元测试：请求签名、下单、查单、关单、退款、回调。

网络出口被换成桩函数（``wechat._http_request``），所以不需要商户号就能验证：
请求体的形状、金额单位、签名覆盖的字符串、以及各种错误码的语义映射。
真正需要真实商户号的只有「微信网关是否接受这套凭据」—— 那一步由后台「测试凭据」覆盖。
"""

from __future__ import annotations

import base64
import json
from pathlib import Path
import tempfile

import pytest
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import padding
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

from apps.store.config import load_settings
from apps.store.core.models import Order
from apps.store.payments import wechat as wechat_module
from apps.store.payments import wechat_signing as signing
from apps.store.payments.base import PaymentError
from apps.store.payments.wechat import WeChatPayProvider
from apps.store.tests.support import generate_rsa_keypair

MCH_ID = "1900000001"
APP_ID = "wx1234567890abcdef"
API_V3_KEY = "0123456789abcdef0123456789abcdef"
SERIAL_NO = "49B1C2D3E4F5A6B7"


def _keypair() -> tuple[str, str]:
    """随意一对密钥（用于「换了一把公钥就该验不过」这类负例）。"""
    return generate_rsa_keypair()


class _FakeResponse:
    def __init__(self, status_code: int, payload: dict | None = None, text: str | None = None) -> None:
        self.status_code = status_code
        self._payload = payload
        if text is not None:
            self.text = text
        else:
            self.text = "" if payload is None else json.dumps(payload, ensure_ascii=False)




@pytest.fixture
def settings(merchant_keys, platform_keys):
    merchant_private, _merchant_public = merchant_keys
    _platform_private, platform_public = platform_keys
    return load_settings(
        data_dir=Path(tempfile.mkdtemp()),
        license_keys_dir=Path(tempfile.mkdtemp()),
        project_root=Path("."),
        wechat_mch_id=MCH_ID,
        wechat_app_id=APP_ID,
        wechat_api_v3_key=API_V3_KEY,
        wechat_merchant_private_key=merchant_private,
        wechat_merchant_serial_no=SERIAL_NO,
        wechat_platform_public_key=platform_public,
    )


@pytest.fixture
def order() -> Order:
    record = Order(
        order_no="HB-20260927120000-buyer-abcdef",
        email="buyer@example.com",
        amount_cents=3990,
        payment_provider="wechat",
    )
    return record


def _stub(monkeypatch, responses):
    """把网络出口换成按顺序返回的桩，并记录每次调用。"""
    calls: list[dict] = []
    queue = list(responses)

    def fake(method, url, *, content, headers, timeout):
        calls.append({"method": method, "url": url, "content": content, "headers": headers})
        item = queue.pop(0) if queue else _FakeResponse(200, {})
        if isinstance(item, Exception):
            raise item
        return item

    monkeypatch.setattr(wechat_module, "_http_request", fake)
    return calls


def test_is_configured_needs_every_credential(settings) -> None:
    provider = WeChatPayProvider()
    assert provider.is_configured(settings) is True
    assert WeChatPayProvider.missing_credentials(settings) == []

    from dataclasses import replace

    # 逐个抽掉，每一项都必须被点名（少配一项就下单失败，不如现在说清楚）
    for field_name, expect in (
        ("wechat_mch_id", "商户号"),
        ("wechat_app_id", "appid"),
        ("wechat_api_v3_key", "APIv3"),
        ("wechat_merchant_private_key", "私钥"),
        ("wechat_merchant_serial_no", "序列号"),
        ("wechat_platform_public_key", "公钥"),
    ):
        broken = replace(settings, **{field_name: ""})
        missing = WeChatPayProvider.missing_credentials(broken)
        assert missing, f"{field_name} 抽掉后居然仍算配置完整"
        assert any(expect in item for item in missing), (field_name, missing)


def test_create_payment_signs_the_exact_request(monkeypatch, settings, order, merchant_keys) -> None:
    """下单：金额用**分**、code_url 进二维码，且签名覆盖的正是发出去的那串。"""
    _merchant_private, merchant_public = merchant_keys
    calls = _stub(monkeypatch, [_FakeResponse(200, {"code_url": "weixin://wxpay/bizpayurl?pr=abc"})])

    intent = WeChatPayProvider().create_payment(
        order=order, settings=settings, setting=_setting(), base_url="https://pay.example.com"
    )

    assert intent.provider == "wechat"
    assert intent.qr_code == "weixin://wxpay/bizpayurl?pr=abc"
    assert intent.payload["qrCode"] == intent.qr_code
    assert "微信" in intent.payload["note"]

    call = calls[0]
    assert call["method"] == "POST"
    assert call["url"].endswith("/v3/pay/transactions/native")
    body = json.loads(call["content"].decode("utf-8"))
    assert body["amount"] == {"total": 3990, "currency": "CNY"}   # 分，不换算
    assert body["mchid"] == MCH_ID and body["appid"] == APP_ID
    assert body["out_trade_no"] == order.order_no
    assert body["notify_url"] == "https://pay.example.com/store/v1/payments/wechat/notify"

    # 关键一条：把 Authorization 里的签名拿公钥验一遍，覆盖的必须是「方法/URL/时间戳/
    # 随机串/请求体」那串 —— 少一段、或用了两次序列化的请求体，都会在这里挂。
    header = call["headers"]["Authorization"]
    assert header.startswith("WECHATPAY2-SHA256-RSA2048 ")
    fields = dict(item.split("=", 1) for item in header.split(" ", 1)[1].split(","))
    fields = {key: value.strip('"') for key, value in fields.items()}
    assert fields["mchid"] == MCH_ID and fields["serial_no"] == SERIAL_NO

    message = signing.build_request_sign_message(
        method="POST",
        url_path="/v3/pay/transactions/native",
        timestamp=fields["timestamp"],
        nonce=fields["nonce_str"],
        body=call["content"].decode("utf-8"),
    )
    public_key = serialization.load_pem_public_key(merchant_public.encode("utf-8"))
    public_key.verify(
        base64.b64decode(fields["signature"]),
        message.encode("utf-8"),
        padding.PKCS1v15(),
        hashes.SHA256(),
    )


def test_query_payment_distinguishes_missing_trade_from_failure(monkeypatch, settings, order) -> None:
    """交易不存在 → None（正常）；其它错误 → 抛错（不能当「没付」处理）。"""
    provider = WeChatPayProvider()

    _stub(monkeypatch, [_FakeResponse(404, {"code": "ORDER_NOT_EXIST", "message": "订单不存在"})])
    assert provider.query_payment(settings, order) is None

    _stub(monkeypatch, [_FakeResponse(200, {"trade_state": "SUCCESS", "amount": {"total": 3990}})])
    node = provider.query_payment(settings, order)
    assert node is not None and node["trade_state"] == "SUCCESS"

    _stub(monkeypatch, [_FakeResponse(401, {"code": "SIGN_ERROR", "message": "签名错误"})])
    with pytest.raises(PaymentError):
        provider.query_payment(settings, order)


def test_query_payment_url_carries_the_query_string(monkeypatch, settings, order) -> None:
    """查单的 URL 必须带 mchid 查询串，且**签名里也要带**（漏了只会回签名错误）。"""
    calls = _stub(monkeypatch, [_FakeResponse(200, {"trade_state": "NOTPAY"})])
    WeChatPayProvider().query_payment(settings, order)
    assert f"mchid={MCH_ID}" in calls[0]["url"]
    assert calls[0]["method"] == "GET"
    assert calls[0]["content"] == b""


def test_close_payment_maps_the_three_outcomes(monkeypatch, settings, order) -> None:
    provider = WeChatPayProvider()

    _stub(monkeypatch, [_FakeResponse(204, None, text="")])
    assert provider.close_payment(settings, order).closed is True

    _stub(monkeypatch, [_FakeResponse(400, {"code": "ORDER_PAID", "message": "订单已支付"})])
    already = provider.close_payment(settings, order)
    assert already.closed is False and already.already_paid is True

    _stub(monkeypatch, [_FakeResponse(400, {"code": "ORDER_CLOSED", "message": "订单已关闭"})])
    assert provider.close_payment(settings, order).closed is True


def test_refund_payment_does_not_report_processing_as_done(monkeypatch, settings, order) -> None:
    """``PROCESSING`` 是**异步到账**：既不能记成已退款，也不能当失败丢掉。"""
    provider = WeChatPayProvider()

    _stub(monkeypatch, [_FakeResponse(200, {"status": "SUCCESS", "refund_id": "R1", "amount": {"refund": 3990}})])
    done = provider.refund_payment(
        order=order, amount_cents=3990, reason="用户申请", out_request_no="RF-1",
        settings=settings, setting=_setting(),
    )
    assert done.ok is True and done.trade_no == "R1" and done.unrefunded_cents == 0

    _stub(monkeypatch, [_FakeResponse(200, {"status": "PROCESSING", "refund_id": "R2", "amount": {"refund": 3990}})])
    pending = provider.refund_payment(
        order=order, amount_cents=3990, reason="用户申请", out_request_no="RF-2",
        settings=settings, setting=_setting(),
    )
    assert pending.ok is False and pending.unrefunded_cents == 3990
    assert "处理中" in pending.detail


def _encrypted_notification(platform_private: str, *, trade_state="SUCCESS", total=3990, mchid=MCH_ID, appid=APP_ID, event_type="TRANSACTION.SUCCESS"):
    """造一条**真的签了名、真的加密了**的回调，与微信发出来的一样。"""
    payload = {
        "out_trade_no": "HB-20260927120000-buyer-abcdef",
        "transaction_id": "4200001234202609271234567890",
        "trade_state": trade_state,
        "mchid": mchid,
        "appid": appid,
        "amount": {"total": total, "payer_total": total, "currency": "CNY"},
    }
    nonce = "abcdef123456"
    associated_data = "transaction"
    ciphertext = AESGCM(API_V3_KEY.encode("utf-8")).encrypt(
        nonce.encode("utf-8"), json.dumps(payload).encode("utf-8"), associated_data.encode("utf-8")
    )
    body = json.dumps(
        {
            "id": "evt-1",
            "event_type": event_type,
            "resource": {
                "algorithm": "AEAD_AES_256_GCM",
                "ciphertext": base64.b64encode(ciphertext).decode("ascii"),
                "nonce": nonce,
                "associated_data": associated_data,
            },
        }
    )
    import time as _time

    timestamp = str(int(_time.time()))
    nonce_header = "N1"
    signature = signing.sign(
        signing.build_sign_message(timestamp=timestamp, nonce=nonce_header, body=body),
        platform_private,
    )
    headers = {
        "Wechatpay-Timestamp": timestamp,
        "Wechatpay-Nonce": nonce_header,
        "Wechatpay-Signature": signature,
        "Wechatpay-Serial": "PUB_KEY_ID_1",
    }
    return headers, body


def test_verify_notification_round_trip(settings, platform_keys) -> None:
    """真实签名的回调：验签 + 解密后字段齐全，金额是分。"""
    platform_private, _platform_public = platform_keys
    headers, body = _encrypted_notification(platform_private)

    notification = WeChatPayProvider().verify_notification(settings, headers=headers, body=body)
    assert notification.ok is True, notification.reason
    assert notification.event_type == "TRANSACTION.SUCCESS"
    assert notification.trade_state == "SUCCESS"
    assert notification.total_cents == 3990
    assert notification.mch_id == MCH_ID and notification.app_id == APP_ID
    assert notification.is_success is True


def test_verify_notification_rejects_every_tampered_variant(settings, platform_keys, monkeypatch) -> None:
    """改签名、改 body、换平台公钥、过期时间戳、错 APIv3 密钥 —— 一个都不能通过。"""
    platform_private, _platform_public = platform_keys
    provider = WeChatPayProvider()
    headers, body = _encrypted_notification(platform_private)

    # 1) 签名被改
    broken = {**headers, "Wechatpay-Signature": "aW52YWxpZA=="}
    assert provider.verify_notification(settings, headers=broken, body=body).ok is False

    # 2) body 被改（这正是验签的意义）
    assert (
        provider.verify_notification(settings, headers=headers, body=body.replace("evt-1", "evt-2")).ok
        is False
    )

    # 3) 平台公钥不对（配错成商户自己的公钥，或别人的）
    _other_private, other_public = _keypair()
    from dataclasses import replace

    wrong = replace(settings, wechat_platform_public_key=other_public)
    assert provider.verify_notification(wrong, headers=headers, body=body).ok is False

    # 4) 时间戳过期（重放）
    import time as _time

    old = str(int(_time.time()) - 10_000)
    stale_signature = signing.sign(
        signing.build_sign_message(timestamp=old, nonce="N1", body=body), platform_private
    )
    stale = {**headers, "Wechatpay-Timestamp": old, "Wechatpay-Signature": stale_signature}
    result = provider.verify_notification(settings, headers=stale, body=body)
    assert result.ok is False and "容忍窗口" in result.reason

    # 5) APIv3 密钥不对 —— 验签能过，但解不开
    wrong_key = replace(settings, wechat_api_v3_key="ffffffffffffffffffffffffffffffff")
    result = provider.verify_notification(wrong_key, headers=headers, body=body)
    assert result.ok is False and "解密失败" in result.reason

    # 6) 缺头
    assert provider.verify_notification(settings, headers={}, body=body).ok is False


def _setting():
    from apps.store.core.models import StoreSetting

    return StoreSetting(id=1, payment_provider="wechat")
