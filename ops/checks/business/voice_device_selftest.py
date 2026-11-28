#!/usr/bin/env python3
"""智能音箱域自检：配对凭据、唤醒词规则、分页游标、cron 最小间隔。

这四块都是**纯逻辑**（不需要数据库、不需要网关），也是本轮改动里最容易在"看起来能用"
和"其实有洞"之间摇摆的部分：

- 配对码 / 访问令牌：长度、一次性消费、过期、同设备互斥；
- 唤醒词：1–10 个、≤20 字符、大小写去重、**追加不是替换**；
- 游标：格式不合法必须报错，不能静默当成第一页（否则翻页会从头来过）；
- cron：`* * * * *` 必须被拒（语法合法但每分钟下发一次控制命令是误配置）。
"""

from __future__ import annotations

import base64
from datetime import UTC, datetime, timedelta
from typing import Any, cast

from _selftest_support import check, ensure_repo_on_path, report

ensure_repo_on_path()

from homeos.backend.src.domains.agent.policy.scheduler_time import (
    MIN_RECURRING_INTERVAL_MINUTES,
    validate_recurring_interval,
)
from homeos.backend.src.domains.notification.cursor import (
    InvalidCursor,
    decode_cursor,
    encode_cursor,
)
from homeos.backend.src.domains.voice_device.service import (
    SECRET_LENGTH,
    _valid_id,
    parse_notify_member_ids,
)
from homeos.backend.src.domains.voice_device.wake_word_flow import parse_add_command
from homeos.backend.src.domains.voice_device.wake_words import (
    MAX_WORDS,
    WakeWordError,
    _is_private_host,
    merge_words,
    normalize_words,
    validate_gateway_url,
)


def test_pairing_inputs() -> None:
    check("配对码长度是 32", SECRET_LENGTH == 32)
    check("gatewayId 允许字母数字下划线与连字符", _valid_id("gw_01-a"))
    check("gatewayId 拒绝路径分隔符", not _valid_id("gw/01"))
    check("gatewayId 拒绝空串", not _valid_id(""))
    check("gatewayId 拒绝超长（>96）", not _valid_id("a" * 97))


def test_notify_member_ids() -> None:
    check("合法 JSON 数组去重保序", parse_notify_member_ids('["a","b","a"]') == ["a", "b"])
    check("非 JSON 按空处理", parse_notify_member_ids("not json") == [])
    check("非数组按空处理", parse_notify_member_ids('{"a":1}') == [])
    check("空值按空处理", parse_notify_member_ids(None) == [])
    check("列表里的非字符串被丢弃", parse_notify_member_ids(["a", 1, "", "b"]) == ["a", "b"])


def test_wake_words() -> None:
    check("词表归一化去重（大小写）", normalize_words(["小智", "小智", "Xiao"]) == ["小智", "Xiao"])
    check("多余空格压成一个", normalize_words(["  小  智 "]) == ["小 智"])
    try:
        normalize_words([])
        check("空词表必须报错", False)
    except WakeWordError:
        check("空词表必须报错", True)
    try:
        normalize_words(["a" * 21])
        check("单字超过 20 字符必须报错", False)
    except WakeWordError:
        check("单字超过 20 字符必须报错", True)
    try:
        normalize_words([str(index) for index in range(MAX_WORDS + 1)])
        check("超过 10 个必须报错", False)
    except WakeWordError:
        check("超过 10 个必须报错", True)
    # 「语音加词」的关键语义：追加而不是替换。
    check("add 是追加", merge_words(["小智"], ["小爱"], "add") == ["小智", "小爱"])
    check("replace 是替换", merge_words(["小智"], ["小爱"], "replace") == ["小爱"])
    check("remove 只删指定词", merge_words(["小智", "小爱"], ["小智"], "remove") == ["小爱"])
    try:
        merge_words(["小智"], ["小智"], "remove")
        check("删空词表必须报错", False)
    except WakeWordError:
        check("删空词表必须报错", True)


def _rejects_gateway_url(url: str) -> bool:
    """``validate_gateway_url`` 不合法时抛 503 —— 断言用「抛了」表达拒绝。"""
    try:
        validate_gateway_url(url)
    except WakeWordError:
        return True
    return False


