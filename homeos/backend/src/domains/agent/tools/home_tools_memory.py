"""长期记忆工具族：``manage_memory``（偏好自动学习 / 遗忘）。

此前只有「记住……」口令能写记忆，用户随口说「我睡觉喜欢把灯调到 20%」不会被学习。
这里给模型一个显式写入入口，但仍守住三条边界：

- **只写偏好**：``kind`` 固定 ``preference``，别名仍走口令，避免模型把设备名改乱；
- **必须有身份**：无登录用户时拒绝写匿名记忆（匿名记忆会在所有人之间串味）；
- **有上限**：单用户最多 :data:`MAX_PREFERENCES` 条，防止模型每轮都写一条把系统提示撑爆。

作用域与对话链路共用 ``user:{id}`` 口径，写完后下一次对话的系统提示会带上。
"""

from __future__ import annotations

from typing import Any

from .home_tools_base import HomeToolsHost
from .home_tools_primitives import _s, logger
from ..memory.memory_store import MAX_PREFERENCES

#: 单条偏好内容长度上限（系统提示里会逐条拼接，太长会挤占工具 schema）
MAX_CONTENT_CHARS = 200


def _memory_scope(actor: Any) -> str | None:
    """与 ``AgentService._memory_scope`` 对齐：登录用户优先，无身份返回 None。"""
    if actor is None:
        return None
    user_id = str(getattr(actor, "user_id", "") or "").strip()
    username = str(getattr(actor, "username", "") or "").strip()
    if user_id or username:
        return f"user:{user_id or username}"
    return None


def _preference_key(content: str) -> str:
    """偏好 key：内容归一化后的前 40 字，重复内容覆盖而不是累计。"""
    return f"pref:{content.strip().lower()[:40]}"


