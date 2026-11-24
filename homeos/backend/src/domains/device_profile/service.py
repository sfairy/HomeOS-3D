"""设备画像分类、别名与房间默认设备（对齐参考 ``device-profile``）。

职责范围刻意收窄到三个域：

- ``media_player``：Apple TV / 电视 / 音箱 / 功放；
- ``climate``：挂机 / 中央空调 / 锅炉 / 地暖 / 热水器 / 浴霸；
- ``water_heater``：HA 原生热水器（形态同样无法从属性推断，必须人工确认）。

``climate`` / ``water_heater`` 恒为 ``unknown`` 且必须人工确认：制热形态无法从属性可靠推断，
猜错会让「调温度」下发到错误的服务参数（例如给地暖下发 ``hvac_mode``）。
"""

from __future__ import annotations

import json
import logging
import threading
import time
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import delete, select

from .appletv import AppleTvMixin
from .schema import DeviceProfile, DeviceProfileAudit, DeviceProfileDefault

logger = logging.getLogger("homeos.device_profile")

from .classify import (
    ALLOWED_KINDS,
    CLASSIFIER_VERSION,
    CLIMATE_KINDS,
    DEFAULT_MEDIA_KINDS,
    MEDIA_KINDS,
    alias_hit,
    attr_map,
    attributes_hash,
    classify,
    is_reachable,
    is_usable_profile,
    normalize_aliases,
    normalize_text,
    text,
)

# 规则层在本模块沿用私有名，调用点不必逐个改写。
_text = text
_attr_map = attr_map
_normalize_text = normalize_text
_alias_hit = alias_hit
_PROFILE_DOMAINS = PROFILE_DOMAINS = ("media_player", "climate", "water_heater")
_ALLOWED_KINDS = ALLOWED_KINDS

#: 画像索引缓存：快路径每轮对话都会问一次别名 / kind，直接读 SQLite 会把一句话拖成多次磁盘读。
_INDEX_CACHE_TTL_SECONDS = 15.0
#: 状态事件合并窗口：场景切换 / 全屋联动会一次推上百条状态，逐条写库会卡顿。
_SYNC_DEBOUNCE_SECONDS = 3.0
#: 审计表保留条数（按实体）：只留最近若干条，避免每次改别名都把库撑大。
AUDIT_KEEP_PER_ENTITY = 20


def _iso(value: datetime | None) -> str | None:
    """时间戳转 ISO（DB 里存的是 naive UTC，前端按 UTC 显示）。"""
    if value is None:
        return None
    return value.replace(tzinfo=value.tzinfo or UTC).isoformat(timespec="seconds")


def _event_entity_ids(payload: Any) -> list[str]:
    """从单条 / 批量状态事件里取实体 ID（批量形如 ``{"changes": [...]}``）。"""
    if not isinstance(payload, dict):
        return []
    changes = payload.get("changes")
    if isinstance(changes, list):
        return [_text((item or {}).get("entity_id")) for item in changes if isinstance(item, dict)]
    entity_id = _text(payload.get("entity_id"))
    return [entity_id] if entity_id else []


def _touches_profile_domains(payload: Any) -> bool:
    """事件里是否含本次关心的媒体 / 空调实体（其余状态变化一律不唤起刷新）。"""
    return any(entity_id.partition(".")[0] in _PROFILE_DOMAINS for entity_id in _event_entity_ids(payload))