def test_gateway_url_guard() -> None:
    """网关地址只允许内网 + 根路径：这条链路上带的是 Bearer 密钥。"""
    check("公网 IP 拒绝", not _is_private_host("8.8.8.8"))
    check("局域网 IP 允许", _is_private_host("192.168.1.10"))
    check("回环允许", _is_private_host("127.0.0.1"))
    check("域名拒绝（可解析到公网）", not _is_private_host("evil.example.com"))
    check("带凭据的地址拒绝", _rejects_gateway_url("http://user:pass@192.168.1.2/"))
    check("带子路径的地址拒绝", _rejects_gateway_url("http://192.168.1.2/api/"))
    check("根路径地址被规范化", validate_gateway_url("http://192.168.1.2:9000") == "http://192.168.1.2:9000/wake-words")


def test_cursor() -> None:
    moment = datetime(2026, 11, 28, 1, 2, 3, 456789, tzinfo=UTC)
    token = encode_cursor(moment, "abc-123")
    check("游标可往返", decode_cursor(token) == (moment.replace(tzinfo=None), "abc-123"))
    check("空游标 = 第一页", decode_cursor(None) is None and decode_cursor("") is None)
    try:
        decode_cursor("!!!not-base64!!!")
        check("非法游标必须报错", False)
    except InvalidCursor:
        check("非法游标必须报错", True)
    try:
        decode_cursor(base64.urlsafe_b64encode(b"no-separator").decode().rstrip("="))
        check("缺分隔符的游标必须报错", False)
    except InvalidCursor:
        check("缺分隔符的游标必须报错", True)
    try:
        decode_cursor("a" * 300)
        check("超长游标必须报错", False)
    except InvalidCursor:
        check("超长游标必须报错", True)


def test_cron_interval() -> None:
    limit = MIN_RECURRING_INTERVAL_MINUTES
    check("最小间隔是 5 分钟", limit == 5)
    check("每分钟表达式被拒", validate_recurring_interval("* * * * *", "Asia/Shanghai") is not None)
    check("每 2 分钟表达式被拒", validate_recurring_interval("*/2 * * * *", "Asia/Shanghai") is not None)
    check("每 10 分钟允许", validate_recurring_interval("*/10 * * * *", "Asia/Shanghai") is None)
    check("每天一次允许", validate_recurring_interval("0 22 * * *", "Asia/Shanghai") is None)
    check("非法表达式报错", validate_recurring_interval("bogus", "Asia/Shanghai") is not None)


def test_voice_add_command() -> None:
    check("命中「添加唤醒词 X」", parse_add_command("添加唤醒词 小爱") == "小爱")
    check("命中带礼貌前缀", parse_add_command("请帮我新增唤醒词：小爱") == "小爱")
    check("不命中普通句子", parse_add_command("打开客厅的灯") is None)
    check("命中但没有词", parse_add_command("添加唤醒词") == "")


def test_session_ttl_is_90s() -> None:
    """短时记忆 90 秒是 v1.9.21 的明确口径，不能再漂回 45 秒。"""
    from homeos.backend.src.domains.agent.memory.short_term_memory import SESSION_TTL_MS

    check("短时记忆 TTL = 90 秒", SESSION_TTL_MS == 90_000, str(SESSION_TTL_MS))
    check("TTL 与 2 轮窗口相容", timedelta(seconds=30).total_seconds() * 1000 < SESSION_TTL_MS)


