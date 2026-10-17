"""security 分区校验：告警卡片、摄像头、人体感应。

判定顺序：``ctx.fail()`` 立即抛 422，所以顺序不影响结果。非字符串的实体 id、缺失
``id`` / ``floorId`` 的告警卡片一律按不合规处理（422），不能让 ``TypeError`` /
``KeyError`` 冒成 500。
"""

from __future__ import annotations

import re
from itertools import pairwise
from typing import Any

from .config_ctx import MDI_ICON_PATTERN, EnumSpec, ValidationContext
from .lock import validate_lock_bindings
from ...domains.proxy.go2rtc_target import normalize_go2rtc_target

# ── 白名单与判定表 ─────────────────────────────────────────────────────────

#: ``security`` 分区允许出现的集合。
SECURITY_SECTIONS = frozenset({'presenceSensors', 'cameras', 'locks', 'alarms'})

#: 告警卡片数量上限。
MAX_ALARMS = 100
#: 告警卡片字段白名单。
ALARM_FIELDS = frozenset(
    {
        'id',
        'kind',
        'floorId',
        'x',
        'y',
        'height',
        'size',
        'fontSize',
        'opacity',
        'label',
        'entityId',
        'secondaryEntityId',
        'batteryEntityId',
        'visible',
        'modelId',
        'workStateEntityId',
        'theme',
        'overlay',
        'icon',
        'iconSize',
        'hitSize',
        'buttonHidden',
        'hiddenClickable',
        'focusCamera',
        'cardWidth',
    }
)
#: 告警类型枚举（缺字段即不合规，因此默认值取空串）。
ALARM_KIND = EnumSpec('kind', ('moisture', 'smoke', 'gas'), '')
#: 告警主题枚举。
ALARM_THEME = EnumSpec('theme', ('default', 'warm-wood'), 'default')
#: 主实体：按类型区分可接受的域（烟雾额外接受 ``event.*``）。
ALARM_ENTITY_PATTERNS: dict[str, re.Pattern[str]] = {
    'gas': re.compile(r'(?:binary_sensor|sensor)\.[a-z0-9_]+'),
    'smoke': re.compile(r'(?:binary_sensor|sensor|event)\.[a-z0-9_]+'),
    'moisture': re.compile(r'binary_sensor\.[a-z0-9_]+'),
}
#: 漏水副传感器（只有 ``moisture`` 允许）。
ALARM_SECONDARY_PATTERN = re.compile(r'binary_sensor\.[a-z0-9_]+')
#: 电量实体。
ALARM_BATTERY_PATTERN = re.compile(r'sensor\.[a-z0-9_]+')
#: 工作状态实体。
ALARM_WORK_STATE_PATTERN = re.compile(r'(?:sensor|binary_sensor)\.[a-z0-9_]+')
#: 告警卡片数值字段边界（``size`` 是卡片基准尺寸 100..600，与摄像头不同）。
ALARM_NUMBER_BOUNDS: tuple[tuple[str, float, float], ...] = (
    ('x', -1_000_000, 1_000_000),
    ('y', -1_000_000, 1_000_000),
    ('height', 0, 20),
    ('size', 100, 600),
    ('opacity', 0, 1),
    ('cardWidth', 80, 480),
)
#: 告警卡片「只要求为正数」的字段（字号不设上限：放大字号是用户明确意图）。
ALARM_SIZE_FIELDS = ('iconSize', 'hitSize', 'fontSize')
#: 告警卡片开关字段。
ALARM_FLAG_FIELDS = ('visible', 'overlay', 'buttonHidden', 'hiddenClickable')

