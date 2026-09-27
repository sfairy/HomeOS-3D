"""真实邮箱验证链路的回归测试。

覆盖三类曾经真实存在（或极易复发）的问题：
  1. 没发出去的信在界面上被说成「已发送」；
  2. 验证码行与发信共用一个未提交事务；
  3. 单码尝试上限因为请求回滚而形同虚设。
"""

from __future__ import annotations

from datetime import timedelta

import pytest

from src.config import load_settings
from src.core.models import EmailVerification
from src.security.security import code_hash, new_code_salt, utcnow
from src.tests.support import create_account

VERIFICATIONS = "/store/v1/verifications"


@pytest.fixture
def store(make_settings, make_app, make_client):
    # mail_mode=smtp 但没有服务器地址：这正是「用户以为收到信、其实只写了日志」的场景。
    settings = make_settings(mail_mode="smtp", smtp_host="")
    return make_app(settings)


def _seed_code(app, *, email: str, purpose: str = "register", code: str = "123456") -> str:
    with app.state.database.session() as session:
        salt = new_code_salt()
        record = EmailVerification(
            email=email,
            purpose=purpose,
            code_hash=code_hash(code, salt),
            code_salt=salt,
            expires_at=utcnow() + timedelta(minutes=10),
        )
        session.add(record)
        session.flush()
        return record.id


def test_undeliverable_code_is_reported_honestly(store, make_client):
    with make_client(store) as client:
        response = client.post(
            VERIFICATIONS, json={"email": "someone@example.com", "purpose": "register"}
        )
        assert response.status_code == 200, response.text
        body = response.json()
        # 没发出信就不能报「已投递」，而且必须给出原因，否则用户只能对着收件箱干等。
        assert body["delivered"] is False
        assert body.get("deliveryError")
        assert "code" not in body


def test_code_row_is_committed_before_the_mail_is_sent(store, make_client):
    """发信失败也必须留下验证码行。

    这是「先把码提交、再去发信」这条重构的可观察结果：以前两者共用一个事务，
    发送过程中崩溃就会留下「服务端没有这条记录」的状态。
    """
    with make_client(store) as client:
        assert client.post(
            VERIFICATIONS, json={"email": "committed@example.com", "purpose": "register"}
        ).status_code == 200

    with store.state.database.session() as session:
        rows = session.query(EmailVerification).filter_by(email="committed@example.com").all()
        assert len(rows) == 1
        # 投递结果也要落库，事后能回答「那封信到底发出去没有」。
        assert rows[0].delivered_at is not None


def test_wrong_code_attempts_are_persisted(store, make_client):
    """错码必须真的累计次数。

    旧实现把自增写在请求事务里，而错码这条路径紧接着 raise —— 请求作用域整体回滚，
    自增随之消失，单码尝试上限 8 永远是 0。
    """
    record_id = _seed_code(store, email="attempts@example.com")

    with make_client(store) as client:
        for _ in range(3):
            response = client.post(
                "/store/v1/auth/register",
                json={
                    "email": "attempts@example.com",
                    "code": "000000",
                    "password": "pw123456",
                    "confirmPassword": "pw123456",
                },
            )
            assert response.status_code == 400, response.text

    with store.state.database.session() as session:
        record = session.get(EmailVerification, record_id)
        assert record.attempts == 3
        # 错码不等于消费成功。
        assert record.consumed_at is None


def test_correct_code_still_registers_and_marks_verified(store, make_client):
    _seed_code(store, email="good@example.com", code="654321")

    with make_client(store) as client:
        response = client.post(
            "/store/v1/auth/register",
            json={
                "email": "good@example.com",
                "code": "654321",
                "password": "pw123456",
                "confirmPassword": "pw123456",
            },
        )
        assert response.status_code == 200, response.text

    from src.core.models import Account

    with store.state.database.session() as session:
        account = session.query(Account).filter_by(email="good@example.com").one()
        assert account.email_verified_at is not None


def test_change_email_request_does_not_reveal_registered_address(store, make_client):
    """发码阶段不能回答「这个邮箱注册过没有」。

    旧实现对已注册地址直接回 409「该邮箱已被其它账号使用」，等于给任何登录用户
    一个邮箱枚举探针 —— 而真正的占用校验本就该放在验证码消费之后。
    """
    create_account(store.state.database, email="taken@example.com")
    create_account(store.state.database, email="prober@example.com")

    with make_client(store) as client:
        login = client.post(
            "/store/v1/auth/login",
            json={"email": "prober@example.com", "password": "pw123456"},
        )
        assert login.status_code == 200, login.text
        response = client.post(
            VERIFICATIONS,
            json={"email": "taken@example.com", "purpose": "change_email"},
        )
        assert response.status_code != 409, response.text








