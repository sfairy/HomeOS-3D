"""3D 增量配置校验的原语、判定表与控件骨架（原 ``validate_config`` 内的闭包与内联判定）。

改造前每个分区文件都把同一套判定抄一遍：白名单 ``set(item) - fields``、坐标/尺寸/开关/
点击动作/图标的 5 段 ``if any(...)``、``{k: item[k] for k in (...)}`` 式的重复字面量。
新增一个控件就要再抄一遍，抄漏一处就是「该拒的配置被放行」。

现在收敛成三层：

- :class:`ValidationContext`：标量原语（``number`` / ``text`` / ``pattern``）与记录原语
  （``has_only`` / ``require_text`` / ``numbers_within`` …），**全部返回 ``bool``**，
  调用方统一 ``if not ...: ctx.fail()``；
- 模块级判定表：白名单 frozenset、坐标/尺寸边界、点击动作枚举、预编译正则；
- :func:`validate_layout_widget`：卡片类控件共用的骨架。

口径（这些细节决定了接受/拒绝集合，不要顺手"简化"）：

- 空串一律视为「未绑定」而放行，缺字段与 ``None`` 在多数判定里等价；
- ``bool`` 不算数字（``number`` 显式排除）；
- 非字符串的实体 id 按不合规处理 → 422（直接 ``re.fullmatch`` 会抛 ``TypeError`` 冒成 500）；
- 接受/拒绝集合须保持稳定。
"""

from __future__ import annotations

import math
import re
from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from typing import Any, NamedTuple, NoReturn

from fastapi import HTTPException

from .purifier import EXTRA_TYPES

#: 附加控制的网格档位（列 / 行）。
_GRID_SPANS = {'columns': (1, 2, 3, 4), 'rows': (1, 2)}
#: 附加控制的类型枚举。
#:
#: 0.7.8 新增两个"非实体"类型：``panel``（整块设备面板，文本 / 日期 / 气候 /
#: 窗帘 / 服务型实体都归入此类）与 ``picture``（摄像头画面）。
_EXTRA_CONTROL_TYPES = frozenset(
    {'panel', 'state', 'button', 'number', 'select', 'switch', 'picture'}
)
#: 附加控制的白名单字段。
_EXTRA_CONTROL_FIELDS = frozenset({'rows', 'type', 'label', 'columns', 'entityId'})

# ── 正则（模块级预编译：避免在每件控件上重复编译同一条模式） ────────────────────
#: 通用实体 id：``domain.object_id``。
ENTITY_ID_PATTERN = re.compile(r'[a-z_]+\.[a-z0-9_]+')
#: 图标（严格式）：``mdi:`` + 数字/字母开头。
MDI_ICON_PATTERN = re.compile(r'mdi:[a-z0-9][a-z0-9-]{0,119}')
#: 图标（宽松式：电视 / 扫地机 / 门锁等控件沿用）。
MDI_ICON_LOOSE_PATTERN = re.compile(r'mdi:[a-z0-9-]{1,120}')

# ── 控件共用边界 ───────────────────────────────────────────────────────────
#: 坐标 / 高度：``x``/``y`` 允许 ±1e6（场景尺度），``height`` 0..20。
POSITION_BOUNDS: tuple[tuple[str, float, float], ...] = (
    ('x', -1_000_000, 1_000_000),
    ('y', -1_000_000, 1_000_000),
    ('height', 0, 20),
)
#: 尺寸：出现即必须为正数（上限刻意不设，放大控件是用户明确意图）。
SIZE_FIELDS = ('size', 'iconSize', 'hitSize')
#: 控件通用开关字段。
WIDGET_FLAG_FIELDS = ('visible', 'hiddenClickable', 'buttonHidden', 'motionEnabled', 'funMessages')

