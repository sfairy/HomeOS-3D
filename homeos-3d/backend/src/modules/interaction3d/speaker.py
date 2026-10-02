'''Capability and argument validation for a bound media-player speaker.'''
import math
from fastapi import HTTPException
FEATURES = {
    'media_pause': 1,
    'media_seek': 2,
    'volume_set': 4,
    'volume_mute': 8,
    'media_previous_track': 16,
    'media_next_track': 32,
    'turn_on': 128,
    'turn_off': 256,
    'play_media': 512,
    'volume_up': 1024,
    'volume_down': 1024,
    'select_source': 2048,
    'media_stop': 4096,
    'media_play': 16384,
    'shuffle_set': 32768,
    'select_sound_mode': 65536,
    'repeat_set': 262144 }
FIELDS = {
    'seek_position': 'media_seek',
    'volume_level': 'volume_set',
    'is_volume_muted': 'volume_mute',
    'source': 'select_source',
    'sound_mode': 'select_sound_mode',
    'shuffle': 'shuffle_set',
    'repeat': 'repeat_set' }


def validate_speaker_command(service, data, state):
    def fail(message='智能音响不支持此操作或参数。'):
        raise HTTPException(422, detail = message)

    state = state or { }
    if state.get('available') is False or state.get('state') in {None, '', 'unknown', 'unavailable'}:
        raise HTTPException(409, detail = '智能音响不可用，请稍后重试。')
    attrs = state.get('attributes') or { }
    features = attrs.get('supported_features', 0)
    if service not in FEATURES or not isinstance(features, int) or isinstance(features, bool) or not features & FEATURES[service]:
        fail('此媒体实体不支持该操作。')
    if service != 'turn_on' and state.get('state') in {'off', 'standby'}:
        raise HTTPException(409, detail = '请先开启智能音响。')
    expected = {'media_content_id', 'media_content_type'} if service == 'play_media' else {FIELDS[service]} if service in FIELDS else set()
    if not isinstance(data, dict) or set(data) != expected:
        fail()

    def number(value):
        return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value)

    if service == 'volume_set' and (not number(data['volume_level']) or not 0 <= data['volume_level'] <= 1):
        fail()
    if service == 'media_seek':
        duration, position = attrs.get('media_duration'), data['seek_position']
        if not number(duration) or duration <= 0 or not number(position) or not 0 <= position <= duration:
            fail('当前媒体不支持此进度位置。')
    if service in {'shuffle_set', 'volume_mute'}:
        if not isinstance(data[FIELDS[service]], bool):
            fail()
    if service in {'select_source', 'select_sound_mode'}:
        choices = attrs.get('source_list' if service == 'select_source' else 'sound_mode_list', [ ])
        value = data[FIELDS[service]]
        if not isinstance(value, str) or not isinstance(choices, list) or value not in choices:
            fail('此选项已不可用，请刷新设备状态。')
    if service == 'repeat_set':
        if not isinstance(data['repeat'], str) or data['repeat'] not in {'all', 'off', 'one'}:
            fail()
    if service == 'play_media':
        if any(not isinstance(data[key], str) or not data[key].strip() or len(data[key]) > limit for key, limit in (('media_content_id', 2048), ('media_content_type', 128))):
            fail()
