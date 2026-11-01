"""服务调用的重放安全判定（从 ``integration.client`` 拆出）。

重试的判据只有一条：**重复下发是否等价于下发一次**。这把尺子横跨两张表（服务名 /
整域），还带一段顺序敏感的判定逻辑，留在 ``client.py`` 里会被 HTTP 主干淹没。
"""

from __future__ import annotations

#: 动作型服务：每次执行都会改变状态，传输层失败后重放可能把用户意图反转。
_NON_IDEMPOTENT_SERVICES = frozenset(
    {
        "play_pause",
        "media_play_pause",
        "next",
        "previous",
        "next_track",
        "previous_track",
        "cycle",
        "increase_speed",
        "decrease_speed",
        "play_media",
        "send_command",
        "speak",
        "say",
        "process",
        "trigger",
        "run",
        "call_service",
        "reload",
        "restart",
    }
)

#: 整域一律不重试：这些域里的服务**绝大多数**是「做一件事」而不是「把某个状态设成 X」，
#: 重复执行 = 重复副作用（重复开锁 / 重复布防 / 重复推送通知）。
#:
#: 按服务名列举救不了这条：``script.turn_on``、``automation.trigger``、``notify.*``、
#: ``tts.speak`` 的名字里都没有 ``toggle``/``play_pause``，旧实现因此把它们全判成可安全
#: 重放，而重试场景恰恰是「请求可能已经写出去了」（keep-alive 复用连接上的
#: ``RemoteProtocolError``）。宁可失败一次让上层如实报错，也不能让「离家场景」把门锁开两遍。
#:
#: ``media_player`` 虽然也有 ``volume_set`` 这类幂等服务，但同一域里 ``play_media`` /
#: ``media_next`` 会在被重放时跳过一首歌 —— 一域之内两种语义并存时，按域保守处理。
_NON_IDEMPOTENT_DOMAINS = frozenset(
    {
        "script",
        "automation",
        "notify",
        "remote",
        "tts",
        "media_player",
        "number",
        "alarm_control_panel",
        "camera",
        "siren",
        "button",
        "shell_command",
        "conversation",
        "assist_satellite",
        "ai_task",
        "update",
        "persistent_notification",
        "todo",
        "calendar",
        "valve",
    }
)

#: 显式幂等的服务名：写的是「设成某个值」而不是「做一件事」，重复下发结果相同。
#: 这一层比域更细，且排在域判断**之后** —— ``script.turn_on`` 不会被这里救回来。
_IDEMPOTENT_SERVICES = frozenset(
    {
        "turn_on",
        "turn_off",
        "set_cover_position",
        "set_cover_tilt_position",
        "set_temperature",
        "set_hvac_mode",
        "set_fan_mode",
        "set_humidity",
        "set_preset_mode",
        "set_swing_mode",
        "select_option",
        "select_source",
        "volume_set",
        "volume_mute",
        "repeat_set",
        "set_value",
    }
)


def _service_call_retry_safe(domain: str, service: str) -> bool:
    """该服务在 HA 层面是否幂等（重复下发不会产生额外副作用）。

    判定顺序本身就是结论：**域先于服务名**。``script.turn_on`` 与 ``light.turn_on``
    服务名完全相同，语义却是「把脚本跑一遍」和「把灯打开」—— 前者重放会跑两遍。
    旧实现只看服务名，于是所有 ``*_turn_on`` 都被当成可重放。

    都不命中时按**可重试**处理，保持原有宽松口径：能到达这一层的服务已被白名单目录
    限定过，把未知项一律判成不可重试只会让网络抖动时的失败率翻倍。
    """
    if domain in _NON_IDEMPOTENT_DOMAINS:
        return False
    if service.startswith("toggle") or service.endswith("_toggle"):
        # ``toggle`` 语义本身就是「读当前态再取反」，第二次执行等于撤销第一次。
        return False
    if service in _IDEMPOTENT_SERVICES:
        return True
    return service not in _NON_IDEMPOTENT_SERVICES
