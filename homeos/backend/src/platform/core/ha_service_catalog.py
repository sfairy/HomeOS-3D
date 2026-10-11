"""HA 服务白名单目录（单一事实来源）。

同一份 ``ALLOWED_SERVICES`` 同时被两条下发通道使用，避免两套白名单漂移：

- ``api/ha.py`` 的 ``POST /ha/services/call``（原始 HA 服务代理，逐服务校验参数字段）；
- ``services/agent/tools/home_tools_service.py`` 的 ``control_device`` / ``control_room``
  （智能管家 LLM 工具，仅校验 ``domain.service`` 是否在册，字段级过滤由
  ``tool_args_validator.sanitize_service_data`` 负责）。

为何要收敛：智能管家此前**完全绕过**服务白名单，LLM 可以说出任意
``domain.service``（如 ``light.reload`` / ``shell_command.turn_on``）直达 HA。
这里把白名单提到 core 层，让工具层与 HTTP 层共用同一份目录。
"""

from __future__ import annotations

#: ``(domain, service) → 允许的附加字段集合``。
#: 字段为空集合表示该服务不接受任何参数。
ALLOWED_SERVICES: dict[tuple[str, str], set[str]] = {
    # 门锁（高危：语音侧另有 denylist 拦截，此处仅保留 HTTP 二次确认通道）
    ('lock', 'lock'): {'code'},
    ('lock', 'unlock'): {'code'},
    ('lock', 'open'): {'code'},
    # 通用开关类
    ('homeassistant', 'toggle'): set(),
    ('button', 'press'): set(),
    ('input_button', 'press'): set(),
    ('input_boolean', 'turn_on'): set(),
    ('input_boolean', 'turn_off'): set(),
    ('input_select', 'select_option'): {'option'},
    ('select', 'select_option'): {'option'},
    ('script', 'turn_on'): set(),
    # 灯光
    ('light', 'turn_on'): {
        'white',
        'hs_color',
        'rgb_color',
        'brightness',
        'transition',
        'brightness_pct',
        'color_temp_kelvin',
    },
    ('light', 'turn_off'): {'transition'},
    # 开关 / 窗帘
    ('switch', 'turn_on'): set(),
    ('switch', 'turn_off'): set(),
    ('cover', 'open_cover'): set(),
    ('cover', 'close_cover'): set(),
    ('cover', 'stop_cover'): set(),
    ('cover', 'set_cover_position'): {'position'},
    ('cover', 'open_cover_tilt'): set(),
    ('cover', 'close_cover_tilt'): set(),
    ('cover', 'stop_cover_tilt'): set(),
    ('cover', 'set_cover_tilt_position'): {'tilt_position'},
    # 空调
    ('climate', 'set_temperature'): {'temperature', 'target_temp_low', 'target_temp_high'},
    ('climate', 'turn_on'): set(),
    ('climate', 'turn_off'): set(),
    ('climate', 'set_swing_horizontal_mode'): {'swing_horizontal_mode'},
    ('climate', 'set_hvac_mode'): {'hvac_mode'},
    ('climate', 'set_fan_mode'): {'fan_mode'},
    ('climate', 'set_swing_mode'): {'swing_mode'},
    ('climate', 'set_preset_mode'): {'preset_mode'},
    # 热水器
    ('water_heater', 'turn_on'): set(),
    ('water_heater', 'turn_off'): set(),
    ('water_heater', 'set_temperature'): {'temperature'},
    ('water_heater', 'set_operation_mode'): {'operation_mode'},
    ('water_heater', 'set_away_mode'): {'away_mode'},
    # 风扇
    ('fan', 'set_percentage'): {'percentage'},
    ('fan', 'oscillate'): {'oscillating'},
    ('fan', 'set_direction'): {'direction'},
    ('fan', 'set_preset_mode'): {'preset_mode'},
    ('fan', 'turn_on'): set(),
    ('fan', 'turn_off'): set(),
    # 数值类
    ('number', 'set_value'): {'value'},
    ('input_number', 'set_value'): {'value'},
    # 媒体播放器
    ('media_player', 'media_play_pause'): set(),
    ('media_player', 'media_play'): set(),
    ('media_player', 'media_pause'): set(),
    ('media_player', 'media_stop'): set(),
    ('media_player', 'media_previous_track'): set(),
    ('media_player', 'media_next_track'): set(),
    ('media_player', 'volume_up'): set(),
    ('media_player', 'volume_down'): set(),
    ('media_player', 'media_seek'): {'seek_position'},
    ('media_player', 'shuffle_set'): {'shuffle'},
    ('media_player', 'repeat_set'): {'repeat'},
    ('media_player', 'volume_set'): {'volume_level'},
    ('media_player', 'volume_mute'): {'is_volume_muted'},
    ('media_player', 'select_source'): {'source'},
    ('media_player', 'select_sound_mode'): {'sound_mode'},
    ('media_player', 'play_media'): {'media_content_id', 'media_content_type'},
    ('media_player', 'turn_on'): set(),
    ('media_player', 'turn_off'): set(),
    # 扫地机
    ('vacuum', 'start'): set(),
    ('vacuum', 'pause'): set(),
    ('vacuum', 'stop'): set(),
    ('vacuum', 'locate'): set(),
    ('vacuum', 'clean_spot'): set(),
    ('vacuum', 'turn_on'): set(),
    ('vacuum', 'turn_off'): set(),
    ('vacuum', 'return_to_base'): set(),
    ('vacuum', 'set_fan_speed'): {'fan_speed'},
}