# ── 点击动作枚举（各控件档位不同，分开列出而非强行合并） ─────────────────────
#: 灯 / 空调 / 床帘组等：聚焦 + 开灯三档。
CLICK_ACTIONS = ('focus', 'turn-on-focus', 'turn-on', 'turn-on-panel')
#: 窗帘 / 窗帘组：多一档「打开面板」。
CLICK_ACTIONS_WITH_PANEL = ('focus', 'panel', 'turn-on-focus', 'turn-on', 'turn-on-panel')
#: 音箱 / 扫地机 / NAS：面板档。
CLICK_ACTIONS_LITE = ('focus', 'focus-panel', 'panel')
#: 电视：面板档 + 开灯三档。
CLICK_ACTIONS_FULL = ('focus', 'focus-panel', 'panel', 'turn-on-focus', 'turn-on', 'turn-on-panel')
#: 衣架：只有聚焦与面板。
CLICK_ACTIONS_PANEL_ONLY = ('focus', 'panel')


#: ``bound_entity_id`` 是控件自身绑定的实体：附加控制不许与它重复。
def validate_appliance_extras(ctx: ValidationContext, widget: dict, bound_entity_id: str) -> None:
    """家电「附加控制」白名单与能力位校验（与净化器共用同一份类型表）。

    0.7.8 起**不再限制条数**：面板大小由用户自己决定，后端只校验每一项。
    """
    controls = widget.get('extraControls', [])
    if not isinstance(controls, list):
        ctx.fail()
    seen_entity_ids: set[str] = set()
    for control in controls:
        if not isinstance(control, dict) or set(control) - _EXTRA_CONTROL_FIELDS:
            ctx.fail()
        control_type = control.get('type')
        if control_type not in _EXTRA_CONTROL_TYPES:
            ctx.fail()
        # 所有附加控制（含 panel / picture）都必须绑定实体，且 id 形状合法。
        if not ENTITY_ID_PATTERN.fullmatch(str(control.get('entityId', ''))):
            ctx.fail()
        for dimension, span in _GRID_SPANS.items():
            if dimension in control and (
                type(control[dimension]) is not int or control[dimension] not in span
            ):
                ctx.fail()
        control_entity_id = control['entityId']
        # 'state' 类（sensor / binary_sensor）不接受命令，任何域都可以只是"看状态"。
        if control_type != 'state' and control_type != EXTRA_TYPES.get(control_entity_id.split('.')[0]):
            ctx.fail()
        control_label = control.get('label', '')
        if (
            control_entity_id in seen_entity_ids
            or control_entity_id == bound_entity_id
            or not isinstance(control_label, str)
            or len(control_label) > 120
        ):
            ctx.fail()
        seen_entity_ids.add(control_entity_id)


class EnumSpec(NamedTuple):
    """字段枚举判定：``key`` 缺失时按 ``default`` 处理，取值必须落在 ``allowed`` 内。"""

    key: str
    allowed: tuple[str, ...]
    default: str


@dataclass(frozen=True)
class WidgetRules:
    """一类布局控件的共用判定：白名单之外的部分由调用方补。"""

    #: 允许出现的字段（白名单外键一律 422）。
    allowed_fields: frozenset[str]
    #: 点击动作枚举与默认值。
    click_actions: tuple[str, ...] = CLICK_ACTIONS
    default_click_action: str = 'focus'
    #: 图标正则（多数控件严格，部分设备控件放宽）。
    icon_pattern: re.Pattern[str] = MDI_ICON_PATTERN
    #: 开关字段与坐标/尺寸边界（个别控件档位不同）。
    flag_fields: tuple[str, ...] = WIDGET_FLAG_FIELDS
    position_bounds: tuple[tuple[str, float, float], ...] = POSITION_BOUNDS
    size_fields: tuple[str, ...] = SIZE_FIELDS
    #: ``True`` 表示坐标必须存在（灯/窗帘这类"必须落地"的控件），``False`` 表示可选。
    position_required: bool = False

    @property
    def click_action_enum(self) -> EnumSpec:
        return EnumSpec('clickAction', self.click_actions, self.default_click_action)


