"""3D 舞台打开路径上的响应交付：``/current`` 响应缓存、运行时资源版本与 sidecar 直出。

每个 3D iframe 打开都会走这几条路由，这里只关心「同样的内容别重复算、别重复下载」；
权限校验、草稿/快照解析仍留在 ``api.py``。
"""

from __future__ import annotations

import hashlib
import json
import logging
import re
from collections.abc import Callable
from dataclasses import dataclass
from pathlib import Path
from urllib.parse import urlencode

from fastapi import HTTPException, Request, Response
from fastapi.responses import FileResponse, JSONResponse

from ...config import Settings
from ...platform.core.http.frontend_resources import frontend_resource_url
from ...platform.core.http.precompressed_static import fresh_sidecar
from ...platform.http_cache import make_etag, not_modified, request_etag_matches, set_private_revalidate

LOGGER = logging.getLogger(__name__)

#: 与 ``bootstrap.studio_shell.IMMUTABLE_PRIVATE_CACHE`` 同值（中间件按字面值识别并保留）。
IMMUTABLE_PRIVATE_CACHE = "private, max-age=31536000, immutable"

#: ``core/stage.css`` 第一行 ``@import`` 的目标，必须与 CSS 里的字面 URL 一致，预加载才会被复用。
STAGE_CONTROLS_CSS = "/static/modules/interaction3d/controls.css"

SAVE_PENDING_DETAIL = "户型保存尚未完成，稍后自动重试。"


def scene_cache_scope(light_scope: str, viewer, project_id: str) -> str:
    """浏览器侧场景/几何准备缓存的作用域。

    有 HA 连接时与灯光历史作用域相同（缓存键不变）；HA 未连接时灯光历史作用域为空，
    但几何准备与 HA 无关，按「用户 + 项目」退回一个稳定值，避免每次打开都整场景冷构建。
    """
    if light_scope:
        return light_scope
    principal = viewer.user
    if not project_id or principal is None or not principal.id:
        return ""
    identity = ["i3d-scene-cache-v1", "user", principal.id, project_id]
    return hashlib.sha256(json.dumps(identity, separators=(",", ":")).encode("utf-8")).hexdigest()


def inject_background_urls(scene: dict, scene_id: str, project_id: str) -> None:
    for floor in scene.get("floors", []):
        background = floor.get("scene", {}).get("background") or {}
        asset_id = str(background.get("assetId", "")).removeprefix("user:")
        if not re.fullmatch("[0-9a-f]{32}", asset_id):
            continue
        background["url"] = (
            f"/api/v1/modules/interaction3d/scenes/{scene_id}/background/{asset_id}?{urlencode({'projectId': project_id})}"
        )


@dataclass(frozen=True)
class CurrentSceneEntry:
    sync_key: str
    body: bytes
    #: 草稿缺失/损坏时退回快照的结果：带 ``since`` 的同步请求必须继续得到 409。
    fallback: bool


#: ``/scenes/{id}/current`` 的响应缓存：键含快照文件指纹与草稿 (revision, updated_at, 长度)，
#: 任一变化即失效。原来每次都重新解析草稿与快照、``sort_keys`` 全量序列化求哈希、
#: 再序列化约 160KB 的响应。
_CURRENT_SCENE_CACHE_LIMIT = 8
_current_scene_cache: dict[tuple, CurrentSceneEntry] = {}


def build_current_scene_entry(
    command: dict | None, reference: dict, scene_id: str, project_id: str, source_key: str
) -> CurrentSceneEntry:
    """``command`` 为 None 表示草稿不可用、退回快照。"""
    fallback = command is None
    if fallback:
        # 缓存里的快照只读：退回路径会就地注入底图 URL，先深拷贝（referenceScene 与 scene 同一对象，与原行为一致）。
        command = json.loads(json.dumps(reference))
        reference_scene = command["scene"]
    else:
        reference_scene = reference["scene"]
    key = hashlib.sha256(json.dumps(command["scene"], sort_keys=True, separators=(",", ":")).encode()).hexdigest()
    command["syncKey"] = key
    command["referenceScene"] = reference_scene
    inject_background_urls(command["scene"], scene_id, project_id)
    command.pop(source_key, None)
    return CurrentSceneEntry(sync_key=key, body=bytes(JSONResponse(command).body), fallback=fallback)


