"""``subscribe_entities`` 压缩协议的解码器。

HA 的 ``subscribe_events(state_changed)`` 每条事件都带完整的 ``old_state`` +
``new_state``（含全量 attributes）。大户型的 climate / media_player / 电量实体单条
1–3 KB，场景切换时 HA→HomeOS 的绝大部分入站流量与 JSON 解析、深拷贝成本都在这里。

``subscribe_entities`` 改推「压缩状态 + 增量 diff」：

- ``a``：新增实体（连接建立后的第一帧是**全量**实体，之后才是单个新增）；
- ``c``：变更差异，``+`` 段是新增/改写的键、``-`` 段是被删除的属性；
- ``r``：被移除的实体 id 列表。

键名是压缩后的单/双字符（``s`` state、``a`` attributes、``c`` context、
``lc`` last_changed、``lu`` last_updated），时间戳是 Unix 秒浮点。

本模块把这些帧还原成与 ``state_changed`` **同形状**的消息，交给既有的分派/合并/落地
链路，因此所有下游消费方（读模型、socket.io、StateHub、指标）零改动。

解码器必须保留每个实体的上一份状态才能计算 ``old_state`` —— 一旦发现某实体的基线
缺失（首帧未收到 / 进程内缓存被清），标记 ``needs_resync``，由连接循环安排一次
全量对账，而不是带着错误的 old_state 继续。
"""

from __future__ import annotations

from collections.abc import Iterable, Mapping
from datetime import UTC, datetime
from typing import Any

from .service_support import LOGGER
from ....platform.core.runtime.observability import record_ha_counter

#: 压缩键（与 HA ``homeassistant.const.COMPRESSED_STATE_*`` 一致）。
_KEY_STATE = 's'
_KEY_ATTRIBUTES = 'a'
_KEY_CONTEXT = 'c'
_KEY_LAST_CHANGED = 'lc'
_KEY_LAST_UPDATED = 'lu'

#: 差异段（与 HA ``STATE_DIFF_ADDITIONS`` / ``STATE_DIFF_REMOVALS`` 一致）。
_DIFF_ADD = '+'
_DIFF_REMOVE = '-'

#: 影子对比最多记录多少条「首个不一致」明细，之后只计数（避免日志被洪峰淹没）。
_SHADOW_DETAIL_LIMIT = 20


def _iso_from_timestamp(value: Any) -> str | None:
    """Unix 秒浮点 → HA ``as_dict`` 同格式的 ISO 字符串（UTC，带时区）。"""
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return None
    try:
        return datetime.fromtimestamp(float(value), UTC).isoformat()
    except (OverflowError, OSError, ValueError):
        return None


def _timestamp_from_iso(value: Any) -> float | None:
    if not isinstance(value, str) or not value:
        return None
    text = value.strip()
    if text.endswith('Z'):
        text = text[:-1] + '+00:00'
    try:
        parsed = datetime.fromisoformat(text)
    except ValueError:
        return None
    return parsed.timestamp()


def _full_state(entity_id: str, compressed: Mapping[str, Any]) -> dict[str, Any]:
    """压缩状态 → 与 ``get_states`` / ``state_changed.new_state`` 同形状的完整状态。"""
    context_value = compressed.get(_KEY_CONTEXT)
    if isinstance(context_value, str):
        context: dict[str, Any] = {'id': context_value, 'parent_id': None, 'user_id': None}
    elif isinstance(context_value, dict):
        context = dict(context_value)
    else:
        context = {}
    last_changed = compressed.get(_KEY_LAST_CHANGED)
    last_updated = compressed.get(_KEY_LAST_UPDATED, last_changed)
    attributes = compressed.get(_KEY_ATTRIBUTES)
    return {
        'entity_id': entity_id,
        'state': compressed.get(_KEY_STATE, 'unknown'),
        'attributes': dict(attributes) if isinstance(attributes, dict) else {},
        'last_changed': _iso_from_timestamp(last_changed),
        'last_updated': _iso_from_timestamp(last_updated),
        'context': context,
    }


def _apply_diff(previous: dict[str, Any], diff: Mapping[str, Any]) -> dict[str, Any]:
    """把 ``+`` / ``-`` 差异应用到上一份完整状态，返回**新的** dict（不改旧对象）。"""
    additions = diff.get(_DIFF_ADD)
    removals = diff.get(_DIFF_REMOVE)
    current = {
        **previous,
        'attributes': dict(previous.get('attributes') or {}),
    }
    if isinstance(additions, dict):
        if _KEY_STATE in additions:
            current['state'] = additions[_KEY_STATE]
        if _KEY_ATTRIBUTES in additions and isinstance(additions[_KEY_ATTRIBUTES], dict):
            current['attributes'].update(additions[_KEY_ATTRIBUTES])
        if _KEY_LAST_CHANGED in additions:
            # last_changed 变化时 HA 不再单独下发 lu（两者相等）。
            current['last_changed'] = _iso_from_timestamp(additions[_KEY_LAST_CHANGED])
            current['last_updated'] = current['last_changed']
        if _KEY_LAST_UPDATED in additions:
            current['last_updated'] = _iso_from_timestamp(additions[_KEY_LAST_UPDATED])
        if _KEY_CONTEXT in additions:
            context_value = additions[_KEY_CONTEXT]
            if isinstance(context_value, str):
                current['context'] = {'id': context_value, 'parent_id': None, 'user_id': None}
            elif isinstance(context_value, dict):
                current['context'] = {**dict(current.get('context') or {}), **context_value}
    if isinstance(removals, dict):
        removed_attributes = removals.get(_KEY_ATTRIBUTES)
        if isinstance(removed_attributes, Iterable) and not isinstance(removed_attributes, (str, bytes)):
            for key in removed_attributes:
                current['attributes'].pop(str(key), None)
    return current


