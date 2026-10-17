"""environment 分区校验：空调 / 衣架 / 风扇 / 净化器 / 热水器 / 窗帘 / 温湿度 / 窗帘分组。

判定表（白名单、正则、枚举、边界）与共用原语都在 :mod:`config_ctx`；本文件只保留
「这一类控件比别的控件多要求什么」，因此新增一类家电 = 在 :data:`APPLIANCE_RULES`
加一行 + 在 :attr:`EnvironmentSectionValidator.appliance_bindings` 加一条绑定校验。

为什么是类而不是一组模块级函数
------------------------------
每个控件判定都要用到 ``ctx`` 与**集合级**共享状态（控件 ``id`` / ``(floorId, modelId)``
去重、窗帘分组回查成员）。写成模块级函数就得把这些穿成 3~4 个参数，而本仓质量门禁对每文件
的「最大参数个数」是逐文件棘轮（本文件现为 2，只允许降）。类方法只把 ``self`` 之后的对象
算作参数，于是「一次校验 = 一个实例」既保住了共享状态，也不动门禁基线。

判定口径：``ctx.fail()`` 立即抛 422 而非累计，所以判定顺序不影响结果。
唯一**有意**的差异是非字符串实体 id：``re.fullmatch(pattern, 123)`` 会抛
``TypeError`` 冒成 500，现在经 ``ctx.pattern`` / ``ctx.optional_patterns`` 归为 422。
"""

from __future__ import annotations

import re
from collections.abc import Callable
from dataclasses import dataclass
from typing import Any

from .config_ctx import (
    CLICK_ACTIONS,
    CLICK_ACTIONS_PANEL_ONLY,
    CLICK_ACTIONS_WITH_PANEL,
    MDI_ICON_PATTERN,
    POSITION_BOUNDS,
    SIZE_FIELDS,
    WIDGET_FLAG_FIELDS,
    EnumSpec,
    ValidationContext,
    WidgetRules,
    validate_appliance_extras,
    validate_layout_widget,
)
from .device import validate_device_status_rules

#: environment 分区允许出现的键。
ENVIRONMENT_FIELDS = frozenset(
    {
        'curtains',
        'dimStrength',
        'airConditioners',
        'airPurifiers',
        'curtainGroups',
        'temperatureHumidity',
        'fans',
        'airers',
        'waterHeaters',
    }
)
#: 控件身份字段：必须存在且非空。
IDENTITY_FIELDS = ('id', 'floorId', 'modelId')
#: 控件文本字段：必须存在且 len ≤ 128。
WIDGET_TEXT_FIELDS = ('id', 'floorId', 'modelId', 'label')


# ── 空调 ───────────────────────────────────────────────────────────────────
#: 空调控件白名单（含浴室暖风档）。
AIR_CONDITIONER_FIELDS = frozenset(
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
        'iconSize',
        'clickAction',
        'focusCamera',
        'buttonHidden',
        'hiddenClickable',
        'deviceId',
        'deviceName',
        'climateType',
        'extraControls',
        'bathEffects',
    }
)
#: 普通空调只认 ``climate.*``；浴室暖风可退化为 ``fan.*``（暖风设备常以风扇呈现）。
AIR_CONDITIONER_ENTITY = re.compile(r'climate\.[a-z0-9_]+')
BATH_HEATER_ENTITY = re.compile(r'(climate|fan)\.[a-z0-9_]+')
#: 空调类型枚举与默认值。
CLIMATE_TYPES = ('air-conditioner', 'bath-heater')
#: 空调类型（默认普通空调）。
CLIMATE_TYPE_ENUM = EnumSpec('climateType', CLIMATE_TYPES, 'air-conditioner')
#: 浴室暖风联动：可用效果、禁止作为来源的域（这三类实体只该被读、不该当触发源）、条数上限。
BATH_EFFECTS = frozenset({'fan', 'heat', 'light', 'exhaust'})
BATH_EFFECT_EXCLUDED_SOURCE_DOMAINS = frozenset({'event', 'button', 'input_button'})
BATH_EFFECT_RULE_FIELDS = frozenset({'value', 'effect', 'entityId', 'attribute'})
MAX_BATH_EFFECT_RULES = 12

