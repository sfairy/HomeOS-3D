"""UI 配置服务（对齐 ``modules/ui-config/service.ts``）。

负责项目布局配置（ProjectConfig 表）的 CRUD、导入导出、终端 display profile 绑定，
以及背景图 / 图标静态资源的委托操作。

说明：SQLite 端口把 Prisma ``Json`` 字段以 TEXT 存储，对外仍返回解析后的对象，
保证 HTTP 契约与 Nest 一致。
"""

from __future__ import annotations

import asyncio
import json
import logging
import threading
from collections.abc import Callable
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any

from sqlalchemy import select, update
from sqlalchemy.exc import IntegrityError

from .layout_secrets import (
    mask_layout,
    merge_layout_secrets_on_save,
)
from .static_assets import UiConfigStaticAssetService
from ...platform.core.db.json_field import read_json_object, to_input_json
from ...platform.core.db.models import ProjectConfig
from ...platform.core.http.asset_paths import get_ui_assets_dir
from ...platform.core.http.errors import (
    BusinessException,
    ErrorCode,
    api_error,
    bad_request,
)

logger = logging.getLogger("homeos.ui_config")

_SYSTEM_CONFIG_UPDATED_EVENT = "SYSTEM_CONFIG_UPDATED"
_LAYOUT_CONFIG_UPDATED_EVENT = "layout.config.updated"


def _iso(value: datetime | None) -> str | None:
    if value is None:
        return None
    if value.tzinfo is None:
        value = value.replace(tzinfo=UTC)
    return value.astimezone(UTC).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def _parse_iso_utc(value: Any) -> datetime | None:
    """解析客户端回传的时间戳（ISO8601，允许 ``Z`` / 无时区），失败返回 None。"""
    text = str(value or "").strip()
    if not text:
        return None
    if text.endswith(("Z", "z")):
        text = text[:-1] + "+00:00"
    try:
        parsed = datetime.fromisoformat(text)
    except ValueError:
        logger.warning("时间戳不是合法 ISO8601，已按无效处理: %r", text)
        return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=UTC)
    return parsed.astimezone(UTC)


def _parse_expected_updated_at(value: Any) -> datetime | None:
    """解析布局乐观锁版本号。

    - 空值 / 未提供 → ``None``（不校验，兼容旧客户端）；
    - 给了但解析不出来 → 400，**不能**静默降级成「不校验」：一个拼错的版本号会让
      本应 409 的并发覆盖变成静默 LWW，正是乐观锁要防的事。
    """
    if value is None:
        return None
    text = str(value).strip()
    if not text:
        return None
    parsed = _parse_iso_utc(text)
    if parsed is None:
        bad_request(api_error("UI_CONFIG_DATA_INVALID"))
    return parsed