def build_state_seed(states: Any) -> dict[str, tuple[str, float | None]]:
    """从全量快照构造解码器的比对基线（``entity_id → (state, last_updated_ts)``）。

    只保留 state 与时间戳两个字段：目的是判断「首帧全量里这条与刚同步过的快照是否
    同一次更新」，不需要保留 attributes（那才是内存大头）。
    """
    seed: dict[str, tuple[str, float | None]] = {}
    if not isinstance(states, list):
        return seed
    for raw in states:
        if not isinstance(raw, dict):
            continue
        entity_id = str(raw.get('entity_id') or '')
        if not entity_id:
            continue
        updated = _timestamp_from_iso(raw.get('last_updated') or raw.get('last_changed'))
        seed[entity_id] = (str(raw.get('state') or ''), updated)
    return seed


def _state_message(entity_id: str, old_state: dict[str, Any] | None, new_state: dict[str, Any] | None) -> dict[str, Any]:
    """构造与 ``subscribe_events`` 完全同形状的 ``state_changed`` 消息。"""
    time_fired = None
    if isinstance(new_state, dict):
        time_fired = new_state.get('last_updated') or new_state.get('last_changed')
    elif isinstance(old_state, dict):
        time_fired = old_state.get('last_updated') or old_state.get('last_changed')
    return {
        'type': 'event',
        'event': {
            'event_type': 'state_changed',
            'data': {
                'entity_id': entity_id,
                'old_state': old_state,
                'new_state': new_state,
            },
            'time_fired': time_fired,
        },
    }


class CompressedStateDecoder:
    """把 ``subscribe_entities`` 的 a/c/r 帧还原成 ``state_changed`` 消息序列。

    ``seed`` 来自连接建立前的全量同步（``entity_id → (state, last_updated_ts)``）：
    首帧 ``a`` 里与 seed 完全一致的实体不会向下游重复派发，避免每次重连都把
    全屋实体当成一次「全量变更」广播出去；否则重连成本等于一次全场景切换。
    """

    def __init__(self, seed: Mapping[str, tuple[str, float | None]] | None = None) -> None:
        self._states: dict[str, dict[str, Any]] = {}
        self._seed: dict[str, tuple[str, float | None]] = dict(seed or {})
        self._initialized = False
        #: 出现无法解释的增量（基线缺失）时置位，由调用方安排一次全量对账。
        self.needs_resync = False
        #: 统计：解码的帧数 / 实体数，便于和影子订阅对账。
        self.frames = 0
        self.entities = 0

    @property
    def initialized(self) -> bool:
        return self._initialized

    def known_state(self, entity_id: str) -> dict[str, Any] | None:
        return self._states.get(entity_id)

    def feed(self, message: Any) -> list[dict[str, Any]]:
        """解码一条 WS 消息；不是压缩帧时返回空列表（调用方走原有分派）。"""
        if not isinstance(message, dict) or message.get('type') != 'event':
            return []
        event = message.get('event')
        if not isinstance(event, dict) or 'event_type' in event:
            return []
        self.frames += 1
        emitted: list[dict[str, Any]] = []
        added = event.get('a')
        if isinstance(added, dict):
            emitted.extend(self._handle_added(added))
        removed = event.get('r')
        if isinstance(removed, list):
            emitted.extend(self._handle_removed(removed))
        changed = event.get('c')
        if isinstance(changed, dict):
            emitted.extend(self._handle_changed(changed))
        return emitted

    def _handle_added(self, added: Mapping[str, Any]) -> list[dict[str, Any]]:
        emitted: list[dict[str, Any]] = []
        for entity_id, compressed in added.items():
            if not isinstance(compressed, Mapping):
                continue
            full = _full_state(str(entity_id), compressed)
            self._states[str(entity_id)] = full
            self.entities += 1
            seeded = self._seed.pop(str(entity_id), None)
            if seeded is not None and self._matches_seed(full, seeded):
                # 与订阅前的全量快照一致：下游已经有这份状态，不必再派发一次。
                continue
            # 首帧之后的新增实体没有「旧值」可言；首帧里变化的实体也拿不到完整旧值，
            # 统一按 old=None 处理（下游会按「新状态」覆盖，语义正确）。
            emitted.append(_state_message(str(entity_id), None, full))
        if not self._initialized:
            # 首帧（全量）之后，seed 里剩下的实体就是订阅窗口内被删除/禁用的。
            for entity_id in list(self._seed):
                self._seed.pop(entity_id, None)
                previous = self._states.get(entity_id)
                self._states.pop(entity_id, None)
                if previous is not None:
                    emitted.append(_state_message(entity_id, previous, None))
                else:
                    emitted.append(_state_message(entity_id, None, None))
            self._initialized = True
        return emitted

    @staticmethod
    def _matches_seed(full: dict[str, Any], seeded: tuple[str, float | None]) -> bool:
        state, updated = seeded
        if str(full.get('state')) != str(state):
            return False
        current = _timestamp_from_iso(full.get('last_updated') or full.get('last_changed'))
        if updated is None or current is None:
            return False
        # 浮点时间戳经 ISO 往返可能差 1ms 以内；HA 的 lu 精度是微秒。
        return abs(current - updated) < 0.01

    def _handle_removed(self, removed: list[Any]) -> list[dict[str, Any]]:
        emitted: list[dict[str, Any]] = []
        for raw in removed:
            entity_id = str(raw or '')
            if not entity_id:
                continue
            previous = self._states.pop(entity_id, None)
            self._seed.pop(entity_id, None)
            emitted.append(_state_message(entity_id, previous, None))
        return emitted

    def _handle_changed(self, changed: Mapping[str, Any]) -> list[dict[str, Any]]:
        emitted: list[dict[str, Any]] = []
        for entity_id, diff in changed.items():
            entity_id = str(entity_id)
            previous = self._states.get(entity_id)
            if previous is None:
                # 没有基线就没法还原 old_state / 合并属性增量。静默跳过会让下游
                # 永远停在旧值，所以标记重同步，交给全量对账修复。
                self.needs_resync = True
                record_ha_counter('decode_resync')
                LOGGER.debug('HA 压缩状态缺少基线，将触发一次全量对账：%s', entity_id)
                continue
            if not isinstance(diff, Mapping):
                self.needs_resync = True
                record_ha_counter('decode_resync')
                continue
            current = _apply_diff(previous, diff)
            self._states[entity_id] = current
            self.entities += 1
            emitted.append(_state_message(entity_id, previous, current))
        return emitted