def scene_document_response(request: Request, command: dict, scene_id: str, project_id: str) -> Response:
    """``GET /scenes/{id}`` 的响应：带强 ETag，``If-None-Match`` 命中时回 304。

    户型文档在同一 projectId 下稳定；此前是 ``no-store``，每次打开都全量重传并重新解析。
    换成 ``private, no-cache`` + ETag 后，未变化时只回一个空 304。
    """
    body = JSONResponse(command).body
    etag = make_etag("i3d-scene-v1", scene_id, project_id, hashlib.sha256(body).hexdigest())
    if request_etag_matches(request, etag):
        return not_modified(etag)
    response = Response(body, media_type="application/json")
    set_private_revalidate(response, etag)
    return response


def serve_current_scene(
    scene_file: Path,
    project_id: str,
    draft_fingerprint: tuple | None,
    since: str,
    build: Callable[[], CurrentSceneEntry],
) -> Response:
    try:
        stat = scene_file.stat()
    except OSError as error:
        raise HTTPException(409, detail="户型快照损坏或无法读取，请重新保存后再试。") from error
    if since and draft_fingerprint is None:
        raise HTTPException(409, detail=SAVE_PENDING_DETAIL)
    cache_key = (str(scene_file), stat.st_mtime_ns, stat.st_size, project_id, draft_fingerprint)
    entry = _current_scene_cache.get(cache_key)
    if entry is None:
        entry = build()
        if len(_current_scene_cache) >= _CURRENT_SCENE_CACHE_LIMIT:
            _current_scene_cache.clear()
        _current_scene_cache[cache_key] = entry
    elif since and entry.fallback:
        raise HTTPException(409, detail=SAVE_PENDING_DETAIL)
    if entry.sync_key == since:
        return Response(status_code=204, headers={"Cache-Control": "no-store"})
    return Response(entry.body, media_type="application/json", headers={"Cache-Control": "no-store"})


def runtime_file_version(settings: Settings, filename: str) -> str:
    """运行时稳定 URL 文件（``core/stage.js`` 等）自身的指纹：重建即变。

    不能用前端 ``resource-version``：那是主应用构建写的，单独重建 3D runtime 时它不变。
    """
    try:
        stat = (settings.runtime_dir / filename).stat()
    except OSError:
        LOGGER.debug("3D 运行时文件不可读，退回构建版本：%s", filename, exc_info=True)
        return ""
    return hashlib.sha256(f"{filename}:{stat.st_mtime_ns}:{stat.st_size}".encode()).hexdigest()[:16]


def versioned_runtime_url(settings: Settings, filename: str) -> str:
    url = f"/api/v1/modules/interaction3d/{filename}"
    version = runtime_file_version(settings, filename)
    return f"{url}?v={version}" if version else frontend_resource_url(settings.frontend_dir, url)


def runtime_file_response(
    request: Request, settings: Settings, filename: str, path: Path, media_type: str
) -> FileResponse:
    requested_version = request.query_params.get("v", "")
    cache_control = (
        IMMUTABLE_PRIVATE_CACHE
        if requested_version and requested_version == runtime_file_version(settings, filename)
        else "private, no-cache"
    )
    sidecar = None if request.headers.get("range") else fresh_sidecar(path, request.headers.get("accept-encoding", ""))
    if sidecar is not None:
        encoding, sidecar_path = sidecar
        return FileResponse(
            sidecar_path,
            media_type=media_type,
            headers={"Cache-Control": cache_control, "Content-Encoding": encoding, "Vary": "Accept-Encoding"},
        )
    return FileResponse(path, media_type=media_type, headers={"Cache-Control": cache_control})
