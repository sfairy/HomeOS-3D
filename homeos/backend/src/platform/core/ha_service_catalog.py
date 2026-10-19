"""HA 服务白名单目录（单一事实来源）。

``ALLOWED_SERVICES`` 同时服务两条下发通道，避免两套白名单漂移：

- ``POST /ha/services/call``（原始 HA 服务代理，逐服务校验参数字段）；
- 智能管家 LLM 工具 ``control_device`` / ``control_room``（仅校验 ``domain.service``
  是否在册，字段级过滤由 ``sanitize_service_data`` 负责）。

LLM 若绕过白名单就能说出任意 ``domain.service``（如 ``light.reload`` /
``shell_command.turn_on``）直达 HA，故目录必须在工具层与 HTTP 层共用。

0.7.8 起从 23 个域扩到 43 个域：把 HA 里"有明确参数契约、且交互面板会用到"的服务
一次列全（语音 / 通知 / 日历 / 待办 / 天气 / 更新 / 摄像头 / AI 任务 …），
仍然**不**放行 ``reload`` / ``restart`` / ``shell_command`` 这类管理面服务。
"""

from __future__ import annotations

#: ``(domain, service) → 允许的附加字段集合``。
#: 字段为空集合表示该服务不接受任何参数。
ALLOWED_SERVICES: dict[tuple[str, str], set[str]] = {
    # ── 门锁（高危：语音侧另有 denylist 拦截，此处仅保留 HTTP 二次确认通道） ──
    ('lock', 'lock'): {'code'},
    ('lock', 'unlock'): {'code'},
    ('lock', 'open'): {'code'},
    # ── 通用开关类 ──────────────────────────────────────────────────────
    ('homeassistant', 'toggle'): set(),
    ('button', 'press'): set(),
    ('input_button', 'press'): set(),
    ('input_boolean', 'turn_on'): set(),
    ('input_boolean', 'turn_off'): set(),
    ('input_select', 'select_option'): {'option'},
    ('select', 'select_option'): {'option'},
    ('script', 'turn_on'): {'variables'},
    ('script', 'turn_off'): set(),
    # HA 场景实体（情景模式控件直接触发场景）
    ('scene', 'turn_on'): {'transition'},
    # ── 灯光 ────────────────────────────────────────────────────────────
    ('light', 'turn_on'): {
        'white',
        'hs_color',
        'xy_color',
        'rgb_color',
        'rgbw_color',
        'rgbww_color',
        'brightness',
        'brightness_pct',
        'transition',
        'color_temp_kelvin',
        'effect',
        'flash',
    },
    ('light', 'turn_off'): {'transition', 'flash'},
    # ── 开关 / 窗帘 ─────────────────────────────────────────────────────
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
    # ── 空调 ────────────────────────────────────────────────────────────
    ('climate', 'set_temperature'): {'temperature', 'target_temp_low', 'target_temp_high'},
    ('climate', 'turn_on'): set(),
    ('climate', 'turn_off'): set(),
    ('climate', 'set_humidity'): {'humidity'},
    ('climate', 'set_swing_horizontal_mode'): {'swing_horizontal_mode'},
    ('climate', 'set_hvac_mode'): {'hvac_mode'},
    ('climate', 'set_fan_mode'): {'fan_mode'},
    ('climate', 'set_swing_mode'): {'swing_mode'},
    ('climate', 'set_preset_mode'): {'preset_mode'},
    # ── 热水器 ──────────────────────────────────────────────────────────
    ('water_heater', 'turn_on'): set(),
    ('water_heater', 'turn_off'): set(),
    ('water_heater', 'set_temperature'): {'temperature'},
    ('water_heater', 'set_operation_mode'): {'operation_mode'},
    ('water_heater', 'set_away_mode'): {'away_mode'},
    # ── 风扇 ────────────────────────────────────────────────────────────
    ('fan', 'set_percentage'): {'percentage'},
    ('fan', 'oscillate'): {'oscillating'},
    ('fan', 'set_direction'): {'direction'},
    ('fan', 'set_preset_mode'): {'preset_mode'},
    ('fan', 'turn_on'): {'percentage'},
    ('fan', 'turn_off'): set(),
    # ── 数值 / 文本 / 日期时间输入 ───────────────────────────────────────
    ('number', 'set_value'): {'value'},
    ('input_number', 'set_value'): {'value'},
    ('text', 'set_value'): {'value'},
    ('date', 'set_value'): {'value'},
    ('time', 'set_value'): {'value'},
    ('datetime', 'set_value'): {'value'},
    # ── 媒体播放器 ──────────────────────────────────────────────────────
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
    ('media_player', 'play_media'): {'media_content_id', 'media_content_type', 'enqueue'},
    ('media_player', 'search_media'): {'search_query', 'media_content_id', 'media_content_type'},
    ('media_player', 'clear_playlist'): set(),
    ('media_player', 'join'): {'group_members'},
    ('media_player', 'unjoin'): set(),
    ('media_player', 'announce'): {'message', 'media_id'},
    ('media_player', 'turn_on'): set(),
    ('media_player', 'turn_off'): set(),
    # ── 扫地机 ──────────────────────────────────────────────────────────
    ('vacuum', 'start'): set(),
    ('vacuum', 'pause'): set(),
    ('vacuum', 'stop'): set(),
    ('vacuum', 'locate'): set(),
    ('vacuum', 'clean_spot'): set(),
    ('vacuum', 'turn_on'): set(),
    ('vacuum', 'turn_off'): set(),
    ('vacuum', 'return_to_base'): set(),
    ('vacuum', 'set_fan_speed'): {'fan_speed'},
    ('vacuum', 'send_command'): {'command', 'params'},
    ('vacuum', 'clean_area'): {'cleaning_area_id'},
    # ── 语音 / 通知 / AI / 遥控 ─────────────────────────────────────────
    ('stt', 'info'): set(),
    ('wake_word', 'info'): set(),
    ('radio_frequency', 'info'): set(),
    ('tts', 'speak'): {'media_player_entity_id', 'message', 'cache', 'options', 'language'},
    ('notify', 'send_message'): {'message', 'title'},
    ('conversation', 'process'): {'text', 'language', 'conversation_id', 'agent_id'},
    ('ai_task', 'generate_data'): {'task_name', 'instructions', 'structure', 'attachments'},
    ('ai_task', 'generate_image'): {'task_name', 'instructions', 'attachments'},
    ('image_processing', 'scan'): set(),
    ('assist_satellite', 'announce'): {
        'message',
        'media_id',
        'preannounce',
        'preannounce_media_id',
    },
    ('assist_satellite', 'ask_question'): {
        'question',
        'question_media_id',
        'answers',
        'preannounce',
        'preannounce_media_id',
    },
    ('assist_satellite', 'start_conversation'): {
        'start_message',
        'start_media_id',
        'extra_system_prompt',
        'preannounce',
        'preannounce_media_id',
    },
    ('remote', 'turn_on'): {'activity'},
    ('remote', 'turn_off'): {'activity'},
    ('remote', 'send_command'): {
        'device',
        'command',
        'num_repeats',
        'delay_secs',
        'hold_secs',
    },
    ('remote', 'learn_command'): {
        'device',
        'command',
        'command_type',
        'alternative',
        'timeout',
    },
    ('remote', 'delete_command'): {'device', 'command', 'command_type'},
    # ── 复合设备 ────────────────────────────────────────────────────────
    ('humidifier', 'turn_on'): {'humidity'},
    ('humidifier', 'turn_off'): set(),
    ('humidifier', 'set_humidity'): {'humidity'},
    ('humidifier', 'set_mode'): {'mode'},
    ('siren', 'turn_on'): {'tone', 'duration', 'volume_level'},
    ('siren', 'turn_off'): set(),
    ('valve', 'open_valve'): set(),
    ('valve', 'close_valve'): set(),
    ('valve', 'stop_valve'): set(),
    ('valve', 'set_valve_position'): {'position'},
    ('lawn_mower', 'start_mowing'): set(),
    ('lawn_mower', 'pause'): set(),
    ('lawn_mower', 'dock'): set(),
    ('alarm_control_panel', 'alarm_arm_home'): {'code'},
    ('alarm_control_panel', 'alarm_arm_away'): {'code'},
    ('alarm_control_panel', 'alarm_arm_night'): {'code'},
    ('alarm_control_panel', 'alarm_arm_vacation'): {'code'},
    ('alarm_control_panel', 'alarm_arm_custom_bypass'): {'code'},
    ('alarm_control_panel', 'alarm_disarm'): {'code'},
    ('alarm_control_panel', 'alarm_trigger'): {'code'},
    # ── 摄像头 ──────────────────────────────────────────────────────────
    ('camera', 'turn_on'): set(),
    ('camera', 'turn_off'): set(),
    # ── 日历 / 待办 / 天气 / 更新 ───────────────────────────────────────
    ('calendar', 'list_events'): {'start', 'end'},
    ('calendar', 'create_event'): {
        'summary',
        'start_date',
        'end_date',
        'start_date_time',
        'end_date_time',
        'description',
        'location',
    },
    ('calendar', 'delete_event'): {'uid', 'recurrence_id', 'recurrence_range'},
    ('calendar', 'update_event'): {'uid', 'event', 'recurrence_id', 'recurrence_range'},
    ('todo', 'get_items'): {'status'},
    ('todo', 'add_item'): {'item', 'due_date', 'due_datetime', 'description'},
    ('todo', 'remove_item'): {'item'},
    ('todo', 'update_item'): {'item', 'rename', 'status', 'due_date', 'due_datetime', 'description'},
    ('todo', 'move_item'): {'uid', 'previous_uid'},
    ('todo', 'remove_completed_items'): set(),
    ('weather', 'get_forecasts'): {'type'},
    ('update', 'release_notes'): set(),
    ('update', 'skip'): set(),
    ('update', 'clear_skipped'): set(),
    ('update', 'install'): {'version', 'backup'},
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

#: 前端实体面板「可切换」域（``homeassistant.toggle`` 只对这些域放行）。
#: 原先住在 ``panel/action_rules.py``：那是面板动作规则的名字，但 ``/ha/services/call``
#: 与 3D 模块的校验都要用它 —— 一次 toggle 判定不该把 ``api``/``modules`` 拉去 import ``panel``。
TOGGLE_ENTITY_DOMAINS = frozenset(
    {
        'fan',
        'cover',
        'light',
        'button',
        'remote',
        'script',
        'switch',
        'climate',
        'automation',
        'media_player',
        'water_heater',
        'input_boolean',
        'humidifier',
        'siren',
        'valve',
        'lawn_mower',
        'camera',
    }
)

#: 智能管家额外放行的 ``scene`` / ``script`` 触发（HA 场景标准动作）；
#: 语音侧另有「场景语音控制」允许清单闸门兜底。
#:
#: 补上 ``high_risk_denylist.SAFE_BULK_CONTROL_DOMAINS`` 里但不在 HTTP 原始代理
#: 白名单中的域（humidifier / air_purifier / dehumidifier / fan_fresh_air）：
#: 批量控制路径也会遍历这些域，只按 HTTP 目录判定会挡掉既有能力。
#: 测试脚本会校验两处清单不漂移。
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
    'TOGGLE_ENTITY_DOMAINS',
    'agent_service_allowed',
    'service_allowed',
]