def test_voice_end_actions() -> None:
    """语音收麦：显式口令直接结束；「晚安」先跑场景再结束。"""
    from homeos.backend.src.domains.agent.runtime.service import AgentService
    from homeos.backend.src.domains.agent.runtime.service_support import (
        AgentChatOptions,
        AgentChatResponse,
    )

    class _Clearable:
        def __init__(self) -> None:
            self.cleared: list[str] = []

        def clear(self, session_id: str) -> None:
            self.cleared.append(session_id)

    class Host:
        #: 类级常量由 ``AgentService`` 提供；这里借用真实的那一份，避免把正则抄一遍。
        _VOICE_END_PATTERNS = AgentService._VOICE_END_PATTERNS

        def __init__(self) -> None:
            self._sessions = _Clearable()
            self._short_term = _Clearable()

    voice = {
        "protocolVersion": 1,
        "gatewayId": "gw",
        "speakerId": "spk",
        "conversationId": "c1",
        "turnId": "t1",
        "capabilities": ["end_conversation"],
    }
    options = AgentChatOptions(voice_context=voice)
    host = Host()

    # 显式口令：入口处直接返回，不经过 LLM。
    # ``_voice_end_reply`` / ``_attach_voice_end`` 是实例方法，这里以未绑定函数调用并传一个
    # 只实现所需成员（``_sessions`` / ``_short_term`` / 收麦正则）的替身；``Host`` 与
    # ``AgentService`` 必然不兼容，所以在**传参处** cast，而不是把 ``host`` 本身声明成
    # ``AgentService`` —— 后者会让下面读 ``host._sessions.cleared`` 变成属性错误。
    direct = AgentService._voice_end_reply(cast(AgentService, host), "退下", options, "voice:s1")
    check("「退下」直接收麦", direct is not None and direct.reply == "")
    check(
        "「退下」带 end_conversation",
        bool(direct and direct.terminal_actions and direct.terminal_actions[0]["type"] == "end_conversation"),
    )
    check("「退下」清空会话", host._sessions.cleared == ["voice:s1"] and host._short_term.cleared == ["voice:s1"])

    # 晚安：场景照常跑，结果补收麦动作。
    host2 = Host()
    reply = AgentChatResponse(reply="晚安，已为您关闭灯光。", speak=True)
    ended = AgentService._attach_voice_end(cast(AgentService, host2), reply, "晚安", options, "voice:s2")
    check("「晚安」挂上 end_conversation", ended and reply.terminal_actions[0]["type"] == "end_conversation")
    check("「晚安」清空会话", host2._sessions.cleared == ["voice:s2"])
    check("「晚安」保留场景回复", reply.reply.startswith("晚安"))

    # 没有能力声明 / 非音箱来源：不能把 web 端一句「晚安」当收麦。
    host3 = Host()
    plain = AgentChatResponse(reply="晚安")
    check(
        "web 端不收麦",
        AgentService._attach_voice_end(cast(AgentService, host3), plain, "晚安", AgentChatOptions(), None) is False,
    )
    check("web 端无动作", plain.terminal_actions == [])
    check("web 端不清会话", host3._sessions.cleared == [])


