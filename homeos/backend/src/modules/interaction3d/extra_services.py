"""语音 / 通知 / AI / 遥控类附加卡的服务参数校验。

这些域的"服务名 + 参数"是 HA 自己的契约，前端只是把用户点选翻译成一次
``call_service``。本模块只做两件事：

1. **白名单**：域、服务、参数字段必须都在表里（``SPECS``）；
2. **取值约束**：文本长度、数值区间、枚举与实体归属（例如 TTS 的播放设备
   必须是 ``media_player.*``）。

不允许的字段一律 ``required / optional`` 之外的键，避免把拼错的参数静默透传。
"""

from __future__ import annotations

import re
from typing import Any, NoReturn

from fastapi import HTTPException

from .capabilities import string_options
from .climate import _number

#: 本校验器负责的域。
SERVICE_DOMAINS = frozenset(
    {
        'stt',
        'tts',
        'notify',
        'remote',
        'ai_task',
        'infrared',
        'wake_word',
        'conversation',
        'radio_frequency',
        'assist_satellite',
        'image_processing',
    }
)
#: TTS 的播放设备必须是媒体实体。
MEDIA_PLAYER_PATTERN = re.compile(r'media_player\.[a-z0-9_]+')
#: 遥控命令类型。
COMMAND_TYPES = frozenset({'ir', 'rf'})
#: 遥控数值参数上限（HA 把这些当"秒 / 次数"，超过就是误输入）。
REMOTE_NUMERIC_LIMITS: dict[str, float] = {
    'num_repeats': 255,
    'delay_secs': 60,
    'hold_secs': 60,
    'timeout': 60,
}
#: 常用文本长度。
TEXT_SHORT = 512
TEXT_MEDIUM = 1024
TEXT_LONG = 2048
INSTRUCTIONS_LIMIT = 32768
COMMAND_LIMIT = 64


def _bad(message: str = '此实体不支持该操作或参数。') -> NoReturn:
    raise HTTPException(422, detail=message)


def _text(value: Any, limit: int) -> bool:
    return isinstance(value, str) and 0 < len(value) <= limit


def _optional_text(data: dict, key: str, limit: int) -> None:
    if key in data and not _text(data[key], limit):
        _bad()


def _numbers(data: dict) -> None:
    for key, limit in REMOTE_NUMERIC_LIMITS.items():
        if key not in data:
            continue
        value = data[key]
        if not _number(value) or not 0 <= value <= limit:
            _bad()


def _media_pairs(value: Any) -> bool:
    """``attachments`` / ``answers`` 的媒体对：``media_content_id`` + 可选类型。"""
    if value is None:
        return True
    if not isinstance(value, list):
        return False
    for item in value:
        if not isinstance(item, dict) or set(item) - {'media_content_id', 'media_content_type'}:
            return False
        if not _text(item.get('media_content_id'), TEXT_LONG):
            return False
        media_type = item.get('media_content_type')
        if media_type is not None and not _text(media_type, COMMAND_LIMIT):
            return False
    return True


def _validate_notify(data: dict) -> None:
    if not _text(data.get('message'), TEXT_LONG):
        _bad()
    _optional_text(data, 'title', TEXT_MEDIUM)


def _validate_conversation(data: dict) -> None:
    if not _text(data.get('text'), TEXT_SHORT):
        _bad()
    _optional_text(data, 'language', COMMAND_LIMIT)
    _optional_text(data, 'conversation_id', TEXT_SHORT)


def _validate_image_processing(data: dict) -> None:
    # ``scan`` 不接受参数：图像识别由实体自身配置决定。
    if data:
        _bad()


def _validate_ai_task(service: str, data: dict) -> None:
    if not _text(data.get('task_name'), TEXT_SHORT):
        _bad()
    _optional_text(data, 'instructions', INSTRUCTIONS_LIMIT)
    if 'structure' in data:
        if service != 'generate_data' or not isinstance(data['structure'], dict):
            _bad()
    if 'attachments' in data and not _media_pairs(data['attachments']):
        _bad()


