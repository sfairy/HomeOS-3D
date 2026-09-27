"""微信支付 APIv3 密码学层的往返测试：签名、验签、资源解密。

这一层不依赖任何网络与商户凭据，所以可以**当场证明它对**：用自己生成的密钥做
「签名 → 验签」「加密 → 解密」的往返，并逐项验证「改一个字节就失败」。
上面那一层（provider）只要这一层是对的，剩下的就是拼请求与读响应。
"""

from __future__ import annotations

import base64
import json

import pytest
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

from src.payments import wechat_signing as ws


def _keypair() -> tuple[str, str]:
    """返回 (私钥 PEM, 公钥 PEM)。"""
    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    private_pem = key.private_bytes(
        serialization.Encoding.PEM,
        serialization.PrivateFormat.PKCS8,
        serialization.NoEncryption(),
    ).decode("utf-8")
    public_pem = key.public_key().public_bytes(
        serialization.Encoding.PEM,
        serialization.PublicFormat.SubjectPublicKeyInfo,
    ).decode("utf-8")
    return private_pem, public_pem


def test_request_signature_round_trip_and_tamper_detection() -> None:
    """请求签名：签得出来、验得回去，且改任何一个输入都验不过。"""
    private_pem, public_pem = _keypair()
    message = ws.build_request_sign_message(
        method="POST",
        url_path="/v3/pay/transactions/native",
        timestamp="1727000000",
        nonce="ABCD1234",
        body='{"out_trade_no":"X"}',
    )
    signature = ws.sign(message, private_pem)

    # 用同一份公钥验证（等价于网关那一侧的验签）
    from cryptography.hazmat.primitives import hashes
    from cryptography.hazmat.primitives.asymmetric import padding

    public_key = serialization.load_pem_public_key(public_pem.encode("utf-8"))
    public_key.verify(
        base64.b64decode(signature), message.encode("utf-8"), padding.PKCS1v15(), hashes.SHA256()
    )

    # 五行里任何一行变了都必须验不过 —— 尤其是「URL 少带查询串」这种最常见的手滑。
    for broken in (
        ws.build_request_sign_message(
            method="GET",
            url_path="/v3/pay/transactions/native",
            timestamp="1727000000",
            nonce="ABCD1234",
            body='{"out_trade_no":"X"}',
        ),
        ws.build_request_sign_message(
            method="POST",
            url_path="/v3/pay/transactions/native?mchid=1",
            timestamp="1727000000",
            nonce="ABCD1234",
            body='{"out_trade_no":"X"}',
        ),
        ws.build_request_sign_message(
            method="POST",
            url_path="/v3/pay/transactions/native",
            timestamp="1727000001",
            nonce="ABCD1234",
            body='{"out_trade_no":"X"}',
        ),
        ws.build_request_sign_message(
            method="POST",
            url_path="/v3/pay/transactions/native",
            timestamp="1727000000",
            nonce="ABCD1234",
            body='{"out_trade_no":"Y"}',
        ),
    ):
        with pytest.raises(Exception):
            public_key.verify(
                base64.b64decode(signature),
                broken.encode("utf-8"),
                padding.PKCS1v15(),
                hashes.SHA256(),
            )