class UiConfigService:
    def __init__(
        self,
        session_factory: Callable[[], Any],
        app_config: Any,
        static_assets: UiConfigStaticAssetService | None = None,
        event_bus: Any = None,
        ui_assets_root: Path | None = None,
    ) -> None:
        self._session_factory = session_factory
        self._app_config = app_config
        self._static_assets = static_assets or UiConfigStaticAssetService(
            ui_assets_root or get_ui_assets_dir()
        )
        self._event_bus = event_bus
        #: ``profiles`` 段的读-改-写互斥。``terminalBindings`` 是**整表替换**（删除绑定也要
        #: 整表写回），两台终端同时绑定时，后写方会拿自己那份旧快照覆盖先写方，绑定凭空消失。
        #: 单副本部署（single-process 门禁）下进程内锁就够；临界区只有内存读改写 + 一次落库。
        self._profiles_lock = threading.Lock()

    # 内部工具
    def _emit_config_updated(self) -> None:
        if self._event_bus is None:
            return
        for name in (_SYSTEM_CONFIG_UPDATED_EVENT, _LAYOUT_CONFIG_UPDATED_EVENT):
            emit_soon = getattr(self._event_bus, "emit_soon", None)
            if callable(emit_soon):
                try:
                    emit_soon(name)
                except Exception as exc:
                    logger.debug("广播 %s 失败: %s", name, exc)

    def _record(self, config: ProjectConfig) -> dict[str, Any]:
        return {
            "id": config.id,
            "projectId": config.project_id,
            "layout": read_json_object(config.layout),
            "createdAt": _iso(config.created_at),
            "updatedAt": _iso(config.updated_at),
        }

    def _find(self, session, project_id: str) -> ProjectConfig | None:
        return session.execute(
            select(ProjectConfig).where(ProjectConfig.project_id == project_id)
        ).scalar_one_or_none()

    @staticmethod
    def parse_layout_field(layout: Any) -> tuple[dict[str, Any], bool]:
        """解析 layout 为对象（API / 备份导入可能仍传入 JSON 字符串）。"""
        if layout is None or layout == "":
            return {}, False
        if isinstance(layout, dict):
            return layout, False
        if isinstance(layout, str):
            try:
                parsed = json.loads(layout)
            except (TypeError, ValueError) as exc:
                logger.error("布局 JSON 解析失败: %s", exc)
                return {}, True
            return (parsed, False) if isinstance(parsed, dict) else ({}, True)
        return {}, True

    def _profiles(self) -> dict[str, Any]:
        profiles = self._app_config.get("profiles")
        return profiles if isinstance(profiles, dict) else {}

    def get_config(self, project_id: str = "default") -> dict[str, Any]:
        """获取项目配置（不存在时返回 ``{projectId, layout: {}, updatedAt: None}``）。"""
        with self._session_factory() as session:
            config = self._find(session, project_id)
            if config is None:
                return {"projectId": project_id, "layout": {}, "updatedAt": None}
            return self._record(config)

    async def get_config_for_api(self, project_id: str) -> dict[str, Any]:
        """API：获取项目配置（含已解析 layout；敏感字段脱敏）。

        SQLite 读放到线程池：这个路由跑在事件循环上，同步查询会在慢查询 / WAL 检查点 /
        写事务等待时把整个进程的其它请求一起卡住。
        """
        try:
            data = await asyncio.to_thread(self.get_config, project_id)
            layout, parse_error = self.parse_layout_field(data.get("layout"))
            return {
                "success": True,
                "data": {
                    **data,
                    "layout": mask_layout(layout),
                    "layoutParseError": parse_error,
                },
            }
        except Exception as exc:
            if isinstance(exc, BusinessException):
                raise
            raise BusinessException(
                ErrorCode.CONFIG_ERROR, api_error("UI_CONFIG_LOAD_FAILED", str(exc))
            ) from exc

    # 激活方案 / 终端绑定
    async def set_active_profile(self, project_id_raw: str | None) -> dict[str, Any]:
        project_id = str(project_id_raw or "").strip()
        if not project_id:
            bad_request(api_error("UI_CONFIG_PROJECT_ID_REQUIRED"))
        if project_id == "default":
            self._ensure_default_profile()
        else:
            self._assert_profile_exists(project_id)
        if self.resolve_active_project_id() == project_id:
            return {"success": True, "activeProfileId": project_id}
        self._app_config.update({"profiles": {"activeProfileId": project_id}})
        self._emit_config_updated()
        return {"success": True, "activeProfileId": project_id}

    def resolve_active_project_id(self) -> str:
        return str(self._profiles().get("activeProfileId") or "").strip() or "default"

    def get_active_profile_settings(self) -> dict[str, Any]:
        profiles = self._profiles()
        return {
            "success": True,
            "data": {
                "activeProfileId": profiles.get("activeProfileId") or "default",
                "newTerminalDefault": profiles.get("newTerminalDefault") or "activeProfile",
            },
        }

    async def set_new_terminal_default(self, strategy: str | None) -> dict[str, Any]:
        value = str(strategy or "").strip()
        if value not in ("activeProfile", "default"):
            bad_request(api_error("UI_CONFIG_TERMINAL_DEFAULT_INVALID"))
        self._app_config.update({"profiles": {"newTerminalDefault": value}})
        return {"success": True, "newTerminalDefault": value}

    def list_terminal_bindings(self) -> dict[str, Any]:
        bindings = list(self._profiles().get("terminalBindings") or [])
        bindings.sort(key=lambda config: str(config.get("updatedAt") or ""), reverse=True)
        return {"success": True, "data": bindings}

    async def resolve_profile_for_terminal(self, client_id_raw: str | None) -> dict[str, Any]:
        client_id = str(client_id_raw or "").strip()
        if not client_id:
            bad_request(api_error("UI_CONFIG_CLIENT_ID_REQUIRED"))

        profiles = self._profiles()
        binding = next(
            (binding for binding in (profiles.get("terminalBindings") or []) if binding.get("clientId") == client_id),
            None,
        )
        if binding and binding.get("profileId") and self._profile_exists(binding["profileId"]):
            return {
                "success": True,
                "data": {"profileId": binding["profileId"], "source": "binding"},
            }

        strategy = profiles.get("newTerminalDefault") or "activeProfile"
        if strategy == "activeProfile":
            active_id = str(profiles.get("activeProfileId") or "").strip() or "default"
            if self._profile_exists(active_id):
                return {"success": True, "data": {"profileId": active_id, "source": "activeProfile"}}

        return {"success": True, "data": {"profileId": "default", "source": "default"}}

    @staticmethod
    def _merge_binding(existing: dict[str, Any] | None, config: dict[str, Any]) -> dict[str, Any]:
        """把本次写入合并进已有绑定：``label`` 缺省时保留旧值，``boundBy`` 只在首次写入时定。"""
        if existing is None:
            if config["label"] is None:
                config.pop("label", None)
            return config
        merged = {**existing, **config}
        if config["label"] is None:
            merged.pop("label", None)
        if config["boundBy"] is None:
            merged["boundBy"] = existing.get("boundBy")
        return merged

    async def upsert_terminal_binding(
        self, body: dict[str, Any], bound_by_user_id: str | None = None
    ) -> dict[str, Any]:
        client_id = str((body or {}).get("clientId") or "").strip()
        profile_id = str((body or {}).get("profileId") or "").strip()
        if not client_id:
            bad_request(api_error("UI_CONFIG_CLIENT_ID_REQUIRED"))
        if not profile_id:
            bad_request(api_error("UI_CONFIG_PROFILE_ID_REQUIRED"))
        self._assert_profile_exists(profile_id)

        config = {
            "clientId": client_id,
            "profileId": profile_id,
            "label": str(body.get("label")).strip() if body.get("label") is not None else None,
            "boundBy": bound_by_user_id,
            "updatedAt": datetime.now(UTC).isoformat(timespec="milliseconds").replace("+00:00", "Z"),
        }
        # 读整表 → 改一条 → 写整表：必须互斥，否则两台终端同时绑定会互相覆盖
        with self._profiles_lock:
            bindings = [dict(binding) for binding in (self._profiles().get("terminalBindings") or [])]
            index = next(
                (i for i, binding in enumerate(bindings) if binding.get("clientId") == client_id),
                None,
            )
            merged = self._merge_binding(bindings[index] if index is not None else None, config)
            if index is None:
                bindings.append(merged)
            else:
                bindings[index] = merged
            self._app_config.update({"profiles": {"terminalBindings": bindings}})
        return {"success": True, "data": merged}

    async def bind_self_terminal(
        self, body: dict[str, Any], caller: dict[str, Any] | None = None
    ) -> dict[str, Any]:
        client_id = str((body or {}).get("clientId") or "").strip()
        profile_id = str((body or {}).get("profileId") or "").strip()
        if not client_id:
            bad_request(api_error("UI_CONFIG_CLIENT_ID_REQUIRED"))
        if not profile_id:
            bad_request(api_error("UI_CONFIG_PROFILE_ID_REQUIRED"))
        self._assert_profile_exists(profile_id)

        caller = caller or {}
        # 单一管理员模型：绑定即写整表，无需再区分调用者角色。
        return await self.upsert_terminal_binding(body, caller.get("userId"))

    async def remove_terminal_binding(self, client_id_raw: str | None) -> dict[str, Any]:
        client_id = str(client_id_raw or "").strip()
        if not client_id:
            bad_request(api_error("UI_CONFIG_CLIENT_ID_REQUIRED"))
        # 同样按整表替换写回：与 upsert 共用一把锁，避免「刚解绑又被别人的旧快照写回」
        with self._profiles_lock:
            bindings = [
                binding
                for binding in (self._profiles().get("terminalBindings") or [])
                if binding.get("clientId") != client_id
            ]
            self._app_config.update({"profiles": {"terminalBindings": bindings}})
        return {"success": True, "removed": client_id}

    # 方案存在性
    def _ensure_default_profile(self) -> None:
        with self._session_factory() as session:
            if self._find(session, "default") is None:
                now = datetime.now(UTC)
                session.add(
                    ProjectConfig(
                        project_id="default",
                        layout=json.dumps({}, ensure_ascii=False),
                        created_at=now,
                        updated_at=now,
                    )
                )
                session.commit()

    def _profile_exists(self, project_id: str) -> bool:
        with self._session_factory() as session:
            return self._find(session, project_id) is not None

    def _assert_profile_exists(self, project_id: str) -> None:
        if not self._profile_exists(project_id):
            bad_request(api_error("UI_CONFIG_PROFILE_NOT_FOUND", project_id))

    # 保存 / 删除 / 导入 / 导出
    def save_config(self, project_id: str, layout: Any) -> dict[str, Any]:
        """保存或更新项目配置（保存后广播 SYSTEM_CONFIG_UPDATED 供旁路消费者热更新）。

        3.3 起 layout 不再承载 HA 连接配置，因此保存布局**不会**改变 HA 连接：地址与
        令牌的变更路径是 ``PUT /ha/connection``（由它自己重启连接器）。这里照旧广播
        ``SYSTEM_CONFIG_UPDATED``，供其它读 layout 的消费者（安防事件路径、绑定等）刷新。
        """
        logger.debug("正在保存项目布局配置:%s", project_id)
        layout_json = to_input_json(layout, {})
        with self._session_factory() as session:
            config = self._find(session, project_id)
            now = datetime.now(UTC)
            if config is None:
                config = ProjectConfig(
                    project_id=project_id,
                    layout=json.dumps(layout_json, ensure_ascii=False),
                    created_at=now,
                    updated_at=now,
                )
                session.add(config)
            else:
                config.layout = json.dumps(layout_json, ensure_ascii=False)
                config.updated_at = now
            session.commit()
            session.refresh(config)
            result = self._record(config)

        self._emit_config_updated()
        return result

    @staticmethod
    def _version_window(expected: datetime) -> tuple[datetime, datetime]:
        """把客户端版本号还原成「库里可能取值」的毫秒区间 ``[lo, lo + 1ms)``。

        对外契约（``_iso``）只到毫秒，库里是微秒：客户端回传的必然是
        ``floor(X, 1ms)``，因此 ``X`` 落在该区间内即视为同一版本。
        直接拿 datetime 相等比较会把所有请求都判成冲突。
        """
        naive = expected.astimezone(UTC).replace(tzinfo=None)
        lo = naive.replace(microsecond=(naive.microsecond // 1000) * 1000)
        return lo, lo + timedelta(milliseconds=1)

    def _load_layout_for_secret_backfill(self, project_id: str) -> Any:
        """取「保存时要用来回填密钥」的旧 layout（字符串或对象）。

        - 目标方案已存在 → 用它自己的旧 layout（同方案的占位符回填）；
        - 目标方案不存在但正要新建 → 沿用**当前激活方案**的 layout，让「以当前布局另存为
          新方案」（前端 ``createProfile``）复制出来的方案仍带着 Agent / 通道密钥。
          注意这与 ``import_all_configs`` 的口径不同：那条路径导入的是外部备份里的
          **全新** profile，回落到激活方案会把密钥写进不属于它的配置，所以那里禁止回落。
        """
        with self._session_factory() as session:
            config = self._find(session, project_id)
            if config is not None:
                return config.layout
        active_profile_id = str(self._profiles().get("activeProfileId") or "").strip()
        if not active_profile_id or active_profile_id == project_id:
            return None
        with self._session_factory() as session:
            active_row = self._find(session, active_profile_id)
            if active_row is not None and active_row.layout:
                return active_row.layout
        return None

    def save_config_checked(
        self,
        project_id: str,
        layout: Any,
        *,
        expected_updated_at: datetime | None = None,
    ) -> dict[str, Any]:
        """带版本校验的保存：**校验与写入在同一个事务里**完成。

        旧实现是「先开一个 session 读 updated_at，比对通过后再开另一个 session 写」，
        两个 session 之间别的终端可以提交，读-比-写因此不是原子的（TOCTOU）：两个终端
        同时通过校验、后写方静默覆盖先写方，乐观锁等于没生效。

        这里改成单条条件 UPDATE：``WHERE projectId=? AND updatedAt IN [版本, 版本+1ms)``，
        ``rowcount == 0`` 才是冲突。行不存在时走条件 INSERT，并发下另一方先建成功会撞
        ``projectId`` 唯一约束 → 同样按 409 处理，不再静默改成「更新别人刚建的行」。
        """
        layout_json = json.dumps(to_input_json(layout, {}), ensure_ascii=False)
        now = datetime.now(UTC)
        with self._session_factory() as session:
            if expected_updated_at is None:
                result = session.execute(
                    update(ProjectConfig)
                    .where(ProjectConfig.project_id == project_id)
                    .values(layout=layout_json, updated_at=now)
                    .execution_options(synchronize_session=False)
                )
            else:
                lo, hi = self._version_window(expected_updated_at)
                result = session.execute(
                    update(ProjectConfig)
                    .where(ProjectConfig.project_id == project_id)
                    .where(ProjectConfig.updated_at >= lo)
                    .where(ProjectConfig.updated_at < hi)
                    .values(layout=layout_json, updated_at=now)
                    .execution_options(synchronize_session=False)
                )
            if not result.rowcount:
                session.rollback()
                return self._create_if_absent(project_id, layout_json, now)
            session.commit()
            config = self._find(session, project_id)
            if config is None:  # pragma: no cover - 刚更新过的行不会消失（非并发删除）
                raise BusinessException(ErrorCode.CONFIG_ERROR, api_error("UI_CONFIG_LOAD_FAILED"))
            result_payload = self._record(config)

        self._emit_config_updated()
        return result_payload

    def _create_if_absent(self, project_id: str, layout_json: str, now: datetime) -> dict[str, Any]:
        """条件 UPDATE 没打到行时的收尾：确实不存在才 INSERT，否则就是版本冲突。"""
        with self._session_factory() as session:
            if self._find(session, project_id) is not None:
                raise BusinessException(ErrorCode.CONFLICT, api_error("UI_CONFIG_CONFLICT"))
            session.add(
                ProjectConfig(
                    project_id=project_id,
                    layout=layout_json,
                    created_at=now,
                    updated_at=now,
                )
            )
            try:
                session.commit()
            except IntegrityError as exc:
                # 另一个终端在这几毫秒里先建成功了：它刚写的内容不该被我们静默覆盖
                session.rollback()
                raise BusinessException(
                    ErrorCode.CONFLICT, api_error("UI_CONFIG_CONFLICT")
                ) from exc
            config = self._find(session, project_id)
            if config is None:  # pragma: no cover - 刚插入的行不会消失
                raise BusinessException(ErrorCode.CONFIG_ERROR, api_error("UI_CONFIG_LOAD_FAILED"))
            result = self._record(config)

        self._emit_config_updated()
        return result

    async def save_config_from_body(self, project_id: str, body: dict[str, Any]) -> dict[str, Any]:
        body = body or {}
        # 缺 layout 不能当成「保存空布局」：早期客户端 / 手写请求漏字段时，整份方案会被
        # 静默清空（且没有版本历史可回滚）。确实要清空必须显式传 ``{"layout": {}}``。
        if "layout" not in body or body.get("layout") is None or body.get("layout") == "":
            bad_request(api_error("UI_CONFIG_LAYOUT_REQUIRED"))
        layout_raw, parse_error = self.parse_layout_field(body.get("layout"))
        if parse_error:
            bad_request(api_error("UI_CONFIG_DATA_INVALID"))
        expected = _parse_expected_updated_at(body.get("expectedUpdatedAt"))

        existing_layout = self._load_layout_for_secret_backfill(project_id)
        merged_layout = merge_layout_secrets_on_save(layout_raw, existing_layout)
        result = self.save_config_checked(
            project_id, merged_layout, expected_updated_at=expected
        )
        # 保存响应同样脱敏：明文密钥不该回传给浏览器（前端并不消费这份 layout，
        # 但响应会出现在 devtools / 反代日志里）。
        stored = result.get("layout") if isinstance(result, dict) else None
        data = dict(result) if isinstance(result, dict) else {}
        if isinstance(stored, dict):
            data["layout"] = mask_layout(stored)
        return {"success": True, "data": data}

    async def delete_profile_safe(self, project_id: str) -> dict[str, Any]:
        self.delete_profile(project_id)
        return {"success": True}

    def delete_profile(self, project_id: str) -> None:
        if project_id == "default":
            bad_request(api_error("UI_CONFIG_DEFAULT_DELETE_DENIED"))
        with self._session_factory() as session:
            config = self._find(session, project_id)
            if config is None:
                bad_request(api_error("UI_CONFIG_PROFILE_NOT_FOUND", project_id))
            session.delete(config)
            session.commit()

    def list_profiles(self) -> list[dict[str, Any]]:
        with self._session_factory() as session:
            # 不设 limit：profile 列表是「切换/删除」界面的真源，截断后界面上消失的 profile
            # 依然在库里生效（用户会以为它已被删除），而这是唯一能列出它们的地方。
            rows = (
                session.execute(
                    select(ProjectConfig).order_by(ProjectConfig.updated_at.desc())
                )
                .scalars()
                .all()
            )
        return [{"projectId": config.project_id, "updatedAt": _iso(config.updated_at)} for config in rows]

    def get_profiles_summary(self) -> dict[str, Any]:
        profiles = self.list_profiles()
        return {"count": len(profiles), "profiles": profiles}

    def export_all_configs(self) -> list[dict[str, Any]]:
        with self._session_factory() as session:
            # 导出是「备份全部配置」的语义：limit 会让备份悄悄丢掉第 101 个 profile 之后的全部
            # 内容，而备份文件看上去是完整的（恢复时才发现少了一半）。
            rows = (
                session.execute(
                    select(ProjectConfig).order_by(ProjectConfig.updated_at.desc())
                )
                .scalars()
                .all()
            )
            return [self._record(config) for config in rows]

    async def import_all_configs_validated(self, body: dict[str, Any]) -> dict[str, Any]:
        configs = (body or {}).get("configs")
        if not isinstance(configs, list):
            bad_request(api_error("UI_CONFIG_DATA_INVALID"))
        return self.import_all_configs(configs)

    def import_all_configs(self, configs: list[dict[str, Any]]) -> dict[str, Any]:
        logger.info("正在恢复所有项目配置(%s 项)...", len(configs))
        valid = [
            item
            for item in configs
            if isinstance(item, dict) and item.get("projectId") and item.get("layout") is not None
        ]

        existing: dict[str, Any] = {}
        if valid:
            ids = [str(item["projectId"]) for item in valid]
            with self._session_factory() as session:
                # 这里**不能**加 limit：密钥兜底合并依赖「这些 profile 在库里长什么样」，
                # 漏掉一个 profile 就会把它的密钥字段当成「没有旧值」而写空（或写进别人的值）。
                rows = (
                    session.execute(
                        select(ProjectConfig).where(ProjectConfig.project_id.in_(ids))
                    )
                    .scalars()
                    .all()
                )
                for config in rows:
                    existing[config.project_id] = config.layout

        rows_to_write: list[dict[str, Any]] = []
        for item in valid:
            layout_obj, parse_error = self.parse_layout_field(item.get("layout"))
            if parse_error:
                logger.warning("跳过损坏的布局配置 projectId=%s", item.get("projectId"))
                continue
            project_id = str(item["projectId"])
            # 只在「该 profile 本来就在库里」时做密钥兜底合并。不要回落到 active_layout：
            # 导入一个全新 profile 时会把**当前激活 profile** 的密钥（HA 令牌 / MCP 网关
            # 密钥 / SMTP / VAPID 私钥）写进这份导入的配置里 —— 跨 profile 泄漏。
            merged = merge_layout_secrets_on_save(layout_obj, existing.get(project_id))
            rows_to_write.append({"projectId": project_id, "layout": merged})

        now = datetime.now(UTC)
        with self._session_factory() as session:
            for item in rows_to_write:
                config = self._find(session, item["projectId"])
                payload = json.dumps(item["layout"], ensure_ascii=False)
                if config is None:
                    session.add(
                        ProjectConfig(
                            project_id=item["projectId"],
                            layout=payload,
                            created_at=now,
                            updated_at=now,
                        )
                    )
                else:
                    config.layout = payload
                    config.updated_at = now
            session.commit()

        self._emit_config_updated()
        return {"success": True, "count": len(rows_to_write)}

    # 静态资源委托
    def get_safe_background_path(self, sub_path: str = ""):
        return self._static_assets.get_safe_background_path(sub_path)

    def get_safe_icon_path(self, sub_path: str = ""):
        return self._static_assets.get_safe_icon_path(sub_path)

    def list_backgrounds(self, sub_path: str = ""):
        return self._static_assets.list_backgrounds(sub_path)

    def list_icons(self, sub_path: str = ""):
        return self._static_assets.list_icons(sub_path)

    def create_background_directory(self, sub_path: str):
        return self._static_assets.create_background_directory(sub_path)

    def create_icon_directory(self, sub_path: str):
        return self._static_assets.create_icon_directory(sub_path)

    def save_background(self, filename: str, buffer: bytes, sub_path: str = ""):
        return self._static_assets.save_background(filename, buffer, sub_path)

    def save_icon(self, filename: str, buffer: bytes, sub_path: str = ""):
        return self._static_assets.save_icon(filename, buffer, sub_path)

    def delete_background(self, full_path: str):
        return self._static_assets.delete_background(full_path)

    def delete_icon(self, full_path: str):
        return self._static_assets.delete_icon(full_path)


__all__ = ["UiConfigService"]
