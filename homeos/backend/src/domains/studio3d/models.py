"""用户上传的静态 GLB 装饰模型库（0.8.9「我的装饰」）。

职责边界（刻意很窄）：

- **存放**：``data/modules/interaction3d/models/<asset_id>.glb``；
- **索引**：同目录下的 ``library.json``（模型数极少，单文件足够，不必上数据库）；
- **引用**：场景里以 ``assetId`` 引用；删除走墓碑，保证「删了但还没保存的场景」不会立刻烂掉；
- **校验**：结构校验在 :mod:`model_glb`（只读字节，不落盘）。

为什么删除用墓碑而不是直接 unlink：

    用户在绘制页删掉一个装饰时，内存里的草稿仍引用着它；草稿下一次保存之前如果直接
    unlink，服务端在「保存时核对引用」阶段只能报错，用户还得手动清理。墓碑
    （``.deleted-<id>``）让「已删除但可能还被引用」这个短暂状态可表达：
    保存时的核对能明确区分「从未存在」与「刚被删掉」，给出可操作的提示。

并发：所有写入都走 :class:`ModelLibrary` 的 ``mutation_lock``（进程内一把锁）。
与 ``asset_catalog.mutation_lock`` 的语义相同 —— 「删除」与「保存时核对引用」
必须串行，否则会读到「目录已删、草稿仍引用」的中间态。
"""

from __future__ import annotations

import json
import logging
import os
import re
import threading
import time
from dataclasses import dataclass
from pathlib import Path

from ...platform.core.http.errors import BusinessException, ErrorCode, api_error

logger = logging.getLogger("homeos.studio3d.models")

#: 模型 id：32 位小写 hex（与场景负载 / API 路径同一正则）。
MODEL_UUID = re.compile(r"^[0-9a-f]{32}$")

#: 单个模型的体积上限。12 MiB 足够放一个「家具级」静态装饰，又不至于让首屏拖垮。
MAX_MODEL_BYTES = 12 * 1024 * 1024

#: 整个库的体积上限（含所有模型）。超过就要求用户先清理，而不是静默失败。
MAX_LIBRARY_BYTES = 128 * 1024 * 1024

#: 库内模型数量上限。绘制页的拖拽列表超过这个量级已经不可用。
MAX_LIBRARY_MODELS = 240

#: 展示名上限（与前端 ``USER_DECORATION_NAME_LIMIT`` 同口径）。
NAME_LIMIT = 64

MODEL_CONTENT_TYPE = "model/gltf-binary"
MODEL_SUFFIX = ".glb"
TMP_PREFIX = ".upload-"
DELETED_PREFIX = ".deleted-"
INDEX_NAME = "library.json"
#: 场景负载里「这个场景引用了哪些模型」的字段名（与前端一致）。
RETIRED_SCENE_KEY = "sceneModelIds"

_SAFE_LABEL = re.compile(r"[\x00-\x1f\x7f]")


@dataclass(frozen=True, slots=True)
class ModelRecord:
    """一条模型库记录（``library.json`` 的值）。"""

    asset_id: str
    name: str
    bytes: int
    #: 创建时间（epoch 秒），仅用于列表排序与排障。
    created_at: float = 0.0
    #: 是否由内置素材迁移而来（``builtin``）；用户上传为 ``False``。
    builtin: bool = False

    def as_payload(self) -> dict[str, object]:
        return {
            "assetId": self.asset_id,
            "name": self.name,
            "bytes": self.bytes,
            "createdAt": self.created_at,
            "builtin": self.builtin,
        }


def normalize_model_name(raw: object) -> str:
    """展示名净化：去控制字符、压空白、截断。空名回落「我的装饰」。"""
    text = _SAFE_LABEL.sub("", str(raw or "")).strip()
    text = re.sub(r"\s+", " ", text)
    if not text:
        return "我的装饰"
    return text[:NAME_LIMIT]


def model_error(reason: str) -> BusinessException:
    """构造「模型不合法」业务异常（携带稳定 ``apiErrorCode``）。"""
    return BusinessException(
        ErrorCode.VALIDATION_FAILED,
        api_error("STUDIO3D_MODEL_INVALID", reason),
        422,
    )


def model_too_large_error(limit: int) -> BusinessException:
    return BusinessException(
        ErrorCode.VALIDATION_FAILED,
        api_error("STUDIO3D_MODEL_TOO_LARGE", f"{limit // (1024 * 1024)} MiB"),
        413,
    )