def test_notification_verify_accepts_only_the_real_platform_key() -> None:
    """回调验签：平台密钥签的通过，别人签的与改过的都不通过。"""
    platform_private, platform_public = _keypair()
    _other_private, other_public = _keypair()
    body = '{"id":"evt-1","event_type":"TRANSACTION.SUCCESS"}'

    signature = ws.sign(
        ws.build_sign_message(timestamp="1727000000", nonce="N1", body=body), platform_private
    )

    assert (
        ws.verify_notification(
            timestamp="1727000000",
            nonce="N1",
            body=body,
            signature=signature,
            platform_public_key_text=platform_public,
        )
        is True
    )
    # 换了公钥（配错平台公钥）→ 必须 False
    assert (
        ws.verify_notification(
            timestamp="1727000000",
            nonce="N1",
            body=body,
            signature=signature,
            platform_public_key_text=other_public,
        )
        is False
    )
    # 请求体被改一个字 → 必须 False（这正是「验签」存在的意义）
    assert (
        ws.verify_notification(
            timestamp="1727000000",
            nonce="N1",
            body=body.replace("SUCCESS", "FAIL"),
            signature=signature,
            platform_public_key_text=platform_public,
        )
        is False
    )
    # 公钥本身解析不出来（配置故障）→ False，而不是抛异常变 500
    assert (
        ws.verify_notification(
            timestamp="1727000000",
            nonce="N1",
            body=body,
            signature=signature,
            platform_public_key_text="not-a-key",
        )
        is False
    )
    # 缺任何一个头 → False
    assert (
        ws.verify_notification(
            timestamp="", nonce="N1", body=body, signature=signature,
            platform_public_key_text=platform_public,
        )
        is False
    )


def test_resource_decryption_round_trip() -> None:
    """资源解密：AES-256-GCM 往返成功；密钥错、附加数据错都必须失败。"""
    api_v3_key = "0123456789abcdef0123456789abcdef"  # 恰好 32 字符
    payload = {"out_trade_no": "HB-1", "trade_state": "SUCCESS", "amount": {"total": 3990}}
    nonce = "abcdef123456"
    associated_data = "transaction"

    ciphertext = AESGCM(api_v3_key.encode("utf-8")).encrypt(
        nonce.encode("utf-8"),
        json.dumps(payload).encode("utf-8"),
        associated_data.encode("utf-8"),
    )
    resource = {
        "algorithm": "AEAD_AES_256_GCM",
        "ciphertext": base64.b64encode(ciphertext).decode("ascii"),
        "nonce": nonce,
        "associated_data": associated_data,
    }

    assert ws.decrypt_resource(api_v3_key, resource) == payload

    # 密钥错（最容易配错的一项：把商户号或证书当成了 APIv3 密钥）
    with pytest.raises(ws.WeChatPaymentError):
        ws.decrypt_resource("ffffffffffffffffffffffffffffffff", resource)
    # 附加数据必须原样带入：传成空串就是认证失败
    with pytest.raises(ws.WeChatPaymentError):
        ws.decrypt_resource(api_v3_key, {**resource, "associated_data": ""})
    # 长度不对的密钥在**配置校验**阶段就该被拦住，而不是等到解密
    with pytest.raises(ws.WeChatPaymentError):
        ws.decrypt_resource("too-short", resource)


def test_field_validators_reject_the_common_mistakes() -> None:
    """各项校验要能认出最常见的配错。"""
    assert "32 个字符" in ws.api_v3_key_error("short")
    assert ws.api_v3_key_error("0123456789abcdef0123456789abcdef") == ""
    assert ws.api_v3_key_error("0123456789abcdef0123456789abcde") != ""  # 31 位
    assert ws.api_v3_key_error("0123456789abcdef0123456789abcdefg") != ""  # 33 位

    assert ws.merchant_serial_no_error("") != ""
    assert ws.merchant_serial_no_error("49B1C2D3E4F5A6B7") == ""
    assert ws.merchant_serial_no_error("49:B1:C2") != ""  # 带冒号

    assert "不能为空" in ws.merchant_private_key_error("")
    assert ws.merchant_private_key_error("not-a-pem") != ""
    assert "不能为空" in ws.platform_public_key_error("")

    private_pem, public_pem = _keypair()
    assert ws.merchant_private_key_error(private_pem) == ""
    assert ws.platform_public_key_error(public_pem) == ""
    # 公钥当好私钥/私钥当好公钥：两边都要报错，而不是安静地失败
    assert ws.merchant_private_key_error(public_pem) != ""
    assert ws.platform_public_key_error(private_pem) != ""


def test_nonce_is_random_and_short_enough() -> None:
    values = {ws.new_nonce() for _ in range(50)}
    assert len(values) == 50
    assert all(len(value) <= 32 for value in values)
