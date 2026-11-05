"""窗帘 / 晾衣架的**展示用**姿态历史（有上限、可丢失、绝不回灌 HA）。

为什么需要它：HA 的 ``cover`` 实体在 ``opening`` / ``closing`` 期间通常只报方向、
不报实时位置，部分电机甚至在到位后才更新 ``current_position``。于是 3D 场景里的帘布
只能"跳"过去，动画与真实行程完全对不上。用户把位置拖到 60% 时，界面要么立刻跳到 60%
（实体根本没到），要么停在原地看着不动。

这份历史记录的是「上一次我们观察到/下发的位置、时长、时刻」，运行期用它做两件事：

- 推算补间位置（``estimates``）；
- 判定"到位后停在哪个端点"（``closedAt`` / ``closedNative``）。

三条硬边界，越界就是 bug：

1. **只读**：任何函数都不会向 HA 下发指令，也不会改变 HA 状态；
2. **有上限**：最多 :data:`MAX_ENTRIES` 条，超出按最旧驱逐；
3. **可丢失**：文件损坏 / 权限不足 / 磁盘满都只记日志，等价于"没有历史"，
   绝不能因此让启动失败或让控制请求 500 —— 它只影响动画好不好看。

落盘路径由调用方给出（``<data>/modules/interaction3d/cover-memory/history.json``），
备份清单里也含这一条，因此恢复备份后动画能接着用。
"""

from __future__ import annotations

import asyncio
import hashlib
import json
import logging
import math
import time
from collections.abc import Callable, Iterable
from copy import deepcopy
from datetime import datetime
from pathlib import Path
from typing import Any

from ....platform.core.runtime.atomic_write import atomic_write_text, ensure_private_dir

LOGGER = logging.getLogger(__name__)

#: 历史条数上限。1024 条约 300KB，按 60 秒节流写盘完全够用。
MAX_ENTRIES = 1024

#: 写盘节流（秒）。拖动滑杆会高频调用 ``observe``，逐次落盘会把 SD 卡写坏。
WRITE_DELAY_SECONDS = 2.0

#: 文件版本。结构不兼容时整份丢弃（宁可从零开始，也不猜旧格式）。
FILE_VERSION = 1


def number(value: Any) -> float | None:
    """读成 0–100 的有限浮点数；非数字 / 空串 / ``nan`` 一律 ``None``。"""
    if isinstance(value, bool) or not isinstance(value, (int, float, str)):
        return None
    if isinstance(value, str) and not value.strip():
        return None
    try:
        result = float(value)
    except (ValueError, OverflowError):
        return None
    if not math.isfinite(result):
        return None
    return max(0.0, min(100.0, result))


def _finite(value: Any) -> float | None:
    """严格意义上的数字（``bool`` 不算）→ ``float``；其余一律 ``None``。

    与 :func:`number` 的区别是**不夹区间**：时长这类量有自己的上下限，由调用方判定，
    这里只负责把「可能是任何东西」的原始值收窄成 ``float | None``。
    """
    if type(value) not in (int, float):
        return None
    try:
        # 超大整数（如 ``10**400``）转 float / 判有限性都会 OverflowError。
        return float(value) if math.isfinite(value) else None
    except OverflowError:
        return None


def report_time(state: dict) -> float | None:
    """把 ``updatedAt`` / ``last_updated`` 解析成毫秒时间戳；解析不出来返回 ``None``。"""
    raw = state.get('updatedAt') or state.get('last_updated')
    if not isinstance(raw, str) or not raw:
        return None
    try:
        # Python 3.11+ 的 ``fromisoformat`` 直接认 ``Z`` 后缀，不必再手工替换。
        return datetime.fromisoformat(raw).timestamp() * 1000
    except (ValueError, OverflowError):
        return None


def native_tilt(attributes: dict) -> bool:
    """实体是否**原生**支持叶片（``WeatherEntityFeature`` 之外的另一组位）。

    ``supported_features`` 的 240 位（16+32+64+128）是 tilt 家族；
    或者实体直接报了 ``current_tilt_position``。两者任一成立即视为有叶片。
    """
    raw = attributes.get('supported_features')
    try:
        features = int(float(raw)) if raw is not None else 0
    except (ValueError, TypeError, OverflowError):
        features = 0
    return bool(features & 240) or number(attributes.get('current_tilt_position')) is not None


def memory_axis(binding: dict, *, airer: bool = False) -> str:
    """记忆轴：同一台电机在不同"接线方向"下的行程语义完全不同。

    - 晾衣架：``airer:{positionReversed}:{liftReversed}`` —— 升降与位置两个方向都要区分；
    - 窗帘：梦幻帘（``coverKind == 'dream'``）与普通轨道不能共用一份历史，
      因为梦幻帘的"位置"还混着叶片状态。
    """
    if airer:
        return (
            f"airer:{int(binding.get('positionReversed') is True)}:"
            f"{int(binding.get('liftReversed') is True)}"
        )
    return 'dream' if binding.get('coverKind') == 'dream' else 'rail'