class ModelLibrary:
    """装饰模型库（目录 + 索引 + 一把写锁）。

    无数据库依赖：索引是一份 JSON，读取时按 mtime 缓存，写入时原子替换。
    这样「备份还原」只需要拷目录，且不会因为数据库版本差异卡住。
    """

    def __init__(self, root: Path) -> None:
        self.root = Path(root)
        self.mutation_lock = threading.RLock()
        self._index_cache: dict[str, ModelRecord] | None = None
        self._index_mtime: float = -1.0

    # ── 目录 ────────────────────────────────────────────────────────────
    def ensure_dirs(self) -> None:
        """创建目录并收紧权限（0600 文件 / 0700 目录口径与其它数据目录一致）。"""
        self.root.mkdir(parents=True, exist_ok=True)
        try:
            os.chmod(self.root, 0o700)
        except OSError:  # pragma: no cover - 非 POSIX 或权限受限
            logger.debug("收紧模型库目录权限失败（非 POSIX 或权限受限）：%s", self.root, exc_info=True)

    @property
    def index_path(self) -> Path:
        return self.root / INDEX_NAME

    def model_path(self, asset_id: str) -> Path:
        return self.root / f"{asset_id}{MODEL_SUFFIX}"

    def tombstone_path(self, asset_id: str) -> Path:
        return self.root / f"{DELETED_PREFIX}{asset_id}{MODEL_SUFFIX}"

    # ── 索引 ────────────────────────────────────────────────────────────
    def _load_index(self) -> dict[str, ModelRecord]:
        try:
            stat = self.index_path.stat()
        except OSError:
            # 索引还不存在是常态（首次启动），不是故障。
            logger.debug("模型库索引尚不可读，按空库继续：%s", self.index_path, exc_info=True)
            self._index_cache = {}
            self._index_mtime = -1.0
            return {}
        if self._index_cache is not None and stat.st_mtime == self._index_mtime:
            return self._index_cache
        records: dict[str, ModelRecord] = {}
        try:
            payload = json.loads(self.index_path.read_text(encoding="utf-8"))
            items = payload.get("models") if isinstance(payload, dict) else None
            for raw in items or []:
                asset_id = str(raw.get("assetId") or "")
                if not MODEL_UUID.match(asset_id):
                    continue
                records[asset_id] = ModelRecord(
                    asset_id=asset_id,
                    name=normalize_model_name(raw.get("name")),
                    bytes=int(raw.get("bytes") or 0),
                    created_at=float(raw.get("createdAt") or 0),
                    builtin=bool(raw.get("builtin")),
                )
        except (OSError, ValueError, TypeError):  # fmt: skip
            # 索引坏了不该让整个功能 500：退化成「空库 + 保留磁盘文件」，用户能重新上传。
            logger.warning("装饰模型索引无法解析，按空库继续：%s", self.index_path)
            records = {}
        self._index_cache = records
        self._index_mtime = stat.st_mtime
        return records

    def _write_index(self, records: dict[str, ModelRecord]) -> None:
        self.ensure_dirs()
        payload = {
            "version": 1,
            "models": [record.as_payload() for record in sorted(records.values(), key=lambda r: r.created_at)],
        }
        temporary = self.index_path.with_suffix(".json.tmp")
        temporary.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
        try:
            os.chmod(temporary, 0o600)
        except OSError:  # pragma: no cover
            logger.debug("收紧索引文件权限失败：%s", temporary, exc_info=True)
        os.replace(temporary, self.index_path)
        self._index_cache = dict(records)
        try:
            self._index_mtime = self.index_path.stat().st_mtime
        except OSError:  # pragma: no cover
            logger.debug("读取索引 mtime 失败，下一轮将强制重载：%s", self.index_path, exc_info=True)
            self._index_mtime = -1.0

    # ── 查询 ────────────────────────────────────────────────────────────
    def list_models(self) -> list[ModelRecord]:
        with self.mutation_lock:
            records = self._load_index()
        # 只返回文件真实存在的条目：手工删掉文件后列表不应还挂着幽灵项。
        alive = [record for record in records.values() if self.model_path(record.asset_id).exists()]
        alive.sort(key=lambda record: record.created_at, reverse=True)
        return alive

    def total_bytes(self) -> int:
        return sum(record.bytes for record in self.list_models())

    def get(self, asset_id: str) -> ModelRecord | None:
        if not MODEL_UUID.match(asset_id):
            return None
        with self.mutation_lock:
            record = self._load_index().get(asset_id)
        if record is None:
            return None
        return record if self.model_path(asset_id).exists() else None

    def exists(self, asset_id: str) -> bool:
        return self.get(asset_id) is not None

    def is_retired(self, asset_id: str) -> bool:
        """是否「被删除过」（墓碑存在）。用来区分「从未存在」与「刚被删」。"""
        return MODEL_UUID.match(asset_id) is not None and self.tombstone_path(asset_id).exists()

    def read_model_bytes(self, asset_id: str) -> bytes:
        """读取模型字节。用于 3D 舞台按场景引用下发。"""
        record = self.get(asset_id)
        if record is None:
            raise BusinessException(ErrorCode.NOT_FOUND, api_error("STUDIO3D_MODEL_NOT_FOUND"), 404)
        try:
            return self.model_path(asset_id).read_bytes()
        except OSError as error:  # pragma: no cover - 磁盘异常
            raise BusinessException(ErrorCode.NOT_FOUND, api_error("STUDIO3D_MODEL_NOT_FOUND"), 404) from error

    # ── 写入 ────────────────────────────────────────────────────────────
    def store(self, asset_id: str, name: str, payload: bytes) -> ModelRecord:
        """落盘一个新模型。调用方已完成结构校验（见 :mod:`model_glb`）。"""
        if not MODEL_UUID.match(asset_id):
            raise model_error("模型 id 格式无效。")
        if len(payload) > MAX_MODEL_BYTES:
            raise model_too_large_error(MAX_MODEL_BYTES)
        with self.mutation_lock:
            records = self._load_index()
            if asset_id in records and self.model_path(asset_id).exists():
                raise BusinessException(ErrorCode.CONFLICT, "模型 id 已存在，请重试上传。", 409)
            if len(records) >= MAX_LIBRARY_MODELS:
                raise BusinessException(ErrorCode.CONFLICT, "装饰模型数量已达上限，请先删除不用的模型。", 409)
            if self.total_bytes() + len(payload) > MAX_LIBRARY_BYTES:
                raise BusinessException(ErrorCode.CONFLICT, "装饰模型总大小已达上限，请先删除不用的模型。", 409)
            self.ensure_dirs()
            # 上传态文件：先写临时名，落盘成功后再原子改名，避免「半个 GLB」被读到。
            temporary = self.root / f"{TMP_PREFIX}{asset_id}"
            temporary.write_bytes(payload)
            try:
                os.chmod(temporary, 0o600)
            except OSError:  # pragma: no cover
                logger.debug("收紧模型文件权限失败：%s", temporary, exc_info=True)
            os.replace(temporary, self.model_path(asset_id))
            record = ModelRecord(
                asset_id=asset_id,
                name=normalize_model_name(name),
                bytes=len(payload),
                created_at=time.time(),
            )
            records[asset_id] = record
            self._write_index(records)
            return record

    def remove(self, asset_id: str) -> bool:
        """删除模型：移成墓碑。返回是否真的删掉（不存在时 ``False``）。"""
        if not MODEL_UUID.match(asset_id):
            return False
        with self.mutation_lock:
            records = self._load_index()
            path = self.model_path(asset_id)
            if not path.exists():
                records.pop(asset_id, None)
                return False
            tombstone = self.tombstone_path(asset_id)
            try:
                if tombstone.exists():
                    tombstone.unlink()
                os.replace(path, tombstone)
            except OSError as error:  # pragma: no cover
                raise BusinessException(ErrorCode.DB_ERROR, "装饰模型删除失败，请稍后重试。", 500) from error
            records.pop(asset_id, None)
            self._write_index(records)
            return True

    def rename(self, asset_id: str, name: str) -> ModelRecord:
        with self.mutation_lock:
            records = self._load_index()
            record = records.get(asset_id)
            if record is None or not self.model_path(asset_id).exists():
                raise BusinessException(ErrorCode.NOT_FOUND, api_error("STUDIO3D_MODEL_NOT_FOUND"), 404)
            updated = ModelRecord(
                asset_id=record.asset_id,
                name=normalize_model_name(name),
                bytes=record.bytes,
                created_at=record.created_at,
                builtin=record.builtin,
            )
            records[asset_id] = updated
            self._write_index(records)
            return updated

    # ── 恢复 ────────────────────────────────────────────────────────────
    def recover(self) -> dict[str, int]:
        """启动自愈：补目录、清临时文件、把「索引里有但文件丢了」的条目摘掉。

        刻意**不**自动复活墓碑：用户删了就是删了，自动恢复会让「删除」看起来没生效。
        返回统计供启动日志使用。
        """
        stats = {"temporary": 0, "missing": 0, "orphan": 0}
        self.ensure_dirs()
        with self.mutation_lock:
            for candidate in self.root.glob(f"{TMP_PREFIX}*"):
                try:
                    candidate.unlink()
                    stats["temporary"] += 1
                except OSError:  # pragma: no cover
                    logger.warning("清理上传残留失败，下次启动再试：%s", candidate, exc_info=True)
                    continue
            records = self._load_index()
            changed = False
            for asset_id in list(records):
                if not self.model_path(asset_id).exists():
                    records.pop(asset_id, None)
                    stats["missing"] += 1
                    changed = True
            # 磁盘上有、索引里没有的 GLB：补登记（备份还原只拷文件时也能自愈）。
            for candidate in self.root.glob(f"*{MODEL_SUFFIX}"):
                name = candidate.name
                if name.startswith((DELETED_PREFIX, TMP_PREFIX)):
                    continue
                stem = candidate.stem
                if not MODEL_UUID.match(stem) or stem in records:
                    continue
                try:
                    size = candidate.stat().st_size
                except OSError:  # pragma: no cover
                    logger.warning("补登记模型时读取大小失败，跳过：%s", candidate, exc_info=True)
                    continue
                records[stem] = ModelRecord(asset_id=stem, name="我的装饰", bytes=size)
                stats["orphan"] += 1
                changed = True
            if changed:
                self._write_index(records)
        return stats

    # ── 场景引用 ─────────────────────────────────────────────────────────
    def missing_scene_models(self, scene_ids: set[str]) -> list[str]:
        """场景引用里「已删除」的模型 id 列表（保存前核对用）。"""
        return sorted(asset_id for asset_id in scene_ids if MODEL_UUID.match(asset_id) and not self.exists(asset_id))