class HomeToolsMemoryMixin(HomeToolsHost):
    """长期记忆工具族。"""

    async def _manage_memory(self, args: dict[str, Any], actor: Any = None) -> dict[str, Any]:
        """记住 / 遗忘一条长期偏好。"""
        memory = self._memory
        if memory is None:
            return {"error": "长期记忆未启用"}
        scope = _memory_scope(actor)
        if scope is None:
            return {
                "success": False,
                "blocked": True,
                "message": "未绑定执行身份，无法写入长期记忆。请在通道配置中绑定 HomeOS 用户。",
            }
        action = _s(args.get("action")).strip().lower()
        if action not in ("remember", "forget"):
            return {"error": "action 须为 remember 或 forget"}
        content = _s(args.get("content")).strip()
        if not content:
            return {"error": "content 不能为空"}
        if len(content) > MAX_CONTENT_CHARS:
            return {"error": f"内容过长（最多 {MAX_CONTENT_CHARS} 字）"}
        key = _preference_key(content)

        if action == "forget":
            removed = memory.forget(scope, key, kind="preference")
            return {
                "success": True,
                "removed": removed,
                "message": "已忘记这条偏好。" if removed else "没有找到这条偏好。",
            }

        existing = [item for item in memory.list_memories(scope) if item.get("kind") == "preference"]
        if len(existing) >= MAX_PREFERENCES and all(item.get("key") != key for item in existing):
            return {
                "success": False,
                "blocked": True,
                "message": f"偏好记忆已满（最多 {MAX_PREFERENCES} 条），请先删除一些再记新的。",
            }
        if not memory.remember(scope, key, content, kind="preference"):
            return {"success": False, "message": "这条偏好太短或内容为空，没有记住。"}
        logger.info("写入用户偏好: scope=%s key=%s", scope, key)
        return {
            "success": True,
            "content": content,
            "count": min(len(existing) + 1, MAX_PREFERENCES),
            "message": "好的，我记住了您的偏好。",
        }

    async def _manage_learning(self, args: dict[str, Any], actor: Any = None) -> dict[str, Any]:
        """学习体系工具族：别名 / 房间默认 / 回滚 / 习惯候选 / 负经验。

        所有写操作都需要登录身份（匿名会话之间会把设备名串味）。
        """
        store = self._learning
        if store is None:
            return {"error": "学习体系未启用"}
        scope = _memory_scope(actor)
        if scope is None:
            return {
                "success": False,
                "blocked": True,
                "message": "未绑定执行身份，无法写入学习配置。",
            }
        action = _s(args.get("action")).strip().lower()
        actor_label = str(getattr(actor, "user_id", "") or getattr(actor, "username", "") or "")
        if action.startswith("habit_"):
            return self._learning_habit_action(action, args)
        config_reply = await self._learning_config_action(store, action, args, actor_label)
        if config_reply is not None:
            return config_reply
        return {
            "error": (
                "action 须为 teach_alias / teach_area_default / list / revert / "
                "pause / resume / delete / habit_list / habit_dismiss / habit_accept / habit_reset"
            )
        }

    async def _learning_config_action(
        self, store: Any, action: str, args: dict[str, Any], actor_label: str
    ) -> dict[str, Any] | None:
        """学习配置的写操作；``None`` 表示 action 不匹配（交给调用方报错）。"""
        # 学习配置按 household 共享：scope 只用于偏好记忆，避免每个用户各学一套设备名。
        household = "household"
        if action == "teach_alias":
            return store.teach_alias(
                _s(args.get("alias")), _s(args.get("entity_id")), scope=household, actor=actor_label
            )
        if action == "teach_area_default":
            return await self._teach_area_default(store, args, actor_label)
        if action == "list":
            return {"success": True, "items": store.list_configs(_s(args.get("scope")) or None)}
        if action == "revert":
            revision = args.get("revision")
            return store.revert(
                _s(args.get("config_id")),
                int(revision) if isinstance(revision, (int, float)) else None,
                actor=actor_label,
            )
        if action in ("pause", "resume"):
            return store.set_active(_s(args.get("config_id")), action == "resume", actor=actor_label)
        if action == "delete":
            return store.delete(_s(args.get("config_id")), actor=actor_label)
        return None

    def _learning_habit_action(self, action: str, args: dict[str, Any]) -> dict[str, Any]:
        """习惯候选分支（独立成方法，压掉 ``_manage_learning`` 的分支数）。"""
        habits = self._habits
        if habits is None:
            return {"error": "习惯候选未启用"}
        if action == "habit_list":
            return {"success": True, "items": habits.list(_s(args.get("status")) or None)}
        candidate_id = _s(args.get("candidate_id"))
        if action == "habit_dismiss":
            return habits.dismiss(candidate_id)
        if action == "habit_reset":
            return habits.reset(candidate_id)
        return habits.graduate(candidate_id)

    async def _teach_area_default(self, store: Any, args: dict[str, Any], actor_label: str) -> dict[str, Any]:
        """「客厅默认开这台电视」——写到真正被消费的那张表。

        媒体默认设备由 ``device_profile_defaults`` 承载（语音选电视、点歌选音箱都读它）；
        旧实现写进学习表，而 `resolve_area_default` 全仓没有消费者，等于「记住了但永远不生效」。
        因此这里按实体类型分流：电视 / Apple TV 落设备画像；音箱需要 MA 播放器 id，
        请用户到面板选；其余域明确拒绝，不再假装记住。
        """
        entity_id = _s(args.get("entity_id")).strip()
        area_raw = _s(args.get("area_id")).strip()
        if not entity_id or not area_raw:
            return {"success": False, "message": "房间与实体都不能为空。"}
        profiles = self._device_profiles
        area_id = await self._resolve_area_id(area_raw)
        if not area_id:
            return {"success": False, "message": f"未找到房间「{area_raw}」。"}
        kind = self._profile_kind(entity_id)
        if self._device_profiles is None:
            # 画像未启用（裁剪部署）：退回学习表，至少不丢用户教的内容。
            return await self._teach_generic_area_default(store, area_id, args, entity_id, actor_label)
        if entity_id.startswith("media_player.") and kind in ("apple_tv", "tv"):
            result = profiles.set_default(area_id, kind, entity_id=entity_id)
            if result.get("success"):
                label = "Apple TV" if kind == "apple_tv" else "电视"
                result["message"] = f"记住了：{area_raw}的默认{label}是这台设备。"
            return result
        if entity_id.startswith("media_player."):
            return {
                "success": False,
                "message": "音箱类默认设备要在「设备画像 → 房间默认播放设备」里选 Music Assistant 播放器，"
                "这样说出来的名字才和点歌链路一致。",
            }
        # 其它域（灯 / 窗帘 / 场景）目前没有「房间默认设备」的消费方：明确拒绝，避免死配置。
        return await self._teach_generic_area_default(store, area_id, args, entity_id, actor_label)

    async def _teach_generic_area_default(
        self, store: Any, area_id: str, args: dict[str, Any], entity_id: str, actor_label: str
    ) -> dict[str, Any]:
        domain = _s(args.get("domain")).lower() or entity_id.split(".", 1)[0]
        result = store.teach_area_default(area_id, domain, entity_id, scope="household", actor=actor_label)
        if result.get("success"):
            result["message"] = (
                f"记住了{domain}的默认设备。注意：目前只有媒体设备会用它选目标，灯的默认设备仍以房间内唯一匹配为准。"
            )
        return result

    async def _resolve_area_id(self, raw: str) -> str:
        """房间名 / id → area id（识别不到返回空串）。"""
        service = self._area_service
        if service is None:
            return ""
        try:
            area = await service.find_one(raw)
        except Exception as exc:
            logger.debug("按 id 解析房间失败: %s", exc)
            area = None
        if area is not None:
            return str(getattr(area, "id", "") or "")
        lowered = raw.lower()
        try:
            areas = await service.find_all()
        except Exception as exc:
            logger.warning("读取房间列表失败: %s", exc)
            return ""
        for item in areas or []:
            name = str(getattr(item, "name", "") or "")
            if name and (name.lower() == lowered or lowered in name.lower() or name.lower() in lowered):
                return str(getattr(item, "id", "") or "")
        return ""


__all__ = ["MAX_CONTENT_CHARS", "MAX_PREFERENCES", "HomeToolsMemoryMixin"]