def sample(value: dict, now: float) -> dict[str, Any] | None:
    """把一次「位置 → 目标」的观察压缩成一条补间样本。"""
    if not isinstance(value, dict):
        return None
    target = number(value.get('target'))
    start = number(value.get('position'))
    if target is None and start is None:
        return None
    result: dict[str, Any] = {'at': now}
    if start is not None:
        result['position'] = start
    if target is not None:
        result['target'] = target
    duration = _finite(value.get('duration'))
    if duration is not None and 0 < duration <= 600:
        result['duration'] = duration
    return result


class CoverMemory:
    """一条连接作用域下的姿态历史。

    线程 / 任务模型：全部方法都在事件循环里调用；写盘用 ``asyncio.to_thread`` 抖动到
    后台，调用方永远不被磁盘阻塞（磁盘慢的时候宁可少写一次）。
    """

    def __init__(
        self,
        path: Path | str,
        *,
        now: Callable[[], float] = time.time,
        credential: Callable[[], str] | None = None,
    ) -> None:
        self.path = Path(path)
        self.now = now
        self.credential = credential
        self.scope = ''
        self.entries: dict[str, dict[str, Any]] = {}
        self.generation = object()
        self._timer: asyncio.TimerHandle | None = None
        self._write_lock = asyncio.Lock()
        self._dirty = False
        self._tokens: dict[str, dict[str, Any]] = {}
        self._sequence = 0

    # ---- 生命周期 ---------------------------------------------------------

    def reload(self) -> None:
        """重新从磁盘读取（切换连接 / 恢复备份后调用）。"""
        path = self.path
        now = self.now
        credential = self.credential
        self.__init__(path, now=now, credential=credential)

    def connection_scope(self) -> str:
        """由凭据派生的作用域：不同 HA 连接的同一 ``entity_id`` 不能共用历史。"""
        if self.credential is None:
            return self.scope
        try:
            secret = str(self.credential() or '')
        except Exception:
            secret = ''
        if not secret:
            return ''
        return hashlib.sha256(secret.encode('utf-8')).hexdigest()[:32]

    def activate(self) -> None:
        """在当前作用域下重新加载历史（凭据变化时会自动清空）。"""
        self.activate_scope(self.connection_scope())

    def activate_scope(self, scope: str) -> None:
        if scope == self.scope and self.entries:
            return
        self.scope = scope
        self.entries = {}
        self._tokens = {}
        if not scope:
            return
        self._load()

    def _load(self) -> None:
        try:
            payload = json.loads(self.path.read_text(encoding='utf-8'))
        except FileNotFoundError:
            return
        except (OSError, ValueError):
            LOGGER.warning('窗帘姿态历史读取失败，按空历史处理：%s', self.path, exc_info=True)
            return
        if not isinstance(payload, dict) or payload.get('version') != FILE_VERSION:
            return
        if payload.get('scope') != self.scope:
            return
        entries = payload.get('entries')
        if not isinstance(entries, dict):
            return
        self.entries = {
            key: value for key, value in entries.items() if isinstance(key, str) and isinstance(value, dict)
        }
        self._prune()

    # ---- 写入节流 ---------------------------------------------------------

    def _prune(self) -> None:
        """按 ``reportAt`` 从旧到新驱逐，直到回到上限内。"""
        if len(self.entries) <= MAX_ENTRIES:
            return
        ordered = sorted(
            self.entries.items(),
            key=lambda pair: pair[1].get('reportAt') or 0,
        )
        for key, _ in ordered[: len(self.entries) - MAX_ENTRIES]:
            self.entries.pop(key, None)

    def _changed(self) -> None:
        self._dirty = True
        self._schedule_write()

    def _schedule_write(self) -> None:
        if self._timer is not None:
            return
        try:
            loop = asyncio.get_running_loop()
        except RuntimeError:
            # 没有事件循环（测试 / 同步上下文）时直接写，保证行为可预测。
            self.flush()
            return
        generation = self.generation
        self._timer = loop.call_later(WRITE_DELAY_SECONDS, lambda: asyncio.ensure_future(self._flush_once(generation)))

    async def _flush_once(self, generation: object) -> None:
        if generation is not self.generation:
            return
        self._timer = None
        if not self._dirty:
            return
        self._dirty = False
        await self._write()

    def flush(self) -> None:
        """立即落盘（同步版本，供关闭 / 备份前调用）。"""
        if self._timer is not None:
            self._timer.cancel()
            self._timer = None
        if not self._dirty:
            return
        self._dirty = False
        payload = self._payload()
        try:
            ensure_private_dir(self.path.parent)
            atomic_write_text(
                self.path,
                json.dumps(payload, ensure_ascii=False, separators=(',', ':')),
            )
        except OSError:
            LOGGER.warning('窗帘姿态历史写入失败（忽略，不影响控制）：%s', self.path, exc_info=True)

    async def _write(self) -> None:
        async with self._write_lock:
            payload = self._payload()
            try:
                await asyncio.to_thread(
                    self._write_sync,
                    payload,
                )
            except OSError:
                LOGGER.warning('窗帘姿态历史写入失败（忽略，不影响控制）：%s', self.path, exc_info=True)

    def _write_sync(self, payload: dict) -> None:
        ensure_private_dir(self.path.parent)
        atomic_write_text(
            self.path,
            json.dumps(payload, ensure_ascii=False, separators=(',', ':')),
        )

    def _payload(self) -> dict[str, Any]:
        return {
            'version': FILE_VERSION,
            'scope': self.scope,
            'entries': self.entries,
        }

    # ---- 观察与指令 -------------------------------------------------------

    def observe(self, entity_id: str, state: dict | None, *, axis: str = 'rail') -> None:
        """记录一次实体状态（HA 推送 / 轮询都会走这里）。"""
        if not isinstance(state, dict):
            return
        attributes = state.get('attributes') or {}
        if not isinstance(attributes, dict):
            attributes = {}
        current = number(attributes.get('current_position'))
        tilt = number(attributes.get('current_tilt_position'))
        reported = report_time(state)
        entry = self.entries.get(entity_id) or {}
        last_state = entry.get('lastState')
        previous = entry.get('open')
        entry.update({
            'entityId': entity_id,
            'identity': axis,
            'available': state.get('available') is not False,
            'state': str(state.get('state') or '')[:32],
            'lastState': last_state,
            'reportAt': reported if reported is not None else self.now() * 1000,
            'nativeTilt': native_tilt(attributes),
            'attributes': {
                'current_position': current,
                'tilt': tilt,
            },
        })
        if current is not None:
            entry['open'] = current
            if current <= 0 or current >= 100:
                entry['closedAt'] = entry['reportAt']
                entry['closedNative'] = True
            else:
                entry['closedNative'] = False
        if previous is not None and current is not None and previous != current:
            estimate = sample(
                {'position': previous, 'target': current, 'duration': entry.get('duration')},
                self.now(),
            )
            if estimate is not None:
                entry.setdefault('estimates', []).append(estimate)
                # 只留最近 8 条：动画只用得上最后一段。
                entry['estimates'] = entry['estimates'][-8:]
        self.entries[entity_id] = entry
        self._prune()
        self._changed()

    def observe_states(self, states: Iterable[dict], *, source: str | None = None) -> list[str]:
        """批量观察（``StateHub`` 的 observe 回调入口），返回**发生变化**的实体号。

        ``source`` 是发起这次观察的状态来源（``StateHub.source_key``）。与当前作用域
        不符时整批丢弃：换了 HA 连接之后，旧连接迟到的状态不该写进新连接的历史。

        记忆轴沿用条目里已登记的 ``identity``：轴由「绑定配置」决定，而状态流本身
        不带绑定信息，硬猜只会在梦幻帘与普通轨道之间串数据。
        """
        if self.scope and source is not None and source != self.scope:
            return []
        changed: list[str] = []
        for state in states:
            if not isinstance(state, dict):
                continue
            entity_id = str(state.get('entityId') or '')
            if not entity_id.startswith('cover.'):
                continue
            entry = self.entries.get(entity_id)
            axis = entry.get('identity') if isinstance(entry, dict) else None
            before = deepcopy(entry) if isinstance(entry, dict) else None
            self.observe(entity_id, state, axis=str(axis or 'rail'))
            if self.entries.get(entity_id) != before:
                changed.append(entity_id)
        return changed

    def identify(self, entity_id: str, axis: str) -> dict[str, Any] | None:
        """取某实体在某条记忆轴上的历史条目。"""
        entry = self.entries.get(entity_id)
        if not isinstance(entry, dict) or entry.get('identity') != axis:
            return None
        return deepcopy(entry)

    def snapshot(self, axis: str | None = None) -> dict[str, Any]:
        """给 ``GET /cover-memory`` 用的只读快照。"""
        entries = {
            key: deepcopy(value)
            for key, value in self.entries.items()
            if axis is None or value.get('identity') == axis
        }
        return {'version': FILE_VERSION, 'scope': self.scope, 'entries': entries}

    def begin(self, token: str, entity_id: str, *, target: float | None, axis: str = 'rail') -> None:
        """登记一次下发（在**网络 I/O 之前**），保证失败时能回滚顺序。"""
        self._sequence += 1
        self._tokens[token] = {
            'entityId': entity_id,
            'axis': axis,
            'target': target,
            'at': self.now(),
            'sequence': self._sequence,
        }

    def complete(self, token: str, *, ok: bool) -> None:
        """下发结束后决定是否把这次目标写进历史。

        只有成功才写：失败的指令若也记下目标，动画会朝着一个**没发生**的位移跑，
        用户看到的画面与设备真实状态相反。
        """
        record = self._tokens.pop(token, None)
        if record is None or not ok:
            return
        entity_id = record['entityId']
        entry = self.entries.get(entity_id) or {}
        previous = entry.get('open')
        estimate = sample(
            {'position': previous, 'target': record['target'], 'duration': entry.get('duration')},
            self.now(),
        )
        entry.update({
            'entityId': entity_id,
            'identity': record['axis'],
            'reportAt': self.now() * 1000,
        })
        if estimate is not None:
            entry.setdefault('estimates', []).append(estimate)
            entry['estimates'] = entry['estimates'][-8:]
        self.entries[entity_id] = entry
        self._prune()
        self._changed()