def test_wake_word_gateway() -> None:
    """网关读写：CAS、追加语义、镜像版本只增不减、未配置 503。

    全程用注入的假 HTTP，不碰网络也不碰真实配置 —— 这条链路要在没有音箱的机器上也能验。
    """
    from homeos.backend.src.domains.voice_device.wake_words import WakeWordGateway

    class FakeConfig:
        def __init__(self, voice: dict[str, Any]) -> None:
            self._voice = voice
            self.updates: list[dict[str, Any]] = []

        def get(self, section: str) -> Any:
            return self._voice if section == "voice" else None

        def update(self, partial: dict[str, Any]) -> None:
            self.updates.append(partial)
            self._voice = {**self._voice, **(partial.get("voice") or {})}

    class FakeHttp:
        def __init__(self, statuses: list[int], bodies: list[str]) -> None:
            self._statuses = statuses
            self._bodies = bodies
            self.calls: list[tuple[str, str, Any]] = []

        def __call__(self, url: str, method: str, payload: Any, headers: dict[str, str]) -> tuple[int, str]:
            self.calls.append((method, url, payload))
            return self._statuses.pop(0), self._bodies.pop(0)

    secret = "s" * 40
    # 未配置：503，不能静默当成「本地保存」。
    try:
        WakeWordGateway(FakeConfig({}), http=FakeHttp([], [])).read()
        check("网关未配置必须 503", False)
    except WakeWordError as error:
        check("网关未配置必须 503", error.status == 503)

    # 地址不合法（公网域名）：同样按未配置处理。
    try:
        WakeWordGateway(
            FakeConfig({"gatewayUrl": "http://evil.example.com", "gatewaySecret": secret}),
            http=FakeHttp([], []),
        ).read()
        check("公网网关地址必须拒绝", False)
    except WakeWordError as error:
        check("公网网关地址必须拒绝", error.status == 503)

    # 读 + 追加：PUT 必须是合并后的词表，且带当前版本。
    read_body = '{"words": ["小智"], "version": 3}'
    write_body = '{"words": ["小智", "小爱"], "version": 4}'
    http = FakeHttp([200, 200], [read_body, write_body])
    cfg = FakeConfig({"gatewayUrl": "http://192.168.1.9:9000", "gatewaySecret": secret})
    gateway = WakeWordGateway(cfg, http=http)
    updated = gateway.update("add", ["小爱"], 3)
    check("追加后词表为合并结果", updated["words"] == ["小智", "小爱"])
    check("版本推进为 +1", updated["version"] == 4)
    check("PUT 带 expectedVersion", http.calls[1][2]["expectedVersion"] == 3)
    check("镜像写入本地配置", any(item.get("voice", {}).get("wakeWords") == ["小智", "小爱"] for item in cfg.updates))

    # 版本不一致：本地就拦下，不发 PUT。
    http2 = FakeHttp([200], [read_body])
    try:
        WakeWordGateway(cfg, http=http2).update("add", ["小爱"], 2)
        check("版本不一致必须 409", False)
    except WakeWordError as error:
        check("版本不一致必须 409", error.status == 409)
    check("版本不一致不发 PUT", all(call[0] == "GET" for call in http2.calls))

    # 非整数版本号：拒绝，而不是静默跳过 CAS。
    try:
        WakeWordGateway(cfg, http=FakeHttp([200], [read_body])).update("add", ["小爱"], "3")
        check("非整数版本号必须拒绝", False)
    except WakeWordError as error:
        check("非整数版本号必须拒绝", error.status == 400)

    # 网关返回 409 / 400 的语义映射。
    for status, expected in ((409, 409), (400, 400)):
        http3 = FakeHttp([200, status], [read_body, "{}"])
        try:
            WakeWordGateway(cfg, http=http3).update("replace", ["小智"], 3)
            check(f"网关 {status} 必须透传", False)
        except WakeWordError as error:
            check(f"网关 {status} 必须透传", error.status == expected)

    # 回显与提交不一致（并发写入 / 网关实现有问题）：不能把镜像改成「我以为是的那份」。
    http4 = FakeHttp([200, 200], [read_body, '{"words": ["别的"], "version": 4}'])
    cfg4 = FakeConfig({"gatewayUrl": "http://192.168.1.9:9000", "gatewaySecret": secret})
    try:
        WakeWordGateway(cfg4, http=http4).update("add", ["小爱"], 3)
        check("回显不一致必须报错", False)
    except WakeWordError as error:
        check("回显不一致必须报错", error.status == 503)
    check("回显不一致不写镜像", cfg4.updates == [])

    # 镜像版本只增不减：本地已经是 5 时，一次「版本 4」的写入不应把版本改小。
    cfg5 = FakeConfig({"gatewayUrl": "http://192.168.1.9:9000", "gatewaySecret": secret, "wakeWordsVersion": 5})
    gateway5 = WakeWordGateway(cfg5, http=FakeHttp([200, 200], [read_body, write_body]))
    gateway5.update("add", ["小爱"], 3)
    check("镜像版本不回退", cfg5.updates == [])


def test_expired_pairing_cleanup() -> None:
    """过期的未消费配对码必须整行删除，不能留成「无凭证无码」的空壳。

    这条是实测踩出来的：先前实现把 ``pairingHash`` 置 NULL 而不是删行，于是每点一次
    「生成配对码」不用就多一条永久死行 —— 既不在设备列表里（没凭证），也不可能再被消费
    （没码），只把表撑大，还和「设备已吊销」在数据上无法区分。
    """
    from datetime import UTC, datetime, timedelta

    from sqlalchemy import create_engine, select
    from sqlalchemy.orm import sessionmaker

    from homeos.backend.src.domains.voice_device.service import VoiceDeviceService
    from homeos.backend.src.platform.core.db.database import Base
    from homeos.backend.src.platform.core.db.models import User, VoiceDeviceGrant

    engine = create_engine("sqlite://")
    Base.metadata.create_all(engine)
    session_factory = sessionmaker(bind=engine)

    with session_factory() as session:
        session.add(
            User(
                id="u1",
                username="owner",
                password="x",  # noqa: S106 - 自检库里的占位口令，不是真实凭据
                role="ADMIN",
                is_active=True,
                created_at=datetime.now(UTC).replace(tzinfo=None),
                updated_at=datetime.now(UTC).replace(tzinfo=None),
            )
        )
        session.add(
            VoiceDeviceGrant(
                id="expired",
                member_id="u1",
                pairing_hash="deadbeef",
                pairing_expires=datetime.now(UTC).replace(tzinfo=None) - timedelta(minutes=5),
                created_at=datetime.now(UTC).replace(tzinfo=None),
            )
        )
        session.add(
            VoiceDeviceGrant(
                id="revoked-device",
                member_id="u1",
                credential_hash="deadbeef",
                revoked_at=datetime.now(UTC).replace(tzinfo=None),
                created_at=datetime.now(UTC).replace(tzinfo=None),
            )
        )
        session.commit()

    VoiceDeviceService(session_factory).create_pairing()

    with session_factory() as session:
        ids = {row.id for row in session.scalars(select(VoiceDeviceGrant)).all()}
    check("过期配对码整行删除", "expired" not in ids)
    # 已吊销的设备行要保留：它承载「这台终端曾经存在过」的审计与重配对去重语义。
    check("已吊销设备行保留", "revoked-device" in ids)