#: 空调共用骨架。
AIR_CONDITIONER_RULES = WidgetRules(
    allowed_fields=AIR_CONDITIONER_FIELDS,
    click_actions=CLICK_ACTIONS,
    default_click_action='focus',
    icon_pattern=MDI_ICON_PATTERN,
    flag_fields=WIDGET_FLAG_FIELDS,
    position_bounds=POSITION_BOUNDS,
    size_fields=SIZE_FIELDS,
)


# ── 家电（衣架 / 风扇 / 净化器 / 热水器） ────────────────────────────────────
#: 四类家电公共白名单。
APPLIANCE_FIELDS = frozenset(
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
        'iconSize',
        'clickAction',
        'focusCamera',
        'buttonHidden',
        'extraControls',
        'hiddenClickable',
    }
)
#: 风扇外观档位、朝向状态文本上限。
FAN_VISUAL_MODES = ('tower', 'ceiling')
#: 风扇外观（默认塔扇）。
FAN_VISUAL_MODE_ENUM = EnumSpec('visualMode', FAN_VISUAL_MODES, 'tower')
FAN_REVERSE_STATE_MAX_LENGTH = 120
#: 风扇主实体（可空：有 deviceId 时允许纯自定义附加功能驱动动画）与三个绑定实体。
FAN_ENTITY = re.compile(r'(?:fan|switch|input_boolean|binary_sensor)\.[a-z0-9_]+')
FAN_BINDINGS: tuple[tuple[str, re.Pattern[str]], ...] = (
    ('speedEntityId', re.compile(r'(?:input_number|number|fan)\.[a-z0-9_]+')),
    ('directionEntityId', re.compile(r'(?:input_select|select|fan|switch|input_boolean)\.[a-z0-9_]+')),
    ('runEntityId', re.compile(r'(?:fan|switch|input_boolean|binary_sensor)\.[a-z0-9_]+')),
)
#: 净化器联动风速实体：必须是本控件附加控制里已有的实体。
AIRFLOW_ENTITY = re.compile(r'(switch|fan|binary_sensor|input_boolean)\.[a-z0-9_]+')
#: 热水器工作状态：字段、状态类型、状态实体域、状态文本上限。
WORKING_STATE_FIELDS = frozenset({'kind', 'active', 'entityId', 'inactive'})
WORKING_STATE_KINDS = ('flow', 'burning', 'heating')
#: 工作状态类型（无默认：缺失即拒绝）。
WORKING_STATE_KIND_ENUM = EnumSpec('kind', WORKING_STATE_KINDS, '')
WORKING_STATE_ENTITY = re.compile(r'(?:binary_sensor|sensor)\.[a-z0-9_]+')
WORKING_STATE_TEXT_LIMIT = 120
#: 衣架开关字段与行程时长（秒）边界。
AIRER_FLAG_FIELDS = ('animationReversed', 'positionReversed', 'liftReversed')
AIRER_TRAVEL_SECONDS = (5, 180)


@dataclass(frozen=True)
class ApplianceRules:
    """一类家电的判定表：集合名、实体域、白名单、点击动作档位。"""

    entity_pattern: re.Pattern[str]
    allowed_fields: frozenset[str]
    #: 点击动作档位（衣架只有聚焦与面板两档）。
    click_actions: tuple[str, ...] = CLICK_ACTIONS
    #: ``True`` 表示填了 ``deviceId`` 就可以不填 ``entityId``（风扇：纯附加功能驱动动画）。
    device_id_relaxes_entity: bool = False