#: 智能管家额外放行的 ``toggle`` 域：工具 schema 明确告诉 LLM
#: 「input_boolean 类开关用 service=toggle」，且前端实体面板对可切换域也走 toggle。
#: 仅对下列域放行，避免 toggle 变成绕过 turn_on/turn_off 语义的通用开关。
AGENT_TOGGLE_DOMAINS = frozenset(
    {
        'homeassistant',
        'input_boolean',
        'light',
        'switch',
        'fan',
        'media_player',
        'vacuum',
    }
)

#: 智能管家额外放行的 ``scene`` / ``script`` 触发（HA 场景标准动作）；
#: 语音侧另有「场景语音控制」允许清单闸门兜底。
#:
#: 另外补上 ``high_risk_denylist.SAFE_BULK_CONTROL_DOMAINS`` 里但不在 HTTP 原始代理
#: 白名单中的域（humidifier / air_purifier / dehumidifier / fan_fresh_air）。
#: 这些域此前可由 LLM 直接开关（批量控制路径也会遍历到），若只按 HTTP 目录判定会
#: 反而挡掉既有能力。测试脚本会校验两处清单不漂移。
AGENT_EXTRA_SERVICES: dict[tuple[str, str], set[str]] = {
    ('scene', 'turn_on'): set(),
    ('script', 'turn_on'): set(),
    ('humidifier', 'turn_on'): set(),
    ('humidifier', 'turn_off'): set(),
    ('air_purifier', 'turn_on'): set(),
    ('air_purifier', 'turn_off'): set(),
    ('dehumidifier', 'turn_on'): set(),
    ('dehumidifier', 'turn_off'): set(),
    ('fan_fresh_air', 'turn_on'): set(),
    ('fan_fresh_air', 'turn_off'): set(),
}


def service_allowed(domain: str, service: str) -> bool:
    """HTTP ``/ha/services/call`` 通道的白名单判定。"""
    return (str(domain or '').strip().lower(), str(service or '').strip().lower()) in ALLOWED_SERVICES


def agent_service_allowed(domain: str, service: str) -> bool:
    """智能管家工具通道的白名单判定（在 HTTP 目录基础上叠加 toggle / scene 例外）。"""
    key = (str(domain or '').strip().lower(), str(service or '').strip().lower())
    if key in ALLOWED_SERVICES or key in AGENT_EXTRA_SERVICES:
        return True
    return key[1] == 'toggle' and key[0] in AGENT_TOGGLE_DOMAINS


__all__ = [
    'AGENT_EXTRA_SERVICES',
    'AGENT_TOGGLE_DOMAINS',
    'ALLOWED_SERVICES',
    'agent_service_allowed',
    'service_allowed',
]
