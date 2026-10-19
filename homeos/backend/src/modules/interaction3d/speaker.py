'''对已绑定的媒体播放器音箱进行能力和参数校验。'''
import math
import re

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
    'clear_playlist': 8192,
    'media_play': 16384,
    'shuffle_set': 32768,
    'select_sound_mode': 65536,
    'repeat_set': 262144,
    'join': 524288,
    'unjoin': 524288,
    'search_media': 4194304,
}
#: ``play_media`` 的追加/播报能力位（0.7.8 新增的两个参数）。
MEDIA_ENQUEUE_FEATURE = 2097152
MEDIA_ANNOUNCE_FEATURE = 1048576
#: ``play_media.enqueue`` 的取值（HA 的排队方式）。
ENQUEUE_MODES = frozenset({'add', 'next', 'play', 'replace'})
#: 播放组成员上限。
GROUP_MEMBERS_LIMIT = 32
#: 搜索词上限。
SEARCH_QUERY_LIMIT = 512
#: 媒体实体 id 的形态（播放组成员必须是音箱）。
MEDIA_PLAYER_PATTERN = re.compile(r'media_player\.[a-z0-9_]+')
FIELDS = {
    'seek_position': 'media_seek',
    'volume_level': 'volume_set',
    'is_volume_muted': 'volume_mute',
    'source': 'select_source',
    'sound_mode': 'select_sound_mode',
    'shuffle': 'shuffle_set',
    'repeat': 'repeat_set' }

#: 只带固定参数的"无参"服务。
NO_ARGUMENT_SERVICES = frozenset({'clear_playlist', 'join', 'unjoin', 'search_media'})
#: 服务 → 允许的参数集合（``play_media`` 的可选参数单独处理）。
SERVICE_FIELDS = {
    'media_seek': {'seek_position'},
    'volume_set': {'volume_level'},
    'volume_mute': {'is_volume_muted'},
    'select_source': {'source'},
    'select_sound_mode': {'sound_mode'},
    'shuffle_set': {'shuffle'},
    'repeat_set': {'repeat'},
    'join': {'group_members'},
    'search_media': {'search_query'},
}


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
    if not isinstance(data, dict):
        fail()
    if service == 'play_media':
        # ``enqueue`` / ``announce`` 是 0.7.8 新增的可选参数。
        if not {'media_content_id', 'media_content_type'} <= set(data):
            fail()
        if set(data) - {'media_content_id', 'media_content_type', 'enqueue', 'announce'}:
            fail()
    else:
        expected = (
            {'group_members'}
            if service == 'join'
            else {'search_query'}
            if service == 'search_media'
            else set()
            if service in ('clear_playlist', 'unjoin')
            else {FIELDS[service]}
            if service in FIELDS
            else set()
        )
        if set(data) != expected:
            fail()

    def number(value):
        return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value)

    if service == 'volume_set' and (not number(data['volume_level']) or not 0 <= data['volume_level'] <= 1):
        fail()
    if service == 'media_seek':
        duration, position = attrs.get('media_duration'), data['seek_position']
        if duration is None or not number(duration) or duration <= 0 or position is None or not number(position) or not 0 <= position <= duration:
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
        # 排队方式：能力位 + 枚举双重判定（老固件可能上报了位但只支持一部分）。
        if 'enqueue' in data:
            if (
                not features & MEDIA_ENQUEUE_FEATURE
                or not isinstance(data['enqueue'], str)
                or data['enqueue'] not in ENQUEUE_MODES
            ):
                fail()
        if 'announce' in data and (
            not features & MEDIA_ANNOUNCE_FEATURE or not isinstance(data['announce'], bool)
        ):
            fail()
        # "排队播放"和"临时播报"是互斥语义：同时指定时 HA 会忽略其中一个。
        if 'enqueue' in data and 'announce' in data:
            fail('队列与临时播报不能同时指定。')
    if service == 'search_media':
        query = data.get('search_query')
        if not isinstance(query, str) or not query.strip() or len(query) > SEARCH_QUERY_LIMIT:
            fail()
    if service == 'join':
        members = data.get('group_members')
        if (
            not isinstance(members, list)
            or not members
            or len(members) > GROUP_MEMBERS_LIMIT
            or any(
                not isinstance(member, str) or MEDIA_PLAYER_PATTERN.fullmatch(member) is None
                for member in members
            )
        ):
            fail('播放组成员无效，请刷新设备状态。')