#: 摄像头字段白名单。
CAMERA_FIELDS = frozenset(
    {
        'x',
        'y',
        'id',
        'icon',
        'size',
        'label',
        'height',
        'floorId',
        'hitSize',
        'modelId',
        'visible',
        'entityId',
        'fontSize',
        'iconSize',
        'focusCamera',
        'buttonHidden',
        'cameraSource',
        'fit',
        'go2rtcUrl',
        'backgroundOpacity',
    }
)
#: 摄像头身份字段：必须存在、非空、且是长度受限文本。
CAMERA_IDENTITY_FIELDS = ('id', 'floorId', 'modelId')
#: 摄像头来源枚举：默认 HA 实体；选 go2rtc 时地址必须能通过白名单归一（据此才能反代）。
CAMERA_SOURCE = EnumSpec('cameraSource', ('entity', 'go2rtc'), 'entity')
#: 摄像头弹窗画面比例：默认 contain（完整可见），fill 为铺满裁切。
CAMERA_FIT = EnumSpec('fit', ('fill', 'contain'), 'contain')
#: 摄像头实体：只接受 ``camera.*``。
CAMERA_ENTITY_PATTERN = re.compile(r'camera\.[a-z0-9_]+')
#: go2rtc 地址长度上限。
MAX_GO2RTC_URL_LENGTH = 2048
#: 摄像头数值字段边界（高度可负：贴附天花板的机位）。
CAMERA_NUMBER_BOUNDS: tuple[tuple[str, float, float], ...] = (
    ('x', -1_000_000, 1_000_000),
    ('y', -1_000_000, 1_000_000),
    ('height', -1000, 1000),
    ('size', 1, 1000),
    ('iconSize', 1, 1000),
    ('hitSize', 1, 1000),
    ('backgroundOpacity', 0, 1),
)
#: 摄像头开关字段。
CAMERA_FLAG_FIELDS = ('visible', 'buttonHidden')

#: 人体感应字段白名单。
PRESENCE_FIELDS = frozenset(
    {
        'id',
        'size',
        'color',
        'label',
        'route',
        'speed',
        'floorId',
        'modelId',
        'deviceId',
        'entityId',
        'character',
        'waveScale',
        'deviceName',
        'hitPadding',
        'focusCamera',
        'routeClosed',
        'triggerMode',
        'waveEnabled',
        'waveOpacity',
        'clickToFocus',
        'displayPages',
        'triggerValue',
        'displayDuration',
        'triggerThreshold',
    }
)
#: 人物造型 / 配色 / 触发方式枚举。
PRESENCE_CHARACTER = EnumSpec('character', ('traveler', 'bean', 'glow'), 'traveler')
PRESENCE_COLOR = EnumSpec('color', ('cyan', 'orange'), 'cyan')
PRESENCE_TRIGGER_MODE = EnumSpec('triggerMode', ('auto', 'threshold', 'equals', 'change'), 'auto')
#: ``displayPages`` 允许的页面集合。
PRESENCE_PAGES = frozenset({'overview', 'light', 'environment', 'devices', 'vacuum', 'security'})
#: ``displayPages`` 默认值（必须是 ``list``：``'all'`` 与自定义列表是两种形态）。
PRESENCE_DEFAULT_PAGES: list[str] = ['overview', 'light', 'security']
#: 页面数量上限。
MAX_PRESENCE_PAGES = 6
#: 感应实体写法：``domain.object_id``，对象名放宽到 200 字符（模板生成的实体较长）。
PRESENCE_ENTITY_PATTERN = re.compile(r'[a-z_]+\.[a-z0-9_]{1,200}')
#: 事件型实体前缀：``event.*`` 的传感器按事件驱动估算停留时长。
EVENT_ENTITY_PREFIX = 'event.'
#: ``triggerValue`` 长度上限。
MAX_TRIGGER_VALUE_LENGTH = 128
#: 阈值 / 坐标 / 时长的数值边界。
PRESENCE_THRESHOLD_MAX = 1_000_000
PRESENCE_COORDINATE_MAX = 1_000_000
MAX_DISPLAY_DURATION = 3600
#: 路线点数：闭合路线至少 3 点，开放路线允许空。
ROUTE_CLOSED_MIN_POINTS = 3
MAX_ROUTE_POINTS = 128
#: 路线点必须是恰好含 ``x`` / ``y`` 的字典。
ROUTE_POINT_FIELDS = frozenset({'x', 'y'})
#: 三点共线判定阈值（叉积绝对值超过它才算"有拐角"）。
CROSS_PRODUCT_EPSILON = 1e-6