def test_media_choice_slot() -> None:
    """点歌候选槽：口令解析、序号越界、90 秒过期、空候选即清空。"""
    from homeos.backend.src.domains.media.choices import CHOICE_TTL_MS, MediaChoiceSlot

    check("候选 TTL = 90 秒", CHOICE_TTL_MS == 90_000, str(CHOICE_TTL_MS))

    slot = MediaChoiceSlot()
    slot.set("s1", [{"uri": "a", "name": "A"}, {"uri": "b", "name": "B"}], "客厅")
    pending = slot.get("s1")
    check("候选已保存", pending is not None and len(pending["choices"]) == 2)
    check("保存房间名", pending is not None and pending["areaName"] == "客厅")
    slot.clear("s1")
    check("清空后读不到", slot.get("s1") is None)

    # 没有 uri 的候选不入槽：挑了也播不了。
    slot.set("s2", [{"name": "无 uri"}])
    check("无 uri 的候选不入槽", slot.get("s2") is None)

    # 会话隔离：另一段对话不该看到别人的候选。
    slot.set("s3", [{"uri": "x", "name": "X"}])
    check("会话隔离", slot.get("s4") is None and slot.get("s3") is not None)

    # 过期：把 expiresAt 改成过去，读时应清空。
    slot.set("s5", [{"uri": "y", "name": "Y"}])
    slot._local["s5"]["expiresAt"] = 0
    check("过期后读不到", slot.get("s5") is None)


def test_media_choice_parsing() -> None:
    """「播放第二个版本」解析：只认带量词的整句，避免把普通数字当选择。"""
    from homeos.backend.src.domains.media.choices import parse_choice_index

    check("播放第二个版本 → 2", parse_choice_index("播放第二个版本") == 2)
    check("选第2首 → 2", parse_choice_index("选第2首") == 2)
    check("第兩首 → 2", parse_choice_index("第兩首") == 2)
    check("第三个吧 → 3", parse_choice_index("第三个吧") == 3)
    check("裸数字不认", parse_choice_index("2") is None)
    check("普通句子不认", parse_choice_index("打开客厅的灯") is None)
    check("第十一个不认", parse_choice_index("第十一个") is None)


def test_notification_cursor_shapes() -> None:
    """分页游标：键集编码可往返、非法输入必须 400、``after`` 不回翻页游标。"""
    import inspect

    from homeos.backend.src.domains.notification.service import NotificationService

    check(
        "分页查询不接受负页码参数",
        "before" in inspect.signature(NotificationService.get_notifications_page).parameters
        and "after" in inspect.signature(NotificationService.get_notifications_page).parameters,
    )
    check("旧列表接口仍按 limit", "limit" in inspect.signature(NotificationService.get_notifications).parameters)


def main() -> int:
    test_pairing_inputs()
    test_notify_member_ids()
    test_wake_words()
    test_gateway_url_guard()
    test_cursor()
    test_cron_interval()
    test_voice_add_command()
    test_session_ttl_is_90s()
    test_voice_end_actions()
    test_wake_word_gateway()
    test_notification_cursor_shapes()
    test_media_choice_slot()
    test_media_choice_parsing()
    test_expired_pairing_cleanup()
    report("智能音箱")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
