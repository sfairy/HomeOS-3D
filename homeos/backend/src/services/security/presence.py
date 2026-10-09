"""人员存在感知服务（对齐 ``PresenceService``）。

聚合 person / device_tracker / 门锁门磁 / mmWave 雷达判定家庭成员是否在家，
并发出 ``presence.changed`` / ``presence.everyoneLeft`` 事件；状态持久化到
``RuntimeKv``（键 ``presence-state``）。
"""

from __future__ import annotations

import asyncio
import contextlib
import json
import logging
import time
from collections.abc import Callable
from typing import Any

from .bus import LocalEventBus
from .mmwave import MmWavePresenceService
from ...core.runtime_kv import load_runtime_kv, persist_runtime_kv

logger = logging.getLogger("homeos.security.presence")

PRESENCE_CONFIG_ID = "presence-state"
CHECK_INTERVAL_SECONDS = 30.0
PERSIST_INTERVAL_SECONDS = 15.0


class PresenceService:
    def __init__(
        self,
        session_factory,
        bus: LocalEventBus,
        config_reader: Callable[[], dict[str, Any]],
        state_store,
        mmwave: MmWavePresenceService,
        jobs: Any = None,
    ) -> None:
        self._session_factory = session_factory
        self._bus = bus
        self._config = config_reader
        self._state_store = state_store
        self._mmwave = mmwave
        self._jobs = jobs

        self._entity_states: dict[str, dict[str, Any]] = {}
        self._person_aggregates: dict[str, dict[str, Any]] = {}
        self._away_confirmations: dict[str, float] = {}
        self._everyone_left_emitted = False
        self._dirty = False

        self._check_task: asyncio.Task | None = None
        self._persist_task: asyncio.Task | None = None

    @property
    def _away_threshold_ms(self) -> float:
        return float(self._config().get("awayConfirmMin") or 5) * 60_000

    # ------------------------------------------------------------------ #
    # 生命周期
    # ------------------------------------------------------------------ #
    async def start(self) -> None:
        await self._load_persisted_state()
        self._prune_untracked_entities()
        self._sync_person_aggregates(False)
        self._check_task = asyncio.create_task(self._check_loop(), name="presence-check")
        self._persist_task = asyncio.create_task(self._persist_loop(), name="presence-persist")
        logger.info("人员存在感知服务已启动")

    async def stop(self) -> None:
        for task in (self._check_task, self._persist_task):
            if task is not None:
                task.cancel()
                with contextlib.suppress(asyncio.CancelledError, Exception):
                    await task
        self._check_task = None
        self._persist_task = None
        await self._flush_persisted_state()

    async def _check_loop(self) -> None:
        while True:
            await asyncio.sleep(CHECK_INTERVAL_SECONDS)
            await self._run_monitored(
                "presence-check", "人员存在周期检查", 30_000, self.periodic_check
            )

    async def _persist_loop(self) -> None:
        while True:
            await asyncio.sleep(PERSIST_INTERVAL_SECONDS)
            await self._run_monitored(
                "presence-persist", "人员存在状态落库", 15_000, self._flush_persisted_state
            )

    async def _run_monitored(
        self, name: str, description: str, interval_ms: int, fn: Callable[[], Any]
    ) -> Any:
        """执行一次带监控的周期作业（未注入 JobRegistry 时直接执行）。"""
        try:
            if self._jobs is None:
                return await fn()
            return await self._jobs.run(
                name, {"description": description, "intervalMs": interval_ms}, fn
            )
        except Exception as exc:
            logger.warning("%s 执行失败: %s", description, exc)
            return None

    # ------------------------------------------------------------------ #
    # 配置视图
    # ------------------------------------------------------------------ #
    def get_presence_persons(self) -> list[dict[str, Any]]:
        raw = self._config().get("presencePersons")
        if not isinstance(raw, list):
            return []
        result: list[dict[str, Any]] = []
        for item in raw:
            if not isinstance(item, dict):
                continue
            name = str(item.get("name") or "").strip()
            entity_ids = (
                [str(i).strip() for i in item.get("entityIds", []) if str(i).strip()]
                if isinstance(item.get("entityIds"), list)
                else []
            )
            if not name or not entity_ids:
                continue
            person_id = str(item.get("id") or "").strip() or (
                f"p_{name.replace(' ', '_')}_{entity_ids[0].replace('.', '_')}"
            )
            entry: dict[str, Any] = {"id": person_id, "name": name, "entityIds": entity_ids}
            user_id = str(item.get("userId") or "").strip()
            if user_id:
                entry["userId"] = user_id
            result.append(entry)
        return result

    def get_configured_entity_ids(self) -> list[str]:
        persons = self.get_presence_persons()
        if not persons:
            return []
        seen: dict[str, None] = {}
        for person in persons:
            for entity_id in person["entityIds"]:
                seen.setdefault(entity_id, None)
        return list(seen)

    def _require_configured_persons(self) -> bool:
        return self._config().get("requireConfiguredPersons") is True

    def is_auto_track_mode(self) -> bool:
        if self.get_presence_persons():
            return False
        return not self._require_configured_persons()

    @staticmethod
    def _is_trackable_domain(entity_id: str) -> bool:
        return entity_id.startswith(("person.", "device_tracker."))

    def should_track_entity(self, entity_id: str) -> bool:
        if not self._is_trackable_domain(entity_id):
            return False
        configured = self.get_configured_entity_ids()
        if not configured:
            return self.is_auto_track_mode()
        return entity_id in configured

    # ------------------------------------------------------------------ #
    # 成员视图
    # ------------------------------------------------------------------ #
    @staticmethod
    def _parse_at_home_state(state: Any) -> bool | None:
        value = str(state if state is not None else "").lower().strip()
        if value in ("home", "true"):
            return True
        if value in ("not_home", "away", "false"):
            return False
        return None

    def _entity_at_home(self, entity_id: str) -> bool | None:
        state = self._entity_states.get(entity_id)
        if state is None:
            return None
        return bool(state.get("atHome"))

    def _entity_id_to_member_id(self, entity_id: str, source: str) -> str:
        if source == "device_tracker":
            return f"tracker:{entity_id}"
        if source == "ha_person":
            return f"person:{entity_id}"
        return entity_id

    def _build_auto_mode_members(self) -> list[dict[str, Any]]:
        result: list[dict[str, Any]] = []
        for state in self._entity_states.values():
            if not self.should_track_entity(state["entityId"]):
                continue
            result.append(
                {
                    "id": self._entity_id_to_member_id(state["entityId"], state["source"]),
                    "name": state["name"],
                    "source": state["source"],
                    "atHome": state["atHome"],
                    "lastSeen": state["lastSeen"],
                }
            )
        return result

    def _build_configured_person_members(self) -> list[dict[str, Any]]:
        members: list[dict[str, Any]] = []
        for person in self.get_presence_persons():
            at_home = any(self._entity_at_home(i) is True for i in person["entityIds"])
            last_seen = ""
            for entity_id in person["entityIds"]:
                seen = (self._entity_states.get(entity_id) or {}).get("lastSeen")
                if seen and (not last_seen or seen > last_seen):
                    last_seen = seen
            entry = {
                "id": f"person:{person['id']}",
                "name": person["name"],
                "source": "configured",
                "atHome": at_home,
                "lastSeen": last_seen or _iso_now(),
            }
            if person.get("userId"):
                entry["userId"] = person["userId"]
            members.append(entry)
        return members

    def _get_tracked_members(self) -> list[dict[str, Any]]:
        if self.is_auto_track_mode():
            return self._build_auto_mode_members()
        return self._build_configured_person_members()

    def get_all_members(self) -> list[dict[str, Any]]:
        return self._get_tracked_members()

    def _mmwave_home_occupied(self) -> bool:
        if not self._config().get("mmWaveFusePresence"):
            return False
        try:
            return bool(self._mmwave.get_summary().get("homeOccupied"))
        except Exception:
            return False

    def is_anyone_home(self) -> bool:
        return any(m.get("atHome") for m in self._get_tracked_members()) or self._mmwave_home_occupied()

    def get_at_home_count(self) -> int:
        return sum(1 for m in self._get_tracked_members() if m.get("atHome"))

    def is_room_occupied(self, room: str) -> bool:
        return bool((self._mmwave.get_room_presence(room) or {}).get("occupied"))

    # ------------------------------------------------------------------ #
    # HTTP 响应
    # ------------------------------------------------------------------ #
    async def get_home_presence_response(self) -> dict[str, Any]:
        members = self.get_all_members()
        mmwave_enabled = bool(self._config().get("mmWaveFusePresence"))
        return {
            "anyoneHome": self.is_anyone_home(),
            "atHomeCount": sum(1 for m in members if m.get("atHome")),
            "members": members,
            "entityIds": self.get_configured_entity_ids(),
            "autoMode": self.is_auto_track_mode(),
            "persons": self.get_presence_persons(),
            "rooms": self._mmwave.get_all_room_presence() if mmwave_enabled else {},
        }

    # ------------------------------------------------------------------ #
    # 状态变更
    # ------------------------------------------------------------------ #
    async def handle_state_change(self, event: dict[str, Any]) -> None:
        entity_id = str(event.get("entity_id") or "")
        new_state = (event.get("new_state") or {}).get("state")

        # 门锁/门磁开启是「有人到家」的强证据，用于取消离家确认倒计时。
        # 该分支必须先于 should_track_entity 早退：后者只放行 person./device_tracker，
        # 否则 lock/door 事件永远不可达，自动模式下无法用开锁快速取消离家。
        if entity_id.startswith(("lock.", "binary_sensor.door")) and new_state in (
            "unlocked",
            "on",
        ):
            self.confirm_home()
            logger.debug("门锁事件:%s → %s", entity_id, new_state)

        if not self.should_track_entity(entity_id):
            return

        if entity_id.startswith("person."):
            self._handle_person_update(entity_id, new_state or "unknown", event.get("new_state"))

        if entity_id.startswith("device_tracker."):
            attrs = (event.get("new_state") or {}).get("attributes") or {}
            name = attrs.get("friendly_name") or entity_id.split(".")[1] or "unknown"
            self._apply_presence_entity_update(entity_id, str(name), "device_tracker", new_state)

    def seed_from_state_store(self) -> None:
        configured = self.get_configured_entity_ids()
        entities: list[dict[str, Any]] = []
        if configured and self._state_store is not None:
            entities = [
                entity
                for entity in (self._state_store.get(i) for i in configured)
                if isinstance(entity, dict)
            ]
        elif self.is_auto_track_mode() and self._state_store is not None:
            entities = [
                entity
                for entity in self._state_store.get_all()
                if isinstance(entity, dict)
                and (
                    str(entity.get("entity_id") or "").startswith("person.")
                    or str(entity.get("entity_id") or "").startswith("device_tracker.")
                )
            ]
        else:
            return
        for entity in entities:
            self._apply_entity_state(str(entity.get("entity_id") or ""), entity)

    def _apply_entity_state(self, entity_id: str, entity: dict[str, Any]) -> None:
        if not self.should_track_entity(entity_id):
            return
        if entity_id.startswith("person."):
            self._handle_person_update(entity_id, entity.get("state") or "unknown", entity)
            return
        if entity_id.startswith("device_tracker."):
            attrs = entity.get("attributes") or {}
            name = attrs.get("friendly_name") or entity_id.split(".")[1] or "unknown"
            self._apply_presence_entity_update(
                entity_id, str(name), "device_tracker", entity.get("state")
            )

    def _handle_person_update(
        self, entity_id: str, new_state: str, new_state_obj: dict[str, Any] | None
    ) -> None:
        attributes = (new_state_obj or {}).get("attributes") or {}
        raw_name = attributes.get("friendly_name")
        name = (
            str(raw_name).strip()
            if isinstance(raw_name, str) and str(raw_name).strip()
            else (entity_id.split(".")[1] or entity_id)
        )
        applied = self._apply_presence_entity_update(entity_id, name, "ha_person", new_state)
        if applied is not None:
            logger.debug("实体更新: %s → %s", name, "在家" if applied else "离家")
        else:
            logger.debug("实体更新: %s → 状态未知(%s),保持原判定", name, new_state)

    def _apply_presence_entity_update(
        self, entity_id: str, name: str, source: str, raw_state: Any
    ) -> bool | None:
        parsed = self._parse_at_home_state(raw_state)
        if parsed is None:
            prev = self._entity_states.get(entity_id)
            if prev:
                self._entity_states[entity_id] = {
                    **prev,
                    "name": name,
                    "lastSeen": _iso_now(),
                }
                self._mark_dirty()
            return None
        self._update_entity_state(entity_id, name, source, parsed)
        return parsed

    def _update_entity_state(
        self, entity_id: str, name: str, source: str, at_home: bool
    ) -> None:
        self._entity_states[entity_id] = {
            "entityId": entity_id,
            "name": name,
            "source": source,
            "atHome": at_home,
            "lastSeen": _iso_now(),
        }
        self._mark_dirty()
        self._sync_person_aggregates(True)
        if at_home:
            self.confirm_home()

    def _sync_person_aggregates(self, emit_events: bool) -> None:
        if self.is_auto_track_mode():
            for state in list(self._entity_states.values()):
                if not self.should_track_entity(state["entityId"]):
                    continue
                member_id = self._entity_id_to_member_id(state["entityId"], state["source"])
                self._apply_aggregate_change(
                    member_id, state["name"], bool(state["atHome"]), emit_events
                )
            return
        for person in self.get_presence_persons():
            member_id = f"person:{person['id']}"
            at_home = any(self._entity_at_home(i) is True for i in person["entityIds"])
            self._apply_aggregate_change(member_id, person["name"], at_home, emit_events)

    def _apply_aggregate_change(
        self, member_id: str, name: str, at_home: bool, emit_events: bool
    ) -> None:
        prev = self._person_aggregates.get(member_id)
        was_home = prev.get("atHome") if prev else None
        self._person_aggregates[member_id] = {"name": name, "atHome": at_home}
        self._mark_dirty()

        if not emit_events or was_home is None or was_home == at_home:
            return

        self._bus.emit_soon(
            "presence.changed",
            {"memberId": member_id, "name": name, "atHome": at_home, "timestamp": _iso_now()},
        )
        if at_home:
            logger.info("🏠 %s 已到家", name)
            self._everyone_left_emitted = False
            self._away_confirmations.pop(member_id, None)
        else:
            logger.info("🚶 %s 已离家", name)
            self._away_confirmations[member_id] = time.time() * 1000

    def confirm_home(self) -> None:
        self._everyone_left_emitted = False
        self._away_confirmations.clear()

    def _is_member_tracked(self, member_id: str) -> bool:
        if self.is_auto_track_mode():
            entity_id = self._resolve_member_entity_id(member_id)
            if not entity_id:
                return True
            return self.should_track_entity(entity_id)
        return member_id.startswith("person:") and member_id in self._person_aggregates

    @staticmethod
    def _resolve_member_entity_id(member_id: str) -> str | None:
        if member_id.startswith("person:"):
            rest = member_id[len("person:") :]
            return rest if "." in rest else None
        if member_id.startswith("tracker:"):
            return member_id[len("tracker:") :]
        if "." in member_id:
            return member_id
        return None

    async def periodic_check(self) -> None:
        now = time.time() * 1000
        members = self._get_tracked_members()
        if not members:
            self._away_confirmations.clear()
            self._everyone_left_emitted = False
            return

        anyone_home = any(m.get("atHome") for m in members) or self._mmwave_home_occupied()
        if anyone_home:
            self._everyone_left_emitted = False
            for member_id, ts in list(self._away_confirmations.items()):
                if not self._is_member_tracked(member_id):
                    self._away_confirmations.pop(member_id, None)
                    continue
                if now - ts > self._away_threshold_ms * 4:
                    self._away_confirmations.pop(member_id, None)
            return

        if self._everyone_left_emitted:
            return

        latest_away = 0.0
        last_member_name = "未知"
        for member_id, ts in self._away_confirmations.items():
            if not self._is_member_tracked(member_id):
                continue
            if ts > latest_away:
                latest_away = ts
                last_member_name = (self._person_aggregates.get(member_id) or {}).get(
                    "name", last_member_name
                )
        if latest_away == 0:
            return
        if now - latest_away >= self._away_threshold_ms:
            self._everyone_left_emitted = True
            self._mark_dirty()
            await self._bus.emit(
                "presence.everyoneLeft", {"lastMember": last_member_name, "timestamp": _iso_now()}
            )
            logger.info("所有成员已离家")

    def remove_member(self, entity_id: str) -> None:
        aggregate_id = self._resolve_aggregate_member_id(entity_id)
        if aggregate_id:
            self._person_aggregates.pop(aggregate_id, None)
            self._away_confirmations.pop(aggregate_id, None)
        resolved = self._resolve_member_entity_id(entity_id)
        if resolved:
            self._entity_states.pop(resolved, None)
        self._mark_dirty()

    def _resolve_aggregate_member_id(self, member_id: str) -> str | None:
        if member_id.startswith("person:"):
            return member_id
        entity_id = self._resolve_member_entity_id(member_id)
        if not entity_id:
            return member_id
        persons = self.get_presence_persons()
        if not persons:
            return member_id
        for person in persons:
            if entity_id in person["entityIds"]:
                return f"person:{person['id']}"
        return None

    def _prune_untracked_entities(self) -> None:
        changed = False
        for entity_id in list(self._entity_states.keys()):
            if not self.should_track_entity(entity_id):
                self._entity_states.pop(entity_id, None)
                changed = True
        valid_person_ids = {f"person:{p['id']}" for p in self.get_presence_persons()}
        for member_id in list(self._person_aggregates.keys()):
            if not self.is_auto_track_mode() and member_id not in valid_person_ids:
                self._person_aggregates.pop(member_id, None)
                self._away_confirmations.pop(member_id, None)
                changed = True
        if changed:
            self._mark_dirty()

    def on_config_updated(self, sections: list[str] | None = None) -> None:
        if sections and "security" not in sections:
            return
        self._prune_untracked_entities()
        self._sync_person_aggregates(False)
        self.seed_from_state_store()

    # ------------------------------------------------------------------ #
    # 持久化
    # ------------------------------------------------------------------ #
    def _mark_dirty(self) -> None:
        self._dirty = True

    async def _load_persisted_state(self) -> None:
        try:
            with self._session_factory() as session:
                data = load_runtime_kv(session, PRESENCE_CONFIG_ID)
        except Exception:
            data = None
        if not isinstance(data, dict):
            return
        self._entity_states = {}
        self._person_aggregates = {}
        self._away_confirmations = {}
        entity_states = data.get("entityStates")
        if isinstance(entity_states, dict):
            for key, state in entity_states.items():
                if isinstance(state, dict) and state.get("entityId"):
                    self._entity_states[key] = state
        person_aggregates = data.get("personAggregates")
        if isinstance(person_aggregates, dict):
            for key, state in person_aggregates.items():
                if isinstance(state, dict):
                    self._person_aggregates[key] = state
        away_confirmations = data.get("awayConfirmations")
        if isinstance(away_confirmations, dict):
            for key, ts in away_confirmations.items():
                self._away_confirmations[key] = float(ts)
        self._everyone_left_emitted = bool(data.get("everyoneLeftEmitted"))
        logger.info("人员状态已恢复: %s 个实体", len(self._entity_states))

    async def _flush_persisted_state(self) -> None:
        if not self._dirty:
            return
        self._dirty = False
        payload = {
            "entityStates": self._entity_states,
            "personAggregates": self._person_aggregates,
            "awayConfirmations": self._away_confirmations,
            "everyoneLeftEmitted": self._everyone_left_emitted,
        }
        try:
            payload = json.loads(json.dumps(payload, ensure_ascii=False, default=str))
            await asyncio.to_thread(
                persist_runtime_kv, self._session_factory, PRESENCE_CONFIG_ID, payload
            )
        except Exception as exc:
            logger.warning("人员状态写入失败,将在下次重试: %s", exc)
            self._dirty = True


def _iso_now() -> str:
    from datetime import UTC, datetime

    now = datetime.now(UTC)
    return now.strftime("%Y-%m-%dT%H:%M:%S.") + f"{now.microsecond // 1000:03d}Z"