#: ``集合名 → 判定表``；字典顺序即校验顺序。新增一类家电只加一行。
APPLIANCE_RULES: dict[str, ApplianceRules] = {
    'airers': ApplianceRules(
        re.compile(r'cover\.[a-z0-9_]+'),
        APPLIANCE_FIELDS
        | frozenset({'travelSeconds', 'animationReversed', 'positionReversed', 'liftReversed'}),
        CLICK_ACTIONS_PANEL_ONLY,
    ),
    'fans': ApplianceRules(
        FAN_ENTITY,
        APPLIANCE_FIELDS
        | frozenset(
            {
                'speedEntityId',
                'directionEntityId',
                'runEntityId',
                'visualMode',
                'reverseState',
                'deviceId',
                'deviceName',
            }
        ),
        CLICK_ACTIONS,
        True,
    ),
    'airPurifiers': ApplianceRules(
        re.compile(r'fan\.[a-z0-9_]+'),
        APPLIANCE_FIELDS | frozenset({'deviceId', 'deviceName', 'airflowEntityId'}),
    ),
    'waterHeaters': ApplianceRules(
        re.compile(r'water_heater\.[a-z0-9_]+'),
        APPLIANCE_FIELDS | frozenset({'deviceId', 'deviceName', 'statusRules', 'workingState'}),
    ),
}


# ── 窗帘 ───────────────────────────────────────────────────────────────────
CURTAIN_FIELDS = frozenset(
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
        'iconSize',
        'coverKind',
        'clickAction',
        'focusCamera',
        'buttonHidden',
        'curtainFabric',
        'coverKindOverride',
        'curtainFabricOverride',
        'coverDirection',
        'hiddenClickable',
        'unboundPosition',
        'iconStateReversed',
    }
)
COVER_ENTITY = re.compile(r'cover\.[a-z0-9_]+')
COVER_DIRECTIONS = ('auto', 'left', 'right', 'split')
#: 窗帘开合方向（默认自动）。
COVER_DIRECTION_ENUM = EnumSpec('coverDirection', COVER_DIRECTIONS, 'auto')
COVER_KINDS = ('standard', 'dream', 'roller')
#: 窗帘品类（默认标准帘）。
COVER_KIND_ENUM = EnumSpec('coverKind', COVER_KINDS, 'standard')
CURTAIN_FABRICS = ('cloth', 'sheer')
#: 帘布材质（默认布帘）。
CURTAIN_FABRIC_ENUM = EnumSpec('curtainFabric', CURTAIN_FABRICS, 'cloth')
#: 窗帘上的「覆盖」布尔开关（语义与公共开关不同，故单列）。
CURTAIN_OVERRIDE_FIELDS = ('coverKindOverride', 'curtainFabricOverride')

#: 窗帘共用骨架。
CURTAIN_RULES = WidgetRules(
    allowed_fields=CURTAIN_FIELDS,
    click_actions=CLICK_ACTIONS_WITH_PANEL,
    default_click_action='focus',
    icon_pattern=MDI_ICON_PATTERN,
    flag_fields=WIDGET_FLAG_FIELDS,
    position_bounds=POSITION_BOUNDS,
    size_fields=SIZE_FIELDS,
)


