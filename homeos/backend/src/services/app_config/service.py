"""应用配置服务（对齐 ``shared/app-config/service.ts``）。

系统运行参数的内存缓存、DB 持久化、跨副本同步、脱敏与审计。
"""

from __future__ import annotations

import copy
import json
import logging
import secrets
from datetime import UTC, datetime
from typing import Any

from ...core.errors import BusinessException, ErrorCode, api_error, bad_request
from ...core.models import SystemConfig
from ...core.runtime_kv import load_runtime_kv, persist_runtime_kv
from ...core.zoned_time import zoned_date_parts  # noqa: F401 - 供调用方复用
from .constants import (
    APP_CONFIG_SCHEMA_VERSION,
    CONFIG_AUDIT_STORAGE_ID,
    CONFIG_REPLACE_NESTED_FIELDS,
    CONFIG_REPLACE_ON_UPDATE_SECTIONS,
    PUBLIC_CONFIG_SECTIONS,
)
from .defaults import DEFAULT_APP_CONFIG
from .import_normalize import normalize_app_config_for_import
from .mask import (
    apply_import_replace_preserving_secrets,
    is_masked_value,
    mask_sensitive_fields_by_key,
    pick_config_for_role,
    restore_client_power_report_tokens,
    strip_masked_placeholders,
)
from .room_meta import (
    build_client_power_wake_public,
    build_energy_public_meta,
    build_public_room_meta,
    resolve_orchestrator_history_limit,
    resolve_voice_rooms,
)
from .validate import (
    AppConfigValidationError,
    normalize_pricing_patch,
    validate_app_config_partial,
)

logger = logging.getLogger("homeos.app_config")

APP_CONFIG_UPDATED = "app.config.updated"


def _deep_merge(target: dict[str, Any], source: dict[str, Any]) -> None:
    for key, value in source.items():
        if isinstance(value, dict):
            if not isinstance(target.get(key), dict):
                target[key] = {}
            _deep_merge(target[key], value)
        else:
            target[key] = value


def _ensure_client_power_report_tokens(client_power: dict[str, Any]) -> bool:
    """为未配置上报密钥的终端自动生成 reportToken。"""
    changed = False
    for client in client_power.get("clients") or []:
        if not isinstance(client, dict):
            continue
        token = str(client.get("reportToken") or "").strip()
        if not token or is_masked_value(token):
            client["reportToken"] = secrets.token_hex(24)
            changed = True
    return changed


def _iso(dt: datetime | None) -> str | None:
    if dt is None:
        return None
    if dt.tzinfo is None:
        return dt.replace(tzinfo=UTC).isoformat().replace("+00:00", "Z")
    return dt.astimezone(UTC).isoformat().replace("+00:00", "Z")


def _parse_iso(value: str) -> datetime:
    text = str(value or "").strip()
    if text.endswith("Z"):
        text = text[:-1] + "+00:00"
    parsed = datetime.fromisoformat(text)
    if parsed.tzinfo is not None:
        parsed = parsed.astimezone(UTC).replace(tzinfo=None)
    return parsed