class ValidationContext:
    """校验原语：全部返回 ``bool`` 而不自己抛错，调用方才能表达「多条判定都通过才继续」。
    """

    def fail(self, detail: str | None = None) -> NoReturn:
        """立即抛 422。能指名到具体字段时传 ``detail``，别让用户只看到笼统一句。"""
        raise HTTPException(422, detail=detail or '3D 交互配置无效，请检查户型、灯光、环境及图标设置。')

    # ── 标量 ────────────────────────────────────────────────────────────

    def number(self, candidate: Any, low: float, high: float) -> bool:
        """有限数且落在 ``[low, high]``；``bool`` 不算数字。"""
        if not isinstance(candidate, (int, float)) or isinstance(candidate, bool):
            return False
        try:
            return math.isfinite(candidate) and low <= candidate <= high
        except OverflowError:
            return False

    def positive_number(self, candidate: Any) -> bool:
        return self.number(candidate, 0, math.inf) and candidate > 0

    def text(self, candidate: Any, length: int = 128) -> bool:
        return isinstance(candidate, str) and len(candidate) <= length

    def pattern(self, candidate: Any, regex: re.Pattern[str]) -> bool:
        """非空值必须匹配 ``regex``；空串 / ``None`` 视为「未绑定」而放行。

        非字符串按不合规处理，不能用 ``re.fullmatch`` 直接匹配（会抛 ``TypeError`` 冒成 500）。
        """
        if not candidate:
            return True
        return isinstance(candidate, str) and regex.fullmatch(candidate) is not None

    def enum(self, record: dict, spec: EnumSpec) -> bool:
        return record.get(spec.key, spec.default) in spec.allowed

    def icon(self, record: dict, regex: re.Pattern[str] = MDI_ICON_PATTERN) -> bool:
        """``icon`` 出现时必须是 ``mdi:`` 图标（缺省放行）。"""
        if 'icon' not in record:
            return True
        icon_value = record['icon']
        return isinstance(icon_value, str) and regex.fullmatch(icon_value) is not None

    # ── 记录（布局控件）通用判定 ────────────────────────────────────────

    def has_only(self, record: Any, allowed: frozenset[str]) -> bool:
        """是字典且没有白名单外的键。"""
        return isinstance(record, dict) and not set(record) - allowed

    def requires(self, record: Any, keys: Sequence[str]) -> bool:
        """是字典且这些键都在。"""
        return isinstance(record, dict) and all(key in record for key in keys)

    def require_text(self, record: dict, keys: Sequence[str], length: int = 128) -> bool:
        """这些键必须是长度受限的文本（空串放行：这些字段大多允许"未命名"）。"""
        return all(self.text(record.get(key, ''), length) for key in keys)

    def require_value(self, record: dict, keys: Sequence[str]) -> bool:
        """这些键必须存在且非空（id / floorId / modelId 这类身份字段）。"""
        return all(record.get(key) for key in keys)

    def numbers_within(self, record: dict, bounds: Sequence[tuple[str, float, float]]) -> bool:
        """这些键出现时必须落在各自区间内（缺省放行）。"""
        return all(key not in record or self.number(record[key], low, high) for key, low, high in bounds)

    def bounded_map(self, record: Any, bounds: Mapping[str, tuple[float, float]]) -> bool:
        """固定键表的映射（``baseLighting`` / ``effectDefaults``）：键必须在表内、值必须在各自区间内。

        与 :meth:`numbers_within` 的区别是**键表即白名单**：出现表外的键直接不合规。
        """
        if not isinstance(record, dict) or set(record) - set(bounds):
            return False
        return all(self.number(record[key], low, high) for key, (low, high) in bounds.items() if key in record)

    def required_numbers(self, record: dict, bounds: Sequence[tuple[str, float, float]]) -> bool:
        """这些键必须存在且落在各自区间内（灯的坐标就是这样）。"""
        return all(self.number(record.get(key), low, high) for key, low, high in bounds)

    def positive_fields(self, record: dict, keys: Sequence[str]) -> bool:
        """这些键出现时必须为正数（缺省放行）。"""
        return all(key not in record or self.positive_number(record[key]) for key in keys)

    def flag_fields(self, record: dict, keys: Sequence[str]) -> bool:
        """这些键出现时必须是布尔（``0``/``1`` 不算）。"""
        return all(key not in record or isinstance(record[key], bool) for key in keys)

    def optional_patterns(self, record: dict, spec: Sequence[tuple[str, re.Pattern[str]]]) -> bool:
        """绑定字段：有值就必须匹配（空串 / 缺省 / ``None`` 都视为未绑定）。"""
        for key, regex in spec:
            bound_entity = record.get(key)
            if not bound_entity:
                continue
            if not isinstance(bound_entity, str) or regex.fullmatch(bound_entity) is None:
                return False
        return True

    def strict_patterns(self, record: dict, spec: Sequence[tuple[str, re.Pattern[str]]]) -> bool:
        """绑定字段：**出现即必须是文本**（空串放行），非空必须匹配。"""
        for key, regex in spec:
            if key not in record:
                continue
            bound_entity = record[key]
            if not isinstance(bound_entity, str):
                return False
            if bound_entity and regex.fullmatch(bound_entity) is None:
                return False
        return True

    def bound_entity_id(self, record: dict, key: str, regex: re.Pattern[str]) -> bool:
        """实体绑定：必须是文本（空串表示未绑定），非空必须匹配。"""
        bound_entity = record.get(key)
        if not isinstance(bound_entity, str):
            return False
        return not bound_entity or regex.fullmatch(bound_entity) is not None

    def register_layout_widget(self, seen_ids: set, seen_models: set, widget: dict) -> bool:
        """登记控件的 ``id`` 与 ``(floorId, modelId)``；任一重复即返回 ``False``。"""
        widget_id = widget.get('id')
        model_key = (widget.get('floorId'), widget.get('modelId'))
        if widget_id in seen_ids or model_key in seen_models:
            return False
        seen_ids.add(widget_id)
        seen_models.add(model_key)
        return True

    # ── 相机 ────────────────────────────────────────────────────────────

    def validate_camera(self, camera: Any) -> None:
        if camera is None:
            return
        required = {'mode', 'zoom', 'target', 'position'}
        optional = {'up', 'view', 'frameSize', 'focalLength', 'topRotation'}
        if not isinstance(camera, dict) or not required.issubset(camera) or set(camera) - required - optional:
            self.fail()
        if camera['mode'] not in ('orthographic', 'perspective') or not self.number(camera['zoom'], 0.01, 100):
            self.fail()
        for axis_key in ('position', 'target', *(['up'] if 'up' in camera else [])):
            axis_values = camera[axis_key]
            if (
                not isinstance(axis_values, list)
                or len(axis_values) != 3
                or not all(self.number(component, -10000, 10000) for component in axis_values)
            ):
                self.fail()
        for key, low, high in (('frameSize', 0.001, 20000), ('topRotation', 0, 360), ('focalLength', 18, 120)):
            if key not in camera:
                continue
            if self.number(camera[key], low, high):
                continue
            self.fail()
        if 'view' in camera and camera['view'] not in ('free', 'top'):
            self.fail()