# ── 温湿度计 ───────────────────────────────────────────────────────────────
CLIMATE_SENSOR_FIELDS = frozenset(
    {
        'x',
        'y',
        'id',
        'label',
        'floorId',
        'height',
        'columns',
        'size',
        'visible',
        'showMetricNames',
        'opacity',
        'iconSize',
        'hitSize',
        'temperatureEntityId',
        'humidityEntityId',
        'formaldehydeEntityId',
        'pm25EntityId',
        'pm10EntityId',
        'co2EntityId',
        'tvocEntityId',
        'aqiEntityId',
        'illuminanceEntityId',
        'batteryEntityId',
        # 环境信息框尺寸默认值的兼容标记：字段本身已无读写方，但现存草稿里仍带着它，
        # 从白名单里删掉会让这些控件保存时整份 422。
        'sizingVersion',
    }
)
#: 温湿度计的 10 个可选绑定实体（出现即必须是文本，非空必须匹配 ``sensor.*``）。
CLIMATE_SENSOR_BINDINGS: tuple[tuple[str, re.Pattern[str]], ...] = tuple(
    (key, re.compile(r'sensor\.[a-z0-9_]+'))
    for key in (
        'temperatureEntityId',
        'humidityEntityId',
        'formaldehydeEntityId',
        'pm25EntityId',
        'pm10EntityId',
        'co2EntityId',
        'tvocEntityId',
        'aqiEntityId',
        'illuminanceEntityId',
        'batteryEntityId',
    )
)
CLIMATE_SENSOR_FLAG_FIELDS = ('visible', 'showMetricNames')
#: 信息框列数上限（0 表示自适应）、尺寸版本号上限。
CLIMATE_SENSOR_MAX_COLUMNS = 4
CLIMATE_SENSOR_MAX_SIZING_VERSION = 1000


# ── 窗帘分组 ───────────────────────────────────────────────────────────────
CURTAIN_GROUP_FIELDS = frozenset(
    {
        'x',
        'y',
        'id',
        'size',
        'label',
        'height',
        'floorId',
        'hitSize',
        'iconSize',
        'memberIds',
        'visible',
        'clickAction',
        'focusCamera',
        'panelLayout',
        'buttonHidden',
        'hiddenClickable',
    }
)
#: 分组恰好两个成员（成对开合语义）、面板排布枚举。
CURTAIN_GROUP_MEMBERS = 2
PANEL_LAYOUTS = ('horizontal', 'vertical')
#: 分组面板排布（默认横排）。
PANEL_LAYOUT_ENUM = EnumSpec('panelLayout', PANEL_LAYOUTS, 'horizontal')
#: 分组共用骨架（开关字段与其它控件一致）。
CURTAIN_GROUP_RULES = WidgetRules(
    allowed_fields=CURTAIN_GROUP_FIELDS,
    click_actions=CLICK_ACTIONS_WITH_PANEL,
    default_click_action='focus',
    icon_pattern=MDI_ICON_PATTERN,
    flag_fields=WIDGET_FLAG_FIELDS,
    position_bounds=POSITION_BOUNDS,
    size_fields=SIZE_FIELDS,
)