def _validate_assist_satellite(service: str, data: dict) -> None:
    if service == 'announce':
        allowed = {'message', 'media_id', 'preannounce', 'preannounce_media_id'}
        if set(data) - allowed or not (
            _text(data.get('message'), TEXT_LONG) or _text(data.get('media_id'), TEXT_LONG)
        ):
            _bad('请填写播报内容或媒体 ID。')
        _optional_text(data, 'preannounce', TEXT_MEDIUM)
        _optional_text(data, 'preannounce_media_id', TEXT_LONG)
        return
    if service == 'start_conversation':
        allowed = {'preannounce', 'start_message', 'start_media_id', 'extra_system_prompt', 'preannounce_media_id'}
        if set(data) - allowed:
            _bad()
        _optional_text(data, 'start_message', TEXT_MEDIUM)
        _optional_text(data, 'start_media_id', TEXT_LONG)
        _optional_text(data, 'extra_system_prompt', INSTRUCTIONS_LIMIT)
        _optional_text(data, 'preannounce', TEXT_MEDIUM)
        _optional_text(data, 'preannounce_media_id', TEXT_LONG)
        return
    # ask_question
    allowed = {'answers', 'question', 'preannounce', 'question_media_id', 'preannounce_media_id'}
    if set(data) - allowed or not (
        _text(data.get('question'), TEXT_MEDIUM) or _text(data.get('question_media_id'), TEXT_LONG)
    ):
        _bad()
    answers = data.get('answers')
    if answers is not None:
        if not isinstance(answers, list):
            _bad()
        for answer in answers:
            if (
                not isinstance(answer, dict)
                or set(answer) != {'id', 'sentences'}
                or not _text(answer['id'], TEXT_SHORT)
                or not isinstance(answer['sentences'], list)
                or not answer['sentences']
                or any(not _text(sentence, TEXT_MEDIUM) for sentence in answer['sentences'])
            ):
                _bad()
    _optional_text(data, 'preannounce', TEXT_MEDIUM)
    _optional_text(data, 'preannounce_media_id', TEXT_LONG)


def _validate_remote(service: str, data: dict) -> None:
    if service in ('turn_on', 'turn_off'):
        if set(data) - {'activity'}:
            _bad()
        activity = data.get('activity')
        if activity is not None and (
            not isinstance(activity, str) or activity not in string_options(data.get('activity_list'))
        ):
            _bad()
        return
    allowed = {
        'send_command': {'device', 'command', 'hold_secs', 'delay_secs', 'num_repeats'},
        'learn_command': {'device', 'command', 'timeout', 'alternative', 'command_type'},
        'delete_command': {'device', 'command', 'command_type'},
    }[service]
    if set(data) - allowed:
        _bad()
    if 'command' in data and not _text(data['command'], COMMAND_LIMIT):
        _bad()
    if 'device' in data and not _text(data['device'], TEXT_SHORT):
        _bad()
    command_type = data.get('command_type')
    if command_type is not None and command_type not in COMMAND_TYPES:
        _bad()
    alternative = data.get('alternative')
    if alternative is not None and not isinstance(alternative, bool):
        _bad()
    _numbers(data)


def _validate_tts(data: dict) -> None:
    if not _text(data.get('message'), TEXT_LONG):
        _bad()
    speaker = data.get('media_player_entity_id')
    if not isinstance(speaker, str) or MEDIA_PLAYER_PATTERN.fullmatch(speaker) is None:
        _bad('请选择播放设备。')
    if 'cache' in data and not isinstance(data['cache'], bool):
        _bad()
    if 'options' in data and not isinstance(data['options'], dict):
        _bad()
    _optional_text(data, 'language', COMMAND_LIMIT)


def validate_service_extra(domain: str, service: str, data: Any, state: Any) -> None:
    """校验语音 / 通知 / AI / 遥控类附加命令。"""
    if domain not in SERVICE_DOMAINS or not isinstance(data, dict):
        _bad()
    if domain == 'notify':
        if service != 'send_message' or set(data) - {'message', 'title'}:
            _bad()
        _validate_notify(data)
        return
    if domain == 'tts':
        if service != 'speak' or set(data) - {'media_player_entity_id', 'message', 'cache', 'options', 'language'}:
            _bad()
        _validate_tts(data)
        return
    if domain == 'conversation':
        if service != 'process' or set(data) - {'text', 'language', 'conversation_id'}:
            _bad()
        _validate_conversation(data)
        return
    if domain == 'ai_task':
        if service not in ('generate_data', 'generate_image') or set(data) - {
            'task_name',
            'instructions',
            'structure',
            'attachments',
        }:
            _bad()
        _validate_ai_task(service, data)
        return
    if domain == 'assist_satellite':
        if service not in ('announce', 'start_conversation', 'ask_question'):
            _bad()
        _validate_assist_satellite(service, data)
        return
    if domain in ('remote', 'infrared'):
        if service not in ('turn_on', 'turn_off', 'send_command', 'learn_command', 'delete_command'):
            _bad()
        _validate_remote(service, data)
        return
    if domain == 'image_processing':
        if service != 'scan':
            _bad()
        _validate_image_processing(data)
        return
    # stt / wake_word / radio_frequency：只读信息类动作，服务名统一为 ``info``。
    if service != 'info' or data:
        _bad()