class ShadowStateTracker:
    """``subscribe_entities`` 的影子对比：同时订阅 ``state_changed``，按 ``lu`` 对齐比较。

    仅在诊断期开启（``haConnector.subscribeEntitiesShadow``）。它**不参与**下游派发，
    只回答一个问题：压缩解码出来的状态与全量事件是否逐字段一致。按 ``last_updated``
    对齐后才比较，避免两条流到达顺序不同造成假阳性。
    """

    def __init__(self) -> None:
        self._states: dict[str, tuple[str, dict[str, Any], float | None]] = {}
        self.compares = 0
        self.mismatches = 0
        self._details = 0

    def observe(self, message: Any, decoder: CompressedStateDecoder) -> None:
        if not isinstance(message, dict) or message.get('type') != 'event':
            return
        event = message.get('event')
        if not isinstance(event, dict) or event.get('event_type') != 'state_changed':
            return
        data = event.get('data')
        if not isinstance(data, dict):
            return
        new_state = data.get('new_state')
        if not isinstance(new_state, dict):
            return
        entity_id = str(new_state.get('entity_id') or '')
        if not entity_id:
            return
        updated = _timestamp_from_iso(new_state.get('last_updated') or new_state.get('last_changed'))
        attributes = new_state.get('attributes')
        self._states[entity_id] = (
            str(new_state.get('state')),
            dict(attributes) if isinstance(attributes, dict) else {},
            updated,
        )
        self._compare(entity_id, decoder)

    def _compare(self, entity_id: str, decoder: CompressedStateDecoder) -> None:
        shadow = self._states.get(entity_id)
        decoded = decoder.known_state(entity_id)
        if shadow is None or decoded is None:
            return
        state, attributes, updated = shadow
        current = _timestamp_from_iso(decoded.get('last_updated') or decoded.get('last_changed'))
        if updated is None or current is None or abs(current - updated) > 0.01:
            # 两条流还没对齐到同一次更新，比较没有意义。
            return
        self.compares += 1
        record_ha_counter('shadow_compare')
        decoded_attributes = decoded.get('attributes')
        if state == str(decoded.get('state')) and attributes == (decoded_attributes or {}):
            return
        self.mismatches += 1
        record_ha_counter('shadow_mismatch')
        if self._details < _SHADOW_DETAIL_LIMIT:
            self._details += 1
            LOGGER.warning(
                'HA 压缩状态与全量事件不一致（影子对比）：%s state=%s/%s attributes=%s/%s',
                entity_id,
                state,
                decoded.get('state'),
                len(attributes),
                len(decoded_attributes or {}),
            )
        elif self.mismatches % 500 == 1:
            LOGGER.warning(
                'HA 压缩状态影子对比累计不一致 %d/%d 次', self.mismatches, self.compares
            )