class EnvironmentSectionValidator:
    """一次 ``environment`` 分区校验；实例用完即弃（去重状态跟着校验走）。"""

    def __init__(self, ctx: ValidationContext) -> None:
        self.ctx = ctx
        # 集合级去重：每个集合在校验前各自重置。
        self.seen_ids: set = set()
        self.seen_models: set = set()
        # 窗帘分组回查用：窗帘 id → 该窗帘（成员楼层一致、不能是梦幻帘 …）。
        self.curtain_by_id: dict[str, dict] = {}
        self.used_group_members: set[str] = set()
        # 各家电集合自己的绑定/联动校验（``集合名 → 方法``）。
        self.appliance_bindings: dict[str, Callable[[Any], None]] = {
            'airers': self.validate_airer_bindings,
            'fans': self.validate_fan_bindings,
            'airPurifiers': self.validate_air_purifier_bindings,
            'waterHeaters': self.validate_water_heater_bindings,
        }

    # ── 入口 ────────────────────────────────────────────────────────────

    def validate(self, environment: Any) -> None:
        if not self.ctx.has_only(environment, ENVIRONMENT_FIELDS):
            self.ctx.fail()
        if not self.ctx.number(environment.get('dimStrength', 70), 0, 100):
            self.ctx.fail()
        self.validate_air_conditioners(environment)
        self.validate_appliances(environment)
        self.validate_curtains(environment)
        self.validate_climate_sensors(environment)
        self.validate_curtain_groups(environment)

    # ── 空调 ────────────────────────────────────────────────────────────

    def validate_air_conditioners(self, environment: dict) -> None:
        air_conditioners = environment.get('airConditioners', [])
        if not isinstance(air_conditioners, list):
            self.ctx.fail()
        self.reset_seen()
        for air_conditioner in air_conditioners:
            if not self.ctx.has_only(air_conditioner, AIR_CONDITIONER_FIELDS):
                self.ctx.fail()
            if not self.register_widget(air_conditioner):
                self.ctx.fail()
            self.validate_air_conditioner(air_conditioner)

    def validate_air_conditioner(self, air_conditioner: Any) -> None:
        if not self.ctx.require_text(air_conditioner, (*WIDGET_TEXT_FIELDS, 'entityId')):
            self.ctx.fail()
        if not self.ctx.require_value(air_conditioner, IDENTITY_FIELDS):
            self.ctx.fail()
        if not self.ctx.enum(air_conditioner, CLIMATE_TYPE_ENUM):
            self.ctx.fail()
        if not self.ctx.require_text(air_conditioner, ('deviceId', 'deviceName')):
            self.ctx.fail()
        bound_entity_id = air_conditioner.get('entityId', '')
        if air_conditioner.get('climateType') == 'bath-heater':
            entity_pattern = BATH_HEATER_ENTITY
        else:
            entity_pattern = AIR_CONDITIONER_ENTITY
        if not self.ctx.pattern(bound_entity_id, entity_pattern):
            self.ctx.fail()
        validate_layout_widget(self.ctx, air_conditioner, AIR_CONDITIONER_RULES)
        validate_appliance_extras(self.ctx, air_conditioner, bound_entity_id)
        self.validate_bath_effects(air_conditioner)

    def validate_bath_effects(self, air_conditioner: dict) -> None:
        """浴室暖风联动：来源只能是本控件自身或它的附加控制实体（空实体不算来源）。"""
        rules = air_conditioner.get('bathEffects', [])
        if not isinstance(rules, list) or len(rules) > MAX_BATH_EFFECT_RULES:
            self.ctx.fail()
        allowed_sources = {
            air_conditioner.get('entityId', ''),
            *(control['entityId'] for control in air_conditioner.get('extraControls', [])),
        } - {''}
        for rule in rules:
            if not isinstance(rule, dict) or set(rule) != BATH_EFFECT_RULE_FIELDS:
                self.ctx.fail()
            source_entity_id = rule['entityId']
            source_domain = source_entity_id.split('.')[0] if isinstance(source_entity_id, str) else ''
            if (
                source_entity_id not in allowed_sources
                or source_domain in BATH_EFFECT_EXCLUDED_SOURCE_DOMAINS
                or rule.get('effect') not in BATH_EFFECTS
                or not self.ctx.text(rule.get('attribute'))
                or not self.ctx.text(rule.get('value'))
                or not rule.get('value')
            ):
                self.ctx.fail()

    # ── 家电 ────────────────────────────────────────────────────────────

    def validate_appliances(self, environment: dict) -> None:
        for collection, rules in APPLIANCE_RULES.items():
            appliances = environment.get(collection, [])
            if not isinstance(appliances, list):
                self.ctx.fail()
            self.reset_seen()
            for appliance in appliances:
                if not self.ctx.has_only(appliance, rules.allowed_fields):
                    self.ctx.fail()
                if not self.register_widget(appliance):
                    self.ctx.fail()
                self.validate_appliance(appliance, rules)
                self.appliance_bindings[collection](appliance)

    def validate_appliance(self, appliance: Any, rules: ApplianceRules) -> None:
        """家电公共判定：文本/身份/实体域/工作状态/附加控制/骨架。"""
        # 风扇主实体选填：有 deviceId 时允许空 entityId（纯自定义附加功能驱动动画）。
        if rules.device_id_relaxes_entity and self.ctx.text(appliance.get('deviceId', '')):
            required_text = WIDGET_TEXT_FIELDS
        else:
            required_text = (*WIDGET_TEXT_FIELDS, 'entityId')
        if not self.ctx.require_text(appliance, required_text):
            self.ctx.fail()
        if not self.ctx.require_value(appliance, IDENTITY_FIELDS):
            self.ctx.fail()
        bound_entity_id = appliance.get('entityId', '')
        if not self.ctx.pattern(bound_entity_id, rules.entity_pattern):
            self.ctx.fail()
        self.validate_working_state(appliance)
        validate_appliance_extras(self.ctx, appliance, bound_entity_id)
        validate_layout_widget(
            self.ctx,
            appliance,
            WidgetRules(
                allowed_fields=rules.allowed_fields,
                click_actions=rules.click_actions,
                default_click_action='focus',
                icon_pattern=MDI_ICON_PATTERN,
                flag_fields=WIDGET_FLAG_FIELDS,
                position_bounds=POSITION_BOUNDS,
                size_fields=SIZE_FIELDS,
            ),
        )

    def validate_airer_bindings(self, airer: Any) -> None:
        if 'travelSeconds' in airer and not self.ctx.number(airer['travelSeconds'], *AIRER_TRAVEL_SECONDS):
            self.ctx.fail()
        if not self.ctx.flag_fields(airer, AIRER_FLAG_FIELDS):
            self.ctx.fail()

    def validate_fan_bindings(self, fan: Any) -> None:
        if not self.ctx.optional_patterns(fan, FAN_BINDINGS):
            self.ctx.fail()
        if not self.ctx.enum(fan, FAN_VISUAL_MODE_ENUM):
            self.ctx.fail()
        reverse_state = fan.get('reverseState', '')
        if reverse_state and (
            not isinstance(reverse_state, str)
            or not reverse_state.strip()
            or len(reverse_state) > FAN_REVERSE_STATE_MAX_LENGTH
        ):
            self.ctx.fail()
        # deviceId / deviceName 成对出现；仅填一个时拒绝（非文本交给文本判定去拒）。
        if not self.ctx.require_text(fan, ('deviceId', 'deviceName')) and bool(
            fan.get('deviceId')
        ) != bool(fan.get('deviceName')):
            self.ctx.fail()

    def validate_air_purifier_bindings(self, air_purifier: Any) -> None:
        if not self.ctx.require_text(air_purifier, ('deviceId', 'deviceName', 'airflowEntityId')):
            self.ctx.fail()
        airflow_entity_id = air_purifier.get('airflowEntityId', '')
        if not airflow_entity_id:
            return
        extra_control_ids = {control['entityId'] for control in air_purifier.get('extraControls', [])}
        if not AIRFLOW_ENTITY.fullmatch(airflow_entity_id) or airflow_entity_id not in extra_control_ids:
            self.ctx.fail()

    def validate_water_heater_bindings(self, water_heater: Any) -> None:
        if not self.ctx.require_text(water_heater, ('deviceId', 'deviceName')):
            self.ctx.fail()
        status_rules = water_heater.get('statusRules', {})
        if status_rules and not water_heater.get('entityId') and not water_heater.get('deviceId'):
            self.ctx.fail()
        validate_device_status_rules(status_rules, self.ctx.fail)

    def validate_working_state(self, appliance: Any) -> None:
        """热水器工作状态指示（``workingState``）。"""
        rule = appliance.get('workingState')
        if rule is None:
            return
        if not self.ctx.has_only(rule, WORKING_STATE_FIELDS) or set(rule) != set(WORKING_STATE_FIELDS):
            self.ctx.fail()
        if not self.ctx.enum(rule, WORKING_STATE_KIND_ENUM):
            self.ctx.fail()
        if not WORKING_STATE_ENTITY.fullmatch(str(rule.get('entityId', ''))):
            self.ctx.fail()
        active_state = rule['active']
        inactive_state = rule['inactive']
        if any(
            not isinstance(state, str) or not state.strip() or len(state) > WORKING_STATE_TEXT_LIMIT
            for state in (active_state, inactive_state)
        ):
            self.ctx.fail()
        if active_state == inactive_state:
            self.ctx.fail()

    # ── 窗帘 ────────────────────────────────────────────────────────────

    def validate_curtains(self, environment: dict) -> None:
        curtains = environment.get('curtains', [])
        if not isinstance(curtains, list):
            self.ctx.fail()
        self.reset_seen()
        for curtain in curtains:
            if not self.ctx.has_only(curtain, CURTAIN_FIELDS):
                self.ctx.fail()
            # 窗帘只要求 id（floorId/modelId 允许缺省），但 id 不能为空。
            if not curtain.get('id'):
                self.ctx.fail()
            if not self.register_widget(curtain):
                self.ctx.fail()
            self.validate_curtain(curtain)
            self.curtain_by_id[curtain.get('id')] = curtain

    def validate_curtain(self, curtain: Any) -> None:
        if not self.ctx.require_text(curtain, (*WIDGET_TEXT_FIELDS, 'entityId')):
            self.ctx.fail()
        if not self.ctx.pattern(curtain.get('entityId', ''), COVER_ENTITY):
            self.ctx.fail()
        if not self.ctx.flag_fields(curtain, CURTAIN_OVERRIDE_FIELDS):
            self.ctx.fail()
        if not self.ctx.enum(curtain, COVER_DIRECTION_ENUM):
            self.ctx.fail()
        if not self.ctx.enum(curtain, COVER_KIND_ENUM):
            self.ctx.fail()
        if not self.ctx.enum(curtain, CURTAIN_FABRIC_ENUM):
            self.ctx.fail()
        if 'unboundPosition' in curtain and not self.ctx.number(curtain['unboundPosition'], 0, 100):
            self.ctx.fail()
        if 'iconStateReversed' in curtain and not isinstance(curtain['iconStateReversed'], bool):
            self.ctx.fail()
        validate_layout_widget(self.ctx, curtain, CURTAIN_RULES)

    # ── 温湿度计 ────────────────────────────────────────────────────────

    def validate_climate_sensors(self, environment: dict) -> None:
        climate_sensors = environment.get('temperatureHumidity', [])
        if not isinstance(climate_sensors, list):
            self.ctx.fail()
        sensor_ids: set = set()
        for climate_sensor in climate_sensors:
            if not self.ctx.has_only(climate_sensor, CLIMATE_SENSOR_FIELDS):
                self.ctx.fail()
            if not self.ctx.require_text(climate_sensor, ('id', 'floorId', 'label')):
                self.ctx.fail()
            sensor_id = climate_sensor.get('id')
            if not sensor_id or not climate_sensor.get('floorId') or sensor_id in sensor_ids:
                self.ctx.fail()
            sensor_ids.add(sensor_id)
            self.validate_climate_sensor(climate_sensor)

    def validate_climate_sensor(self, climate_sensor: Any) -> None:
        if not self.ctx.strict_patterns(climate_sensor, CLIMATE_SENSOR_BINDINGS):
            self.ctx.fail()
        if not self.ctx.positive_fields(climate_sensor, SIZE_FIELDS):
            self.ctx.fail()
        if not self.ctx.numbers_within(climate_sensor, POSITION_BOUNDS):
            self.ctx.fail()
        if not self.ctx.flag_fields(climate_sensor, CLIMATE_SENSOR_FLAG_FIELDS):
            self.ctx.fail()
        # 信息框列数：0 表示自适应。
        if 'columns' in climate_sensor and (
            type(climate_sensor['columns']) is not int
            or not 0 <= climate_sensor['columns'] <= CLIMATE_SENSOR_MAX_COLUMNS
        ):
            self.ctx.fail()
        if 'opacity' in climate_sensor and not self.ctx.number(climate_sensor['opacity'], 0, 1):
            self.ctx.fail()
        # sizingVersion 只要求正整数，不枚举具体版本：前端再加档默认值不必连带发后端。
        if 'sizingVersion' in climate_sensor and (
            type(climate_sensor['sizingVersion']) is not int
            or not 1 <= climate_sensor['sizingVersion'] <= CLIMATE_SENSOR_MAX_SIZING_VERSION
        ):
            self.ctx.fail()

    # ── 窗帘分组 ────────────────────────────────────────────────────────

    def validate_curtain_groups(self, environment: dict) -> None:
        groups = environment.get('curtainGroups', [])
        if not isinstance(groups, list):
            self.ctx.fail()
        group_ids: set = set()
        self.used_group_members = set()
        for group in groups:
            if not self.ctx.has_only(group, CURTAIN_GROUP_FIELDS):
                self.ctx.fail()
            if not self.ctx.text(group.get('id')) or not group.get('id') or group.get('id') in group_ids:
                self.ctx.fail()
            group_ids.add(group.get('id'))
            self.validate_curtain_group(group)

    def validate_curtain_group(self, group: Any) -> None:
        if not self.ctx.text(group.get('label', '')):
            self.ctx.fail()
        members = group.get('memberIds')
        if (
            not isinstance(members, list)
            or len(members) != CURTAIN_GROUP_MEMBERS
            or any(not isinstance(member, str) or not member for member in members)
            or len(set(members)) != CURTAIN_GROUP_MEMBERS
        ):
            self.ctx.fail()
        # 成员必须都是已存在的窗帘，且不能被别的分组占用。
        if any(member not in self.curtain_by_id or member in self.used_group_members for member in members):
            self.ctx.fail()
        self.used_group_members.update(members)
        floor_id = group.get('floorId')
        if not self.ctx.text(floor_id) or not floor_id:
            self.ctx.fail()
        # 两片窗帘必须同层、且不能是梦幻帘（分组只做成对开合）。
        member_curtains = [self.curtain_by_id[member] for member in members]
        if (
            any(curtain.get('floorId') != floor_id for curtain in member_curtains)
            or any(curtain.get('coverKind') == 'dream' for curtain in member_curtains)
        ):
            self.ctx.fail()
        if floor_id == 'all' or f'curtain-group:{group.get("id")}' in self.curtain_by_id:
            self.ctx.fail()
        if member_curtains[0].get('entityId') and member_curtains[0].get('entityId') == member_curtains[
            1
        ].get('entityId'):
            self.ctx.fail()
        if not self.ctx.enum(group, PANEL_LAYOUT_ENUM):
            self.ctx.fail()
        validate_layout_widget(self.ctx, group, CURTAIN_GROUP_RULES)

    # ── 共享小工具 ──────────────────────────────────────────────────────

    def reset_seen(self) -> None:
        """集合之间不共享去重：同一个 ``id`` 出现在两个集合里是合法的。"""
        self.seen_ids = set()
        self.seen_models = set()

    def register_widget(self, widget: Any) -> bool:
        """登记控件的 ``id`` 与 ``(floorId, modelId)``；任一重复即返回 ``False``。

        ``(floorId, modelId)`` 只有两边都非空时才参与去重：缺 ``modelId`` 的控件
        之间不算"同一个模型"。
        """
        if not isinstance(widget, dict):
            return False
        widget_id = widget.get('id')
        model_key = (widget.get('floorId'), widget.get('modelId'))
        if widget_id in self.seen_ids:
            return False
        if all(model_key) and model_key in self.seen_models:
            return False
        self.seen_ids.add(widget_id)
        if all(model_key):
            self.seen_models.add(model_key)
        return True


def validate_environment_section(ctx: ValidationContext, properties: dict) -> None:
    """environment 分区校验入口：不合规处直接经 ``ctx.fail()`` 抛 422。"""
    EnvironmentSectionValidator(ctx).validate(properties.get('environment', {}))