class DeviceProfileService(AppleTvMixin):
    """画像读写、房间默认设备与人工确认审计（Apple TV 控制见 :mod:`appletv`）。"""

    def __init__(self, session_factory: Any, state_store: Any, command_proxy: Any = None) -> None:
        self._session_factory = session_factory
        self._state_store = state_store
        self._command_proxy = command_proxy
        #: 刷新串行锁：面板「重建」与列表读路径的自愈刷新可能并发，两个线程各建一遍
        #: 同 entityId 会撞 UNIQUE 约束，把一次 GET 变成 500。
        self._refresh_lock = threading.Lock()
        #: 画像索引缓存（``entity_id -> (domain, kind, aliases, confirmed)``），写入后立即失效
        self._index_cache: dict[str, tuple[str, str, list[str], bool]] | None = None
        self._index_at = 0.0
        #: 状态事件驱动的增量同步：到期时刻（monotonic）与后台合并线程
        self._sync_due = 0.0
        self._sync_lock = threading.Lock()
        self._sync_worker: threading.Thread | None = None

    # ------------------------------------------------------------------ 事件
    def bind_events(self, bus: Any = None) -> None:
        """订阅 HA 状态变更：媒体 / 空调实体变化后按防抖窗口增量刷新画像。

        没有这条订阅时，画像只在「打开面板 / 手动重建 / 语音顺带读一次」时更新：
        HA 里改了名或把电视换成 Apple TV，分类结果可能几天都是旧值。参考实现同样是
        按 ``state_changed`` 增量落库，这里只多了合批 —— 场景切换一次推上百条状态，
        逐条刷新会把 SQLite 写放大到卡顿。
        """
        if bus is None:
            return
        for event in ("ha.state_changed", "ha.state_changed.batch"):
            bus.on(event, self._on_state_event)

    def _on_state_event(self, payload: Any = None) -> None:
        if not _touches_profile_domains(payload):
            return
        with self._sync_lock:
            self._sync_due = time.monotonic() + _SYNC_DEBOUNCE_SECONDS
            if self._sync_worker is not None:
                return
            worker = threading.Thread(target=self._sync_loop, name="device-profile-sync", daemon=True)
            self._sync_worker = worker
        worker.start()

    def _sync_loop(self) -> None:
        """合并窗口到期后刷新一次；期间再有事件就把截止时间往后推。"""
        while True:
            delay = self._sync_due - time.monotonic()
            if delay > 0:
                time.sleep(min(delay, 0.5))
                continue
            with self._sync_lock:
                self._sync_due = 0.0
            try:
                self.refresh()
            except Exception as exc:
                logger.warning("状态事件触发的画像同步失败: %s", exc, exc_info=True)
            with self._sync_lock:
                if self._sync_due > 0.0:
                    continue
                self._sync_worker = None
                return

    # ------------------------------------------------------------------ 同步
    def refresh(self) -> dict[str, int]:
        """按当前实体快照增量刷新画像（保留用户确认与别名）。"""
        with self._refresh_lock:
            return self._refresh_locked()

    def _refresh_locked(self) -> dict[str, int]:
        entities = [item for item in self._profiles_entities() if _text(item.get("entity_id"))]
        created = updated = unchanged = stale = 0
        seen: set[str] = set()
        now = datetime.now(UTC)
        with self._session_factory() as session:
            existing = {row.entity_id: row for row in session.scalars(select(DeviceProfile)).all()}
            for entity in entities:
                entity_id = _text(entity.get("entity_id"))
                seen.add(entity_id)
                fingerprint = attributes_hash(entity)
                row = existing.get(entity_id)
                if (
                    row is not None
                    and not row.confirmed
                    and row.attributes_hash == fingerprint
                    and row.classifier_version == CLASSIFIER_VERSION
                ):
                    # 属性没变：只刷新可用性与「最近见到」时刻，不重算分类。
                    row.available = is_reachable(entity)
                    row.last_seen_at = now
                    unchanged += 1
                    continue
                classified = classify(entity)
                if row is None:
                    row = DeviceProfile(entity_id=entity_id, domain=entity_id.split(".", 1)[0])
                    session.add(row)
                    created += 1
                elif not row.confirmed:
                    updated += 1
                if not row.confirmed:
                    # 用户确认过的画像不会被规则覆盖：那是一次明确的人工决策。
                    row.kind = classified["kind"]
                    row.confidence = float(classified["confidence"])
                    row.evidence_json = json.dumps(classified["evidence"], ensure_ascii=False)
                    row.source = "RULE"
                    row.classifier_version = CLASSIFIER_VERSION
                row.available = is_reachable(entity)
                row.attributes_hash = fingerprint
                row.last_seen_at = now
                row.last_classified_at = now
            for entity_id, row in existing.items():
                if entity_id in seen or not row.available:
                    continue
                # HA 里已消失的实体：保留确认与别名，但标记不可用，避免管家继续选中它。
                row.available = False
                stale += 1
            session.commit()
        self._invalidate_alias_cache()
        return {
            "created": created,
            "updated": updated,
            "unchanged": unchanged,
            "stale": stale,
            "total": len(entities),
        }

    def _profiles_entities(self) -> list[dict[str, Any]]:
        get_all = getattr(self._state_store, "get_all", None)
        if not callable(get_all):
            return []
        items: list[dict[str, Any]] = []
        for domain in _PROFILE_DOMAINS:
            try:
                loaded = get_all(domain)
            except Exception as exc:
                logger.debug("读取 %s 实体失败: %s", domain, exc)
                continue
            if isinstance(loaded, list):
                items.extend(item for item in loaded if isinstance(item, dict))
        return items

    # ------------------------------------------------------------------ 读取
    def list(
        self,
        area_id: str | None = None,
        *,
        domain: str | None = None,
        pending_only: bool = False,
        query: str | None = None,
    ) -> list[dict[str, Any]]:
        """画像列表。``domain`` / ``pending_only`` / ``query`` 在服务端过滤，面板不必全量拉取。"""
        entities = {_text(item.get("entity_id")): item for item in self._profiles_entities() if isinstance(item, dict)}
        rows = self._load_rows()
        if entities and self._needs_refresh(rows, entities):
            # 用非阻塞锁：真正干活的那一方已经在刷，这里直接读当前行，别把读路径挡在锁上。
            if self._refresh_lock.acquire(blocking=False):
                try:
                    self._refresh_locked()
                finally:
                    self._refresh_lock.release()
                rows = self._load_rows()
        needle = _normalize_text(query)
        payload = []
        for row in rows:
            if domain and row.domain != domain:
                continue
            if pending_only and row.confirmed:
                continue
            entity = entities.get(row.entity_id)
            if area_id and _entity_area(entity) != area_id:
                continue
            name = _text(_attr_map(entity).get("friendly_name") or row.entity_id)
            aliases = _load_list(row.aliases_json)
            if needle:
                haystack = [_normalize_text(item) for item in (name, row.entity_id, *aliases)]
                if not any(item and (needle in item or item in needle) for item in haystack):
                    continue
            payload.append(
                {
                    "entityId": row.entity_id,
                    "domain": row.domain,
                    "kind": row.kind,
                    "confidence": float(row.confidence or 0.0),
                    "confirmed": bool(row.confirmed),
                    "source": row.source,
                    "aliases": aliases,
                    "evidence": _load_list(row.evidence_json),
                    #: 在线状态按当前快照现算：HA 把设备标成 unavailable 时，面板要立刻看到，
                    #: 而不是等下一次写库刷新。列里的值只用于「快照里已消失」的判断。
                    "available": is_reachable(entity),
                    #: 能否自动选它：在线 + 已确认 / 置信达标（与「在线」分开，面板别把待确认标成不可用）
                    "usable": is_usable_profile(
                        {"confirmed": row.confirmed, "confidence": row.confidence, "kind": row.kind}, entity
                    ),
                    "state": _text((entity or {}).get("state")),
                    "name": name,
                    "areaId": _entity_area(entity),
                    "areaName": _text(_attr_map(entity).get("area_name")),
                    "lastSeenAt": _iso(row.last_seen_at),
                    "lastClassifiedAt": _iso(row.last_classified_at),
                }
            )
        return payload

    @staticmethod
    def _needs_refresh(rows: list[DeviceProfile], entities: dict[str, dict[str, Any]]) -> bool:
        """画像与当前快照是否已经不一致（值得写库一次）。

        只认两种「真变化」：新实体没有画像、设备从快照里消失、离线设备恢复在线。
        **不能**把「设备在线但状态常为 unavailable」当成变化 —— 那是设备自己的事，
        否则面板每次打开、每句语音都会触发一次全量写库。
        """
        if not rows:
            return True
        known = {row.entity_id for row in rows}
        if any(entity_id not in known for entity_id in entities):
            return True
        for row in rows:
            entity = entities.get(row.entity_id)
            if row.available and entity is None:
                return True
            if not row.available and entity is not None and is_reachable(entity):
                return True
        return False

    def match_aliases(self, text: str, domain: str | None = None, kinds: tuple[str, ...] | None = None) -> list[str]:
        """把目标描述映射到已确认画像：返回命中别名的实体 ID（多命中交给调用方消歧）。

        只有「已确认且类型明确」的画像参与匹配 —— 未确认的规则猜测不该抢走用户的说法。
        """
        needle = _normalize_text(text)
        if len(needle) < 2:
            return []
        hits: list[str] = []
        for entity_id, (row_domain, row_kind, aliases, _confirmed) in self._alias_index().items():
            if domain and row_domain != domain:
                continue
            if kinds and row_kind not in kinds:
                continue
            if any(_alias_hit(alias, needle) for alias in aliases):
                hits.append(entity_id)
        return hits

    def kind_of(self, entity_id: str) -> str | None:
        """实体已落库的画像 kind（含未确认的规则结果）；没有画像返回 ``None``。"""
        row = self._profile_index().get(_text(entity_id))
        return row[1] if row is not None else None

    def _profile_index(self) -> dict[str, tuple[str, str, list[str], bool]]:
        """全部画像的 ``entity_id -> (domain, kind, aliases, confirmed)`` 索引（短 TTL）。

        别名匹配与 climate 命令校验共用这一份，避免一条语音指令查两次库。
        """
        if self._index_cache is not None and time.monotonic() - self._index_at < _INDEX_CACHE_TTL_SECONDS:
            return self._index_cache
        index = {
            row.entity_id: (row.domain, row.kind, _load_list(row.aliases_json), bool(row.confirmed))
            for row in self._load_rows()
        }
        self._index_cache = index
        self._index_at = time.monotonic()
        return index

    def _alias_index(self) -> dict[str, tuple[str, str, list[str], bool]]:
        """只有「已确认且类型明确且有别名」的画像参与别名匹配。"""
        return {
            entity_id: row
            for entity_id, row in self._profile_index().items()
            if row[3] and row[2] and row[1] != "unknown"
        }

    def _invalidate_alias_cache(self) -> None:
        self._index_cache = None
        self._index_at = 0.0

    def _load_rows(self) -> list[DeviceProfile]:
        with self._session_factory() as session:
            return list(session.scalars(select(DeviceProfile).order_by(DeviceProfile.entity_id)).all())

    def defaults(self, area_id: str | None = None) -> list[dict[str, Any]]:
        """房间默认设备（含落点是否仍然有效的判定，面板据此标红）。"""
        with self._session_factory() as session:
            query = select(DeviceProfileDefault).order_by(DeviceProfileDefault.area_id, DeviceProfileDefault.kind)
            if area_id:
                query = query.where(DeviceProfileDefault.area_id == area_id)
            rows = session.scalars(query).all()
        payload = []
        for row in rows:
            item: dict[str, Any] = {
                "id": row.id,
                "areaId": row.area_id,
                "kind": row.kind,
                "entityId": row.entity_id,
                "maPlayerId": row.ma_player_id,
                "available": True,
                "name": "",
            }
            if row.kind == "speaker":
                # 默认音箱指向 MA 播放器：只能确认「配置里还写着」，真实在线由 MA 侧判断。
                item["name"] = _text(row.ma_player_id)
                item["available"] = bool(row.ma_player_id)
            else:
                entity = self._entity_of(_text(row.entity_id))
                item["available"] = is_reachable(entity)
                item["name"] = _text(_attr_map(entity).get("friendly_name") or row.entity_id)
            payload.append(item)
        return payload

    # ------------------------------------------------------------------ 写入
    def confirm(self, entity_id: str, kind: str, aliases: Any = None, *, actor: str = "") -> dict[str, Any]:
        """人工确认设备类型。``unknown`` 不在这里落库：那等于「未确认」，应走撤销确认。"""
        domain = _text(entity_id).split(".", 1)[0]
        allowed = _ALLOWED_KINDS.get(domain, ())
        if not allowed:
            return {"success": False, "message": "只支持 media_player / climate / water_heater 实体。"}
        if kind not in allowed:
            return {"success": False, "message": f"kind 须为 {' / '.join(allowed)}"}
        if kind == "unknown":
            return {"success": False, "message": "请选择具体类型；「未定」等价于撤销确认。"}
        entity = self._entity_of(entity_id)
        if entity is None:
            return {"success": False, "message": "设备不存在或当前不可用，无法确认。"}
        try:
            normalized = normalize_aliases(aliases) if aliases is not None else None
        except ValueError as exc:
            logger.debug("确认设备画像时别名非法: %r (%s)", aliases, exc)
            return {"success": False, "message": str(exc)}
        with self._session_factory() as session:
            row = session.scalars(select(DeviceProfile).where(DeviceProfile.entity_id == entity_id)).first()
            previous_kind = (row.kind or "") if row is not None else ""
            if row is None:
                row = DeviceProfile(entity_id=entity_id, domain=domain)
                session.add(row)
            row.domain = domain
            row.kind = kind
            row.confidence = 1.0
            row.confirmed = True
            row.source = "USER"
            row.classifier_version = "manual-v1"
            row.evidence_json = json.dumps(["user_confirmed"], ensure_ascii=False)
            row.available = is_reachable(entity)
            row.attributes_hash = attributes_hash(entity)
            row.last_seen_at = datetime.now(UTC)
            row.last_classified_at = datetime.now(UTC)
            if normalized is not None:
                row.aliases_json = json.dumps(normalized, ensure_ascii=False)
            self._write_audit(
                session,
                entity_id,
                "confirm" if normalized is None else "confirm_with_aliases",
                previous_kind,
                kind,
                _load_list(row.aliases_json),
                actor,
            )
            session.commit()
        self._invalidate_alias_cache()
        return {"success": True, "entityId": entity_id, "kind": kind}

    def set_aliases(self, entity_id: str, aliases: Any, *, actor: str = "") -> dict[str, Any]:
        """只改别名、不动类型：已确认的设备才有意义（未确认时没有 kind 可绑定）。"""
        try:
            normalized = normalize_aliases(aliases)
        except ValueError as exc:
            logger.debug("设置设备画像别名失败: %r (%s)", aliases, exc)
            return {"success": False, "message": str(exc)}
        with self._session_factory() as session:
            row = session.scalars(select(DeviceProfile).where(DeviceProfile.entity_id == entity_id)).first()
            if row is None or not row.confirmed:
                return {"success": False, "message": "先确认设备类型，再加别名。"}
            row.aliases_json = json.dumps(normalized, ensure_ascii=False)
            self._write_audit(session, entity_id, "aliases", row.kind, row.kind, normalized, actor)
            session.commit()
        self._invalidate_alias_cache()
        return {"success": True, "entityId": entity_id, "aliases": normalized}

    def clear_confirmation(self, entity_id: str, *, keep_aliases: bool = True, actor: str = "") -> dict[str, Any]:
        """撤销人工确认，回到规则分类。

        ``keep_aliases=True``（默认）保留用户教过的叫法 —— 撤销类型与丢弃别名是两件事，
        旧实现一律清空，误点一次就再也想不起来当时是怎么教的。
        """
        with self._session_factory() as session:
            row = session.scalars(select(DeviceProfile).where(DeviceProfile.entity_id == entity_id)).first()
            if row is None:
                return {"success": False, "message": "没有这台设备的画像。"}
            previous_kind = row.kind
            entity = self._entity_of(entity_id)
            if entity is not None:
                classified = classify(entity)
                row.kind = classified["kind"]
                row.confidence = float(classified["confidence"])
                row.evidence_json = json.dumps(classified["evidence"], ensure_ascii=False)
                row.available = is_reachable(entity)
                row.attributes_hash = attributes_hash(entity)
                row.last_classified_at = datetime.now(UTC)
            else:
                # 实体已从 HA 消失：回到「未定 + 不可用」，避免留着旧的确认结果。
                row.kind = "unknown"
                row.confidence = 0.0
                row.evidence_json = json.dumps(["entity_missing"], ensure_ascii=False)
                row.available = False
            row.source = "RULE"
            row.classifier_version = CLASSIFIER_VERSION
            row.confirmed = False
            if not keep_aliases:
                row.aliases_json = "[]"
            self._write_audit(
                session, entity_id, "clear_confirmation", previous_kind, row.kind, _load_list(row.aliases_json), actor
            )
            resolved_kind = row.kind
            resolved_aliases = _load_list(row.aliases_json)
            session.commit()
        self._invalidate_alias_cache()
        return {
            "success": True,
            "entityId": entity_id,
            "kind": resolved_kind,
            "aliases": resolved_aliases,
        }

    def audit(self, entity_id: str | None = None, limit: int = 50) -> list[dict[str, Any]]:
        """人工确认审计（最近在前）；``entity_id`` 为空时返回全屋最近若干条。"""
        with self._session_factory() as session:
            query = select(DeviceProfileAudit).order_by(DeviceProfileAudit.created_at.desc()).limit(max(1, limit))
            if entity_id:
                query = query.where(DeviceProfileAudit.entity_id == entity_id)
            rows = session.scalars(query).all()
            return [
                {
                    "id": row.id,
                    "entityId": row.entity_id,
                    "action": row.action,
                    "fromKind": row.from_kind,
                    "toKind": row.to_kind,
                    "aliases": _load_list(row.aliases_json),
                    "actor": row.actor,
                    "createdAt": _iso(row.created_at),
                }
                for row in rows
            ]

    @staticmethod
    def _write_audit(
        session: Any,
        entity_id: str,
        action: str,
        from_kind: str,
        to_kind: str,
        aliases: list[Any],
        actor: str,
    ) -> None:
        """落一条审计并裁掉该实体更早的记录（表不会无限增长）。"""
        session.add(
            DeviceProfileAudit(
                entity_id=entity_id,
                action=action,
                from_kind=from_kind,
                to_kind=to_kind,
                aliases_json=json.dumps(aliases, ensure_ascii=False),
                actor=_text(actor)[:128],
            )
        )
        # 先 flush：这条记录还没写库时按 createdAt 分页会把「本次」也算进旧记录里。
        session.flush()
        stale = session.scalars(
            select(DeviceProfileAudit.id)
            .where(DeviceProfileAudit.entity_id == entity_id)
            .order_by(DeviceProfileAudit.created_at.desc())
            .offset(AUDIT_KEEP_PER_ENTITY)
        ).all()
        if stale:
            session.execute(delete(DeviceProfileAudit).where(DeviceProfileAudit.id.in_(list(stale))))

    def _default_entity_error(self, area_id: str, entity_id: str) -> str | None:
        """房间默认电视 / Apple TV 的落点校验；``None`` 表示通过。"""
        if entity_id.split(".", 1)[0] != "media_player":
            return "默认媒体设备必须是 media_player 实体。"
        entity = self._entity_of(entity_id)
        if entity is None:
            return "实体不存在或当前不可用。"
        entity_area = _entity_area(entity)
        if entity_area and entity_area != area_id:
            area_name = _text(_attr_map(entity).get("area_name")) or entity_area
            return f"该实体属于房间「{area_name}」，与所选房间不一致。"
        return None

    def set_default(
        self,
        area_id: str,
        kind: str,
        *,
        entity_id: str | None = None,
        ma_player_id: str | None = None,
    ) -> dict[str, Any]:
        area = _text(area_id)
        target_entity = _text(entity_id)
        target_player = _text(ma_player_id)
        if not area:
            return {"success": False, "message": "areaId 不能为空。"}
        if kind not in DEFAULT_MEDIA_KINDS:
            return {"success": False, "message": f"kind 须为 {' / '.join(DEFAULT_MEDIA_KINDS)}"}
        if bool(target_entity) == bool(target_player):
            return {"success": False, "message": "entityId 与 maPlayerId 必须且只能提供一个。"}
        if kind == "speaker" and not target_player:
            return {"success": False, "message": "音箱默认设备必须提供 maPlayerId。"}
        if kind != "speaker" and not target_entity:
            return {"success": False, "message": f"{kind} 默认设备必须提供 entityId。"}
        if target_entity:
            error = self._default_entity_error(area, target_entity)
            if error:
                return {"success": False, "message": error}
        with self._session_factory() as session:
            row = session.scalars(
                select(DeviceProfileDefault).where(
                    DeviceProfileDefault.area_id == area, DeviceProfileDefault.kind == kind
                )
            ).first()
            if row is None:
                row = DeviceProfileDefault(area_id=area, kind=kind)
                session.add(row)
            row.entity_id = target_entity or None
            row.ma_player_id = target_player or None
            session.commit()
            return {"success": True, "areaId": area, "kind": kind}

    def delete_default(self, area_id: str, kind: str) -> dict[str, Any]:
        with self._session_factory() as session:
            row = session.scalars(
                select(DeviceProfileDefault).where(
                    DeviceProfileDefault.area_id == area_id, DeviceProfileDefault.kind == kind
                )
            ).first()
            if row is None:
                return {"success": False, "message": "没有这条默认设备。"}
            session.delete(row)
            session.commit()
        return {"success": True}

    def _profile_of(self, entity_id: str) -> DeviceProfile | None:
        with self._session_factory() as session:
            return session.scalars(select(DeviceProfile).where(DeviceProfile.entity_id == entity_id)).first()

    def _entity_of(self, entity_id: str) -> dict[str, Any] | None:
        getter = getattr(self._state_store, "get", None)
        if not callable(getter):
            return None
        entity = getter(entity_id)
        return entity if isinstance(entity, dict) else None

    async def _call(self, domain: str, service: str, entity_id: str, data: dict[str, Any]) -> dict[str, Any]:
        if self._command_proxy is None:
            return {"success": False, "message": "命令通道未启用。"}
        try:
            return await self._command_proxy.call_service(
                {
                    "domain": domain,
                    "service": service,
                    "entity_id": entity_id,
                    "service_data": data,
                },
                policy="agent",
            )
        except Exception as exc:
            logger.debug("Apple TV 调用失败 %s.%s: %s", domain, service, exc)
            return {"success": False, "message": str(exc)}

    @staticmethod
    async def _sleep(seconds: float) -> None:
        import asyncio

        await asyncio.sleep(seconds)


def _entity_area(entity: dict[str, Any] | None) -> str:
    attributes = (entity or {}).get("attributes")
    attrs = attributes if isinstance(attributes, dict) else {}
    return _text(attrs.get("area_id"))


def _load_list(raw: str | None) -> list[Any]:
    if not raw:
        return []
    try:
        value = json.loads(raw)
        return value if isinstance(value, list) else []
    except (TypeError, ValueError) as exc:  # fmt: skip
        logger.debug("设备画像的 JSON 列表字段损坏，按空列表处理: %r (%s)", raw[:80], exc)
        return []


__all__ = [
    "CLIMATE_KINDS",
    "DEFAULT_MEDIA_KINDS",
    "MEDIA_KINDS",
    "DeviceProfileService",
    "attributes_hash",
    "classify",
    "is_reachable",
    "is_usable_profile",
    "normalize_aliases",
]