class SecuritySectionValidator:
    """``security`` 分区校验：跨件状态（重复键）挂在实例上，逐件判定拆成小方法。"""

    def __init__(self, ctx: ValidationContext) -> None:
        self._ctx = ctx
        self._alarm_ids: set[Any] = set()
        self._camera_ids: set[Any] = set()
        self._camera_models: set[tuple[Any, Any]] = set()
        self._presence_ids: set[Any] = set()
        self._presence_models: set[tuple[Any, Any]] = set()

    def validate(self, properties: dict) -> None:
        security = properties.get('security', {})
        if not isinstance(security, dict) or set(security) - SECURITY_SECTIONS:
            self._ctx.fail()
        validate_lock_bindings(self._ctx, security.get('locks', []))
        self._validate_alarms(security.get('alarms', []))
        self._validate_cameras(security.get('cameras', []))
        self._validate_presence_sensors(security.get('presenceSensors', []))

    # ── 告警卡片 ────────────────────────────────────────────────────────────

    def _validate_alarms(self, alarms: Any) -> None:
        if not isinstance(alarms, list) or len(alarms) > MAX_ALARMS:
            self._ctx.fail()
        for alarm in alarms:
            self._validate_alarm(alarm)
            alarm_id = alarm['id']
            if alarm_id in self._alarm_ids:
                self._ctx.fail()
            self._alarm_ids.add(alarm_id)

    def _validate_alarm(self, alarm: Any) -> None:
        ctx = self._ctx
        if not ctx.has_only(alarm, ALARM_FIELDS) or not ctx.enum(alarm, ALARM_KIND):
            ctx.fail()
        if not ctx.requires(alarm, ('id', 'floorId')) or not ctx.require_text(alarm, ('id', 'floorId', 'label')):
            ctx.fail()
        if alarm['floorId'] == 'all' or alarm['id'] in self._alarm_ids:
            ctx.fail()
        alarm_kind = alarm['kind']
        if not ctx.pattern(alarm.get('entityId', ''), ALARM_ENTITY_PATTERNS[alarm_kind]):
            ctx.fail()
        secondary_entity = alarm.get('secondaryEntityId', '')
        if secondary_entity and (
            alarm_kind != 'moisture' or not ctx.pattern(secondary_entity, ALARM_SECONDARY_PATTERN)
        ):
            ctx.fail()
        if not ctx.pattern(alarm.get('batteryEntityId', ''), ALARM_BATTERY_PATTERN):
            ctx.fail()
        if not ctx.pattern(alarm.get('workStateEntityId', ''), ALARM_WORK_STATE_PATTERN):
            ctx.fail()
        model_id = alarm.get('modelId', '')
        if not ctx.enum(alarm, ALARM_THEME) or (model_id and not ctx.text(model_id)):
            ctx.fail()
        if not ctx.numbers_within(alarm, ALARM_NUMBER_BOUNDS):
            ctx.fail()
        if not ctx.positive_fields(alarm, ALARM_SIZE_FIELDS) or not ctx.flag_fields(alarm, ALARM_FLAG_FIELDS):
            ctx.fail()
        if not ctx.icon(alarm, MDI_ICON_PATTERN):
            ctx.fail()
        ctx.validate_camera(alarm.get('focusCamera'))

    # ── 摄像头 ──────────────────────────────────────────────────────────────

    def _validate_cameras(self, cameras: Any) -> None:
        if not isinstance(cameras, list):
            self._ctx.fail()
        for camera in cameras:
            self._validate_camera(camera)
            if not self._ctx.register_layout_widget(self._camera_ids, self._camera_models, camera):
                self._ctx.fail()
            if camera['floorId'] == 'all':
                self._ctx.fail()

    def _validate_camera(self, camera: Any) -> None:
        ctx = self._ctx
        if not ctx.has_only(camera, CAMERA_FIELDS):
            ctx.fail()
        if not ctx.require_value(camera, CAMERA_IDENTITY_FIELDS) or not ctx.require_text(
            camera, CAMERA_IDENTITY_FIELDS
        ):
            ctx.fail()
        camera_entity = camera.get('entityId', '')
        if not isinstance(camera_entity, str) or not ctx.pattern(camera_entity, CAMERA_ENTITY_PATTERN):
            ctx.fail()
        if (
            not ctx.require_text(camera, ('label', 'icon'))
            or not ctx.enum(camera, CAMERA_SOURCE)
            or not ctx.enum(camera, CAMERA_FIT)
        ):
            ctx.fail()
        camera_url = camera.get('go2rtcUrl', '')
        if not ctx.text(camera_url, MAX_GO2RTC_URL_LENGTH):
            ctx.fail()
        if camera.get('cameraSource', 'entity') == 'go2rtc' and camera_url.strip():
            try:
                normalize_go2rtc_target(camera_url)
            except ValueError:
                ctx.fail()
        if not ctx.numbers_within(camera, CAMERA_NUMBER_BOUNDS):
            ctx.fail()
        if not ctx.positive_fields(camera, ('fontSize',)) or not ctx.flag_fields(camera, CAMERA_FLAG_FIELDS):
            ctx.fail()
        ctx.validate_camera(camera.get('focusCamera'))

    # ── 人体感应 ────────────────────────────────────────────────────────────

    def _route_point_ok(self, point: Any) -> bool:
        """路线点：恰好 ``{x, y}`` 且两个分量都是有限数。"""
        if not isinstance(point, dict) or set(point) != ROUTE_POINT_FIELDS:
            return False
        return all(
            self._ctx.number(point[axis], -PRESENCE_COORDINATE_MAX, PRESENCE_COORDINATE_MAX) for axis in ('x', 'y')
        )

    def _validated_route(self, route: Any, route_closed: Any) -> list:
        """路线整体形状：列表、点数下限随 ``routeClosed`` 变化、每个点都合规。

        返回**收窄后的列表**而不是 ``bool``：调用方随后要 ``len`` / 下标 / 迭代，
        判定与收窄分家会让「已经校验过」这个事实对静态分析不可见，只能靠 ``# type: ignore``
        把它和真正的空值风险一起遮掉。
        """
        if not isinstance(route, list):
            self._ctx.fail()
        min_points = 0 if route_closed is False else ROUTE_CLOSED_MIN_POINTS
        if not min_points <= len(route) <= MAX_ROUTE_POINTS:
            self._ctx.fail()
        if not all(self._route_point_ok(point) for point in route):
            self._ctx.fail()
        return route

    def _pages_ok(self, pages: Any) -> bool:
        """``displayPages``：1..6 个互不重复的已知页面。"""
        if not isinstance(pages, list) or not 1 <= len(pages) <= MAX_PRESENCE_PAGES:
            return False
        if any(not isinstance(page, str) or page not in PRESENCE_PAGES for page in pages):
            return False
        return len(set(pages)) == len(pages)

    def _validate_presence_sensors(self, sensors: Any) -> None:
        if not isinstance(sensors, list):
            self._ctx.fail()
        for sensor in sensors:
            self._validate_presence_sensor(sensor)

    def _validate_presence_sensor(self, sensor: Any) -> None:
        ctx = self._ctx
        if not ctx.has_only(sensor, PRESENCE_FIELDS) or not ctx.require_text(sensor, ('deviceId', 'deviceName')):
            ctx.fail()
        sensor_id = sensor.get('id')
        if not ctx.text(sensor_id) or not sensor_id or sensor_id in self._presence_ids:
            ctx.fail()
        self._presence_ids.add(sensor_id)
        if (
            not isinstance(sensor.get('waveEnabled', True), bool)
            or not ctx.number(sensor.get('waveScale', 1), 0.25, 3)
            or not ctx.number(sensor.get('waveOpacity', 68), 0, 100)
        ):
            ctx.fail()
        if (
            not ctx.require_text(sensor, ('label',))
            or not ctx.text(sensor.get('floorId'))
            or sensor.get('floorId') == 'all'
        ):
            ctx.fail()
        if 'modelId' in sensor:
            self._register_presence_model(sensor)
        sensor_entity = sensor.get('entityId')
        if not isinstance(sensor_entity, str) or (
            sensor_entity and not ctx.pattern(sensor_entity, PRESENCE_ENTITY_PATTERN)
        ):
            ctx.fail()
        if not ctx.enum(sensor, PRESENCE_CHARACTER) or not ctx.enum(sensor, PRESENCE_COLOR):
            ctx.fail()
        if not ctx.enum(sensor, PRESENCE_TRIGGER_MODE):
            ctx.fail()
        trigger_mode = sensor.get('triggerMode', 'auto')
        if 'triggerValue' in sensor and (
            not isinstance(sensor['triggerValue'], str) or len(sensor['triggerValue']) > MAX_TRIGGER_VALUE_LENGTH
        ):
            ctx.fail()
        if trigger_mode == 'equals' and not str(sensor.get('triggerValue', 'on')).strip():
            ctx.fail()
        if 'triggerThreshold' in sensor and not ctx.number(
            sensor['triggerThreshold'], -PRESENCE_THRESHOLD_MAX, PRESENCE_THRESHOLD_MAX
        ):
            ctx.fail()
        self._validate_presence_duration(sensor)
        self._validate_presence_behavior(sensor)
        self._validate_presence_route(sensor)

    def _register_presence_model(self, sensor: dict) -> None:
        model_id = sensor['modelId']
        if not self._ctx.text(model_id) or not model_id:
            self._ctx.fail()
        model_key = (sensor.get('floorId'), model_id)
        if model_key in self._presence_models:
            self._ctx.fail()
        self._presence_models.add(model_key)

    def _validate_presence_duration(self, sensor: dict) -> None:
        """停留时长：事件型传感器（``equals`` / ``change`` / ``event.*``）按事件持续时间估算。"""
        trigger_mode = sensor.get('triggerMode', 'auto')
        sensor_entity = sensor.get('entityId')
        bound_entity = sensor_entity if isinstance(sensor_entity, str) else ''
        event_sensor = trigger_mode in ('equals', 'change') or (
            trigger_mode == 'auto' and bound_entity.startswith(EVENT_ENTITY_PREFIX)
        )
        default_duration = 30 if event_sensor else 0
        min_duration = 1 if event_sensor else 0
        if not self._ctx.number(
            sensor.get('displayDuration', default_duration), min_duration, MAX_DISPLAY_DURATION
        ):
            self._ctx.fail()

    def _validate_presence_behavior(self, sensor: dict) -> None:
        ctx = self._ctx
        pages = sensor.get('displayPages', PRESENCE_DEFAULT_PAGES)
        if pages != 'all' and not self._pages_ok(pages):
            ctx.fail()
        if not ctx.number(sensor.get('speed', 0.45), 0.1, 2) or not ctx.number(sensor.get('size', 1), 0.25, 3):
            ctx.fail()
        if not isinstance(sensor.get('clickToFocus', False), bool) or not ctx.number(
            sensor.get('hitPadding', 8), 0, 80
        ):
            ctx.fail()
        ctx.validate_camera(sensor.get('focusCamera'))

    def _validate_presence_route(self, sensor: dict) -> None:
        ctx = self._ctx
        if not isinstance(sensor.get('routeClosed', True), bool):
            ctx.fail()
        route_closed = sensor.get('routeClosed')
        route = self._validated_route(sensor.get('route'), route_closed)
        if route_closed is False:
            return
        if len({(point['x'], point['y']) for point in route}) != len(route):
            ctx.fail()
        first_point = route[0]
        if not any(
            abs(
                (second['x'] - first_point['x']) * (third['y'] - first_point['y'])
                - (second['y'] - first_point['y']) * (third['x'] - first_point['x'])
            )
            > CROSS_PRODUCT_EPSILON
            for second, third in pairwise(route)
        ):
            ctx.fail()


def validate_security_section(ctx: ValidationContext, properties: dict) -> None:
    """security 分区校验：告警卡片、摄像头、人体感应；不合规处直接经 ``ctx.fail()`` 抛 422。"""
    SecuritySectionValidator(ctx).validate(properties)