def test_verification_send_does_not_block_other_writers(make_settings, make_app, make_client, monkeypatch):
    """发验证码邮件时**不持有写事务** —— 这是「先提交、再发信」那条重构的核心保证。

    旧实现把 SMTP 发在未提交的写事务里，而 busy_timeout 只有 5 秒：只要有一个人正在
    收验证码邮件（最长 20 秒），期间别人的登录 / 下单就会等满 5 秒然后报
    database is locked（表现为 500）。这条用例直接把那个场景摆出来：把 SMTP 卡住，
    再从另一个线程发一个**写请求**（登录会写会话行与 last_seen）。
    """
    import threading
    import time

    from src.ops import mailer as mailer_module

    settings = make_settings(
        # smtp_ready 需要 host + 用户名 + 授权码；真正的发送已被下面换掉。
        mail_mode="smtp",
        smtp_host="smtp.example.com",
        smtp_username="sender@example.com",
        smtp_password="secret",
    )
    app = make_app(settings)
    create_account(app.state.database, email="writer@example.com")

    entered = threading.Event()
    release = threading.Event()

    def blocking_send(settings_, *, email, subject, plain, rich):
        entered.set()
        release.wait(timeout=10)
        return True, 1, ""

    monkeypatch.setattr(mailer_module, "_send_smtp", blocking_send)

    results: dict = {}

    with make_client(app) as client:

        def send_code() -> None:
            results["verify"] = client.post(
                "/store/v1/verifications",
                json={"email": "someone@example.com", "purpose": "register"},
            )

        worker = threading.Thread(target=send_code, daemon=True)
        worker.start()
        try:
            assert entered.wait(timeout=5), "发信没有开始，用例前提不成立"
            started = time.monotonic()
            login = client.post(
                "/store/v1/auth/login",
                json={"email": "writer@example.com", "password": "pw123456"},
            )
            elapsed = time.monotonic() - started
        finally:
            release.set()
            worker.join(timeout=10)

    assert login.status_code == 200, login.text
    assert elapsed < 3.0, f"发信期间另一个写请求被阻塞了 {elapsed:.1f} 秒（写事务没提前提交）"
    assert results["verify"].status_code == 200
    assert results["verify"].json()["delivered"] is True
def test_login_hashes_even_for_unknown_accounts(store, make_client, monkeypatch):
    """未知邮箱也必须走一次口令校验：短路它就是账号枚举的计时侧信道。

    「账号不存在」与「密码错」都会回同一句 401，但如果前者不跑 PBKDF2，
    两者的耗时差了一个数量级 —— 攻击者不需要读响应，量时间就能筛出注册过的邮箱。
    """
    from src.api import store_auth

    calls = []
    real = store_auth.verify_password

    def spy(password, encoded):
        calls.append(encoded)
        return real(password, encoded)

    monkeypatch.setattr(store_auth, "verify_password", spy)

    with make_client(store) as client:
        response = client.post(
            "/store/v1/auth/login",
            json={"email": "nobody@example.com", "password": "whatever123"},
        )
        assert response.status_code == 401, response.text

    assert len(calls) == 1, "未知账号没有走口令校验（计时侧信道）"
    assert calls[0], "空跑用的是空哈希，那等于没跑"
def test_admin_rejects_mail_from_with_newline(store, make_client):
    """发件人里带换行必须在**保存时**被拒。

    放进去的话，email 库会在构造邮件头时抛 ValueError —— 而那已经发生在用户点
    「获取验证码」的请求里了，表现是「注册页一按就 500」。
    """
    create_account(store.state.database, email="admin@example.com", admin=True)

    with make_client(store) as client:
        login = client.post(
            "/store/v1/auth/login",
            json={"email": "admin@example.com", "password": "pw123456"},
        )
        assert login.status_code == 200, login.text

        response = client.put(
            "/store-admin/v1/settings",
            json={"mailFrom": "Bad\nFrom <no-reply@example.com>"},
        )
        assert response.status_code == 422, response.text
        assert "换行" in response.json()["detail"]

        # 正常写法要能存下去（否则这条校验就变成了禁止配置）。
        ok = client.put(
            "/store-admin/v1/settings",
            json={"mailFrom": "HomeOS <no-reply@example.com>"},
        )
        assert ok.status_code == 200, ok.text
        assert ok.json()["mail"]["fromAddress"] == "HomeOS <no-reply@example.com>"
        # 后台「订单 TTL 与支付宝二维码寿命不匹配」那条提示的数据来源：
        # 少了它，提示会永远是 hidden（静默失效，而不是报错）。
        body = ok.json()
        assert body["orderTtlSeconds"] > 0
        assert body["orderTtlRecommendedSeconds"] == 300
def test_cooldown_must_be_shorter_than_ttl(store):
    """配错这两个值时启动就该拒绝，而不是让注册被永久卡死。

    冷却长于有效期时，验证码过期后用户仍被冷却挡住，永远拿不到新码 ——
    而两个配置项单独看都合法，启动日志里也一个字都没有。
    """
    with pytest.raises(ValueError):
        load_settings(
            data_dir=store.state.settings.data_dir.parent / "bad-config",
            license_keys_dir=store.state.settings.license_keys_dir,
            verification_ttl_seconds=60,
            verification_cooldown_seconds=600,
        )