class AppConfigService:
    """应用配置服务：内存缓存 + DB 持久化 + 脱敏 + 审计。"""

    def __init__(self, session_factory, event_bus: Any = None) -> None:
        self._session_factory = session_factory
        self._event_bus = event_bus
        self._config: dict[str, Any] = copy.deepcopy(DEFAULT_APP_CONFIG)
        self._audit_log: list[dict[str, Any]] = []
        self._config_updated_at: datetime | None = None
        self._section_cache: dict[str, tuple[int, Any]] = {}
        self._generation = 0
        self._loop: Any = None

    def set_event_bus(self, event_bus: Any) -> None:
        """注入事件总线（总线在配置服务之后创建，启动时回填以便广播 ``app.config.updated``）。"""
        self._event_bus = event_bus
        try:
            import asyncio

            self._loop = asyncio.get_running_loop()
        except RuntimeError:
            self._loop = None

    # ------------------------------------------------------------------ #
    # 启动加载
    # ------------------------------------------------------------------ #
    def start(self) -> None:
        self._load_with_retry()

    def _load_with_retry(self, attempt: int = 1, max_attempts: int = 3) -> None:
        try:
            self._load()
        except Exception as exc:  # noqa: BLE001
            if attempt < max_attempts:
                logger.warning("加载系统配置失败(第 %s/%s 次): %s", attempt, max_attempts, exc)
                self._load_with_retry(attempt + 1, max_attempts)
                return
            logger.warning("加载系统配置失败,使用默认值: %s", exc)

    def _load(self) -> None:
        with self._session_factory() as session:
            row = session.get(SystemConfig, "default")
            if row is not None:
                raw = json.loads(row.data) if row.data else {}
                if not isinstance(raw, dict):
                    raw = {}
                normalized_result = normalize_app_config_for_import(raw)
                _deep_merge(self._config, normalized_result["config"])
                self._config_updated_at = row.updated_at
                migrated = list(normalized_result["changes"])
                if self._migrate_missing_sections():
                    migrated.append("missing-sections")
                if migrated:
                    self._persist()
                logger.info("系统配置已从 DB 加载")
            else:
                now = datetime.now(UTC)
                session.add(
                    SystemConfig(
                        id="default",
                        data=json.dumps(self._config, ensure_ascii=False),
                        updated_at=now,
                    )
                )
                session.commit()
                self._config_updated_at = now
                logger.info("系统配置已初始化默认值")
        if _ensure_client_power_report_tokens(self._config["clientPower"]):
            self._persist()
            logger.info("已为既有客户端充放电策略补全 reportToken")
        self._hydrate_audit_log()
        self._bump_generation()

    def reload_from_db_if_stale(self) -> bool:
        with self._session_factory() as session:
            row = session.get(SystemConfig, "default")
            if row is None:
                return False
            if self._config_updated_at and row.updated_at <= self._config_updated_at:
                return False
            raw = json.loads(row.data) if row.data else {}
            if not isinstance(raw, dict):
                raw = {}
            normalized = normalize_app_config_for_import(raw)["config"]
            self._config = copy.deepcopy(DEFAULT_APP_CONFIG)
            _deep_merge(self._config, normalized)
            self._migrate_missing_sections()
            self._config_updated_at = row.updated_at
        self._bump_generation()
        logger.info("系统配置已从 DB 同步(跨副本)")
        return True

    def _hydrate_audit_log(self) -> None:
        if not (self._config.get("ops") or {}).get("configAuditPersistEnabled"):
            return
        try:
            with self._session_factory() as session:
                stored = load_runtime_kv(session, CONFIG_AUDIT_STORAGE_ID)
            if isinstance(stored, list):
                self._audit_log = [*stored, *self._audit_log][: self._get_max_audit()]
        except Exception as exc:  # noqa: BLE001
            logger.warning("加载配置审计失败: %s", exc)

    def _persist_audit_log(self) -> None:
        if not (self._config.get("ops") or {}).get("configAuditPersistEnabled"):
            return
        try:
            persist_runtime_kv(
                self._session_factory, CONFIG_AUDIT_STORAGE_ID, self._audit_log[: self._get_max_audit()]
            )
        except Exception as exc:  # noqa: BLE001
            logger.warning("持久化配置审计失败: %s", exc)

    # ------------------------------------------------------------------ #
    # 默认值补全
    # ------------------------------------------------------------------ #
    def _merge_defaults_recursive(self, target: dict[str, Any], defaults: dict[str, Any]) -> bool:
        changed = False
        for key, default_value in defaults.items():
            if key not in target:
                target[key] = copy.deepcopy(default_value)
                changed = True
            elif isinstance(target[key], dict) and isinstance(default_value, dict):
                if self._merge_defaults_recursive(target[key], default_value):
                    changed = True
        return changed

    def _migrate_missing_sections(self) -> bool:
        changed = False
        for section, default_value in DEFAULT_APP_CONFIG.items():
            if section not in self._config:
                self._config[section] = copy.deepcopy(default_value)
                changed = True
                continue
            raw_target = self._config[section]
            if isinstance(raw_target, dict) and isinstance(default_value, dict):
                if self._merge_defaults_recursive(raw_target, default_value):
                    changed = True
        domains = (self._config.get("wsPush") or {}).get("criticalDomains")
        if (
            isinstance(domains, list)
            and "light" in domains
            and "switch" in domains
            and "lock" not in domains
        ):
            self._config["wsPush"]["criticalDomains"] = [*domains, "lock"]
            changed = True
        return changed

    def _get_max_audit(self) -> int:
        n = (self._config.get("ops") or {}).get("configAuditMaxEntries")
        return int(n) if isinstance(n, (int, float)) and n > 0 else 100

    def _bump_generation(self) -> None:
        self._generation += 1
        self._section_cache.clear()

    # ------------------------------------------------------------------ #
    # 合并
    # ------------------------------------------------------------------ #
    def _merge_section(
        self, target_section: dict[str, Any], patch_section: dict[str, Any], nested_replace_keys: tuple[str, ...]
    ) -> None:
        replace_set = {k for k in nested_replace_keys if k in patch_section}
        for key in replace_set:
            target_section[key] = copy.deepcopy(patch_section[key])
        rest = {k: v for k, v in patch_section.items() if k not in replace_set}
        if rest:
            _deep_merge(target_section, rest)

    def _merge_partial_config(self, cfg: dict[str, Any], partial: dict[str, Any]) -> None:
        for section_key, section_patch in partial.items():
            if isinstance(section_patch, dict):
                patch = (
                    normalize_pricing_patch(section_patch)
                    if section_key == "pricing"
                    else section_patch
                )
                if not isinstance(cfg.get(section_key), dict):
                    cfg[section_key] = {}
                nested_keys = CONFIG_REPLACE_NESTED_FIELDS.get(section_key, ())
                self._merge_section(cfg[section_key], patch, nested_keys)
            else:
                cfg[section_key] = section_patch

    # ------------------------------------------------------------------ #
    # 读取
    # ------------------------------------------------------------------ #
    def get_all(self) -> dict[str, Any]:
        raw = copy.deepcopy(self._config)
        mask_sensitive_fields_by_key(raw)
        out = dict(raw)
        out["_version"] = APP_CONFIG_SCHEMA_VERSION
        if self._config_updated_at is not None:
            out["_configUpdatedAt"] = _iso(self._config_updated_at)
        return out

    def get_all_raw(self) -> dict[str, Any]:
        return copy.deepcopy(self._config)

    def export_raw(self) -> dict[str, Any]:
        return copy.deepcopy(self._config)

    def get(self, section: str) -> Any:
        fallback = DEFAULT_APP_CONFIG.get(section)
        value = self._config.get(section, fallback)
        if value is None:
            return copy.deepcopy(fallback)
        cached = self._section_cache.get(section)
        if cached is not None and cached[0] == self._generation:
            return cached[1]
        try:
            cloned = copy.deepcopy(value)
        except Exception:  # noqa: BLE001
            cloned = copy.deepcopy(fallback)
        self._section_cache[section] = (self._generation, cloned)
        return cloned

    def get_section(self, section: str) -> Any:
        return self.get(section)

    def get_home_timezone(self) -> str | None:
        tz = (self.get("ops") or {}).get("homeTimezone")
        if isinstance(tz, str) and tz.strip():
            return tz.strip()
        return None

    def get_raw_section(self, section: str) -> Any:
        """读取未脱敏分区（内部服务使用）。"""
        return copy.deepcopy(self._config.get(section))

    def get_public(self) -> dict[str, Any]:
        out: dict[str, Any] = {"_version": APP_CONFIG_SCHEMA_VERSION}
        for section in PUBLIC_CONFIG_SECTIONS:
            if section in self._config:
                out[section] = copy.deepcopy(self._config[section])
        voice = out.get("voice")
        if isinstance(voice, dict):
            external = self._config.get("external") or {}
            voice["ttsMediaPlayerId"] = external.get("ttsMediaPlayerId") or ""
            voice["ttsMediaPlayerIds"] = external.get("ttsMediaPlayerIds") or []
            voice["rooms"] = [r["label"] for r in resolve_voice_rooms(self._config.get("envSensorMap"))]
        out["roomMeta"] = build_public_room_meta(self._config.get("envSensorMap"))
        ws_push = self._config.get("wsPush") or {}
        out["wsPush"] = {
            "coldEntityOnDemand": ws_push.get("coldEntityOnDemand"),
            "roomBatchEmit": ws_push.get("roomBatchEmit"),
        }
        retention = self._config.get("retention") or {}
        ops = self._config.get("ops") or {}
        other = self._config.get("other") or {}
        event_log_days = retention.get("eventLog", other.get("eventlogRetentionDays"))
        out["eventLog"] = _build_event_log_public_meta(event_log_days, ops)
        out["energy"] = build_energy_public_meta((self._config.get("energy") or {}).get("learningPeriodDays"))
        out["orchestrator"] = {"executionHistoryLimit": resolve_orchestrator_history_limit(ops)}
        out["guest"] = {
            "defaultHours": other.get("guestPassDefaultHours"),
            "extendHours": other.get("guestPassExtendHours"),
        }
        security = self._config.get("security") or {}
        out["security"] = {
            "sensorAlertCooldownSec": security.get("sensorAlertCooldownSec"),
            "armExitGraceSeconds": security.get("armExitGraceSeconds"),
        }
        out["clientPowerWake"] = build_client_power_wake_public(self._config.get("clientPower"))
        tip_actions = other.get("advisorTipActions")
        out["other"] = {
            "advisorTipActionsBound": [
                key
                for key, value in (tip_actions or {}).items()
                if isinstance(value, dict) and str(value.get("id") or "").strip()
            ]
        }
        return out

    def pick_for_role(self, role: str | None) -> dict[str, Any]:
        return pick_config_for_role(self.get_all(), role)

    # ------------------------------------------------------------------ #
    # 审计
    # ------------------------------------------------------------------ #
    def get_audit_log(self, limit: int = 50) -> list[dict[str, Any]]:
        return self._audit_log[: min(limit, self._get_max_audit())]

    def get_audit_log_paginated(self, page: int = 1, page_size: int = 20) -> dict[str, Any]:
        max_entries = self._get_max_audit()
        total = min(len(self._audit_log), max_entries)
        safe_page = max(1, page)
        safe_size = min(max(page_size, 1), 100)
        start = (safe_page - 1) * safe_size
        items = self._audit_log[start : start + safe_size]
        return {
            "items": items,
            "total": total,
            "page": safe_page,
            "pageSize": safe_size,
            "totalPages": (total + safe_size - 1) // safe_size if safe_size else 0,
        }

    def _collect_changes(
        self, before: dict[str, Any], after: dict[str, Any], sections: list[str]
    ) -> list[dict[str, Any]]:
        entries: list[dict[str, Any]] = []
        at = datetime.now(UTC).isoformat().replace("+00:00", "Z")
        for section in sections:
            prev = before.get(section)
            nxt = after.get(section)
            if not isinstance(prev, dict) or not isinstance(nxt, dict):
                continue
            keys = [
                key
                for key in nxt
                if json.dumps(prev.get(key), default=str, sort_keys=True)
                != json.dumps(nxt.get(key), default=str, sort_keys=True)
            ]
            if keys:
                entries.append({"at": at, "section": section, "keys": keys, "action": "update"})
        return entries

    def _push_audit(self, entries: list[dict[str, Any]]) -> None:
        if not entries:
            return
        self._audit_log = [*entries, *self._audit_log][: self._get_max_audit()]
        self._persist_audit_log()

    # ------------------------------------------------------------------ #
    # 写入
    # ------------------------------------------------------------------ #
    def update(self, partial: dict[str, Any], expected_updated_at: str | None = None) -> None:
        before = copy.deepcopy(self._config)
        stripped = strip_masked_placeholders(partial)
        changed_sections = list(stripped.keys())
        if not changed_sections:
            return
        validate_app_config_partial(stripped, self._config)
        to_merge = dict(stripped)
        cfg = self._config
        replaced: set[str] = set()
        for section in CONFIG_REPLACE_ON_UPDATE_SECTIONS:
            if section in to_merge:
                cfg[section] = copy.deepcopy(to_merge[section])
                replaced.add(section)
        rest = {k: v for k, v in to_merge.items() if k not in replaced}
        if rest:
            self._merge_partial_config(cfg, rest)
        if "clientPower" in changed_sections:
            restore_client_power_report_tokens(
                self._config.get("clientPower"), before.get("clientPower")
            )
            if _ensure_client_power_report_tokens(self._config["clientPower"]):
                logger.info("已为客户端充放电策略自动生成 reportToken")
        self._migrate_missing_sections()
        self._push_audit(self._collect_changes(before, self._config, changed_sections))
        self._bump_generation()
        try:
            self._persist(expected_updated_at)
        except Exception:
            self._config = copy.deepcopy(before)
            self._migrate_missing_sections()
            self._bump_generation()
            raise
        self._emit(changed_sections)

    def replace_all(self, next_config: dict[str, Any]) -> dict[str, Any]:
        merged = apply_import_replace_preserving_secrets(
            next_config, self._config
        )
        self._config = copy.deepcopy(merged)
        self._migrate_missing_sections()
        self._bump_generation()
        self._push_audit(
            [
                {
                    "at": datetime.now(UTC).isoformat().replace("+00:00", "Z"),
                    "section": "*",
                    "keys": ["import-replace"],
                    "action": "update",
                }
            ]
        )
        self._persist()
        self._emit(list(self._config.keys()))
        return self.get_all()

    def reset(self, section: str | None = None) -> dict[str, Any]:
        if section is not None and section not in DEFAULT_APP_CONFIG:
            bad_request(API_ERROR_VALIDATION_CONFIG_SECTION_INVALID(section))
        sections = [section] if section else list(self._config.keys())
        self._push_audit(
            [
                {
                    "at": datetime.now(UTC).isoformat().replace("+00:00", "Z"),
                    "section": str(s),
                    "keys": ["*"],
                    "action": "reset",
                }
                for s in sections
            ]
        )
        if section:
            self._config[section] = copy.deepcopy(DEFAULT_APP_CONFIG[section])
        else:
            self._config = copy.deepcopy(DEFAULT_APP_CONFIG)
        self._bump_generation()
        self._persist()
        self._emit(sections)
        return self.get_all()

    # ------------------------------------------------------------------ #
    # 持久化
    # ------------------------------------------------------------------ #
    def _persist(self, expected_updated_at: str | None = None) -> None:
        now = datetime.now(UTC)
        with self._session_factory() as session:
            row = session.get(SystemConfig, "default")
            if row is None:
                row = SystemConfig(id="default", data="{}", updated_at=now)
                session.add(row)
            elif expected_updated_at:
                expected = _parse_iso(expected_updated_at)
                if row.updated_at != expected:
                    raise BusinessException(
                        ErrorCode.CONFLICT, "配置已被他人修改，请刷新后重试"
                    )
            row.data = json.dumps(self._config, ensure_ascii=False)
            row.updated_at = now
            session.commit()
        self._config_updated_at = now

    def _emit(self, sections: list[str]) -> None:
        if self._event_bus is None:
            return
        try:
            emit = getattr(self._event_bus, "emit_soon", None)
            if callable(emit):
                import asyncio

                try:
                    asyncio.get_running_loop()
                except RuntimeError:
                    # 同步线程上下文（如 asyncio.to_thread 内的配置更新）：
                    # 回填启动时的事件循环，用线程安全方式投递广播。
                    if self._loop is not None and not self._loop.is_closed():
                        emit_coro = self._event_bus.emit(APP_CONFIG_UPDATED, sections)
                        asyncio.run_coroutine_threadsafe(emit_coro, self._loop)
                        return
                    return
                emit(APP_CONFIG_UPDATED, sections)
            else:
                emit_async = getattr(self._event_bus, "emit", None)
                if callable(emit_async):
                    emit_async(APP_CONFIG_UPDATED, sections)
        except Exception as exc:  # noqa: BLE001
            logger.debug("广播配置变更失败: %s", exc)


def API_ERROR_VALIDATION_CONFIG_SECTION_INVALID(section: str) -> str:
    return api_error("VALIDATION_CONFIG_SECTION_INVALID", section)


def _build_event_log_public_meta(retention_days: Any, ops: dict[str, Any]) -> dict[str, Any]:
    from ...core.retention import build_event_log_public_meta

    return build_event_log_public_meta(
        retention_days,
        event_log_timeline_max=ops.get("eventLogTimelineMax"),
        event_log_timeline_hours=ops.get("eventLogTimelineHours"),
        event_log_overlay_hours=ops.get("eventLogOverlayHours"),
    )


__all__ = ["AppConfigService", "APP_CONFIG_UPDATED", "AppConfigValidationError"]