def validate_layout_widget(ctx: ValidationContext, widget: dict, rules: WidgetRules) -> None:
    """卡片类控件的共用骨架：坐标 / 尺寸 / 开关 / 点击动作 / 图标 / 相机。

    各控件在这之后还要补自己的额外判定（实体域、附加控制、地图 …）。
    """
    if rules.position_required:
        if not ctx.required_numbers(widget, rules.position_bounds):
            ctx.fail()
    elif not ctx.numbers_within(widget, rules.position_bounds):
        ctx.fail()
    if not ctx.positive_fields(widget, rules.size_fields):
        ctx.fail()
    if not ctx.flag_fields(widget, rules.flag_fields):
        ctx.fail()
    if not ctx.enum(widget, rules.click_action_enum):
        ctx.fail()
    if not ctx.icon(widget, rules.icon_pattern):
        ctx.fail()
    ctx.validate_camera(widget.get('focusCamera'))


__all__ = [
    "CLICK_ACTIONS",
    "CLICK_ACTIONS_FULL",
    "CLICK_ACTIONS_LITE",
    "CLICK_ACTIONS_PANEL_ONLY",
    "CLICK_ACTIONS_WITH_PANEL",
    "ENTITY_ID_PATTERN",
    "MDI_ICON_LOOSE_PATTERN",
    "MDI_ICON_PATTERN",
    "POSITION_BOUNDS",
    "SIZE_FIELDS",
    "WIDGET_FLAG_FIELDS",
    "EnumSpec",
    "ValidationContext",
    "WidgetRules",
    "validate_appliance_extras",
    "validate_layout_widget",
]
