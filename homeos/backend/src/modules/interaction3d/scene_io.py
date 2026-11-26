"""户型快照与草稿文档的读取原语 + 装饰模型引用的收集（0.8.9）。

这三件事放一起，是因为它们共享同一个「scene / document 长什么样」的知识：
- 快照文件在哪、怎么解析（:func:`scene_path` / :func:`load_scene_document`）；
- 草稿行怎么变成文档（:func:`decode_draft_document` / :func:`current_scene_payload`）；
- 文档里哪些物件引用了装饰模型（:func:`scene_model_ids`）。

从 `api.py` 抽出的理由：`api.py` 已经很大，且这些逻辑**不碰请求校验**，
是纯数据搬运 —— 放在路由层会让每加一条路由都继续堆高它，也会让它们无法
脱离 HTTP 直接断言。
"""

from __future__ import annotations

import json
import logging
import re
from typing import TYPE_CHECKING, Any

from .access import is_scene_id, scene_snapshot_file
from ...domains.studio3d.projects.schema import ProjectDraft
from ...platform.core.http.errors import BusinessException, ErrorCode, api_error

if TYPE_CHECKING:  # pragma: no cover - 仅类型
    from fastapi import Request

LOGGER = logging.getLogger("homeos.interaction3d")

#: 装饰模型 id 形状（32 位小写 hex，与 `domains.studio3d.models.MODEL_UUID` 一致）。
MODEL_ID_PATTERN = re.compile("[0-9a-f]{32}")

#: 场景里「自定义装饰」的物品类型。
USER_DECORATION_TYPE = "user-decoration"


def _not_found(key: str) -> BusinessException:
    """快照不存在：统一 404 + 稳定 `apiErrorCode`（前端按码判，不靠文案）。"""
    return BusinessException(ErrorCode.NOT_FOUND, api_error(key), 404)


def _corrupt() -> BusinessException:
    """快照损坏：409 而不是 500 —— 这是**用户可修复**的状态（重新保存一次户型）。"""
    return BusinessException(ErrorCode.CONFLICT, api_error("STUDIO3D_SCENE_CORRUPT"), 409)


def scene_path(request: Request, scene_id: str):
    """快照文件路径；不存在或 id 不合法时抛 404（不区分「格式错」与「不存在」）。"""
    if not is_scene_id(scene_id):
        raise _not_found("STUDIO3D_SCENE_NOT_FOUND")
    path = scene_snapshot_file(request.app.state.settings, scene_id)
    if path is None:
        raise _not_found("STUDIO3D_SCENE_MISSING")
    return path


def load_scene_document(request: Request, scene_id: str) -> dict:
    """读取并解析快照；损坏时抛 409（用户可重新保存修复，不是服务端故障）。"""
    try:
        command = json.loads(scene_path(request, scene_id).read_text(encoding="utf-8"))
    except (OSError, ValueError) as error:
        raise _corrupt() from error
    if not isinstance(command, dict):
        raise _corrupt()
    return command


def decode_draft_document(draft: ProjectDraft | None) -> dict | None:
    """解析仪表盘草稿的 `document_json`；无法解析时返回 `None` 并留一条 warning。"""
    if draft is None:
        return None
    try:
        document = json.loads(draft.document_json)
    except (TypeError, ValueError):  # fmt: skip
        LOGGER.warning("仪表盘草稿 %s 的 document_json 无法解析，按空文档处理。", draft.project_id)
        return None
    return document if isinstance(document, dict) else None


def current_scene_payload(request: Request, database, scene_id: str, reference: dict, *, since: str = "") -> dict:
    """当前草稿的场景负载；没有草稿时回落 `reference`（保存快照）。"""
    # 延迟导入：`studio_draft_scene` 依赖数据库装配，模块级导入会拖慢冷启动。
    #
    # 这里曾经写成 `from . import drafts` —— 那个模块在包里**不存在**，
    # 于是每次 `GET /scenes/{id}/current` 都抛 ImportError（500）。
    # 症状是「3D 控件一直是空白」，而错误只出现在服务端栈里，前端看不到。
    from .studio_draft_scene import read_current_studio_draft

    payload = read_current_studio_draft(database)
    if payload is None:
        if since:
            raise ValueError("saved source unavailable")
        return reference
    return payload


def strip_decoration_asset_prefix(value: object) -> str:
    """剥掉 0.8.9 上游的 ``model:`` 前缀（本仓存裸 hex，上游带前缀）。

    不剥的后果：从 0.8.9 导入的户型里引用会算不出来 ——
    场景内模型路由会 404，仪表盘里那件装饰永远加载不出来。
    """
    text = str(value or "").strip().lower()
    return text.removeprefix("model:")


def scene_model_ids(document: Any) -> set[str]:
    """收集一份场景文档里引用的装饰模型 id（逐楼层，兼容单层老文档）。

    只看 `type == 'user-decoration'` 的物件：其它类型的 `assetId` 是图片素材，
    走资产路由，与模型库无关。
    """
    root = document.get("scene") if isinstance(document, dict) else None
    if not isinstance(root, dict):
        return set()
    floors = root.get("floors")
    scenes: list[dict] = []
    if isinstance(floors, list):
        scenes = [
            floor.get("scene") for floor in floors if isinstance(floor, dict) and isinstance(floor.get("scene"), dict)
        ]
    if not scenes:
        scenes = [root]
    found: set[str] = set()
    for scene in scenes:
        for item in scene.get("items") or []:
            if not isinstance(item, dict) or item.get("type") != USER_DECORATION_TYPE:
                continue
            # 双键：本仓 `assetId`、0.8.9 上游 `modelAssetId`（带 `model:` 前缀）。
            asset_id = strip_decoration_asset_prefix(item.get("assetId") or item.get("modelAssetId"))
            if MODEL_ID_PATTERN.fullmatch(asset_id):
                found.add(asset_id)
    return found


__all__ = [
    "MODEL_ID_PATTERN",
    "USER_DECORATION_TYPE",
    "current_scene_payload",
    "decode_draft_document",
    "load_scene_document",
    "scene_model_ids",
    "scene_path",
    "strip_decoration_asset_prefix",
]
