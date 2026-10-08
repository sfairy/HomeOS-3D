"""从 GitHub Releases 同步 HomeOS 发布版本。

设计边界：
- **商店是唯一对外取版本的出口。** 客户机（内网/离线）只轮询
  ``/store/v1/updates/latest``，不直接访问公网 GitHub；由商店这台中心机定时
  拉取、落库。这样即使客户机没有外网，升级提示也能工作。
- **失败绝不外溢。** 网络抖动、GitHub 限流、响应格式变化都只记日志；主服务
  与授权链路不受影响。下一轮再试。
- 版本号以 GitHub Release 的 ``tag_name`` 为准（如 ``2026.10.4.10``），
  重新发布的同版本只更新发布日期与说明，不重复插行。
"""

from __future__ import annotations

import json
import logging
import re
from dataclasses import dataclass
from datetime import datetime

import httpx
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..config import StoreSettings
from ..core.database import Database
from ..core.models import Release

logger = logging.getLogger("src.ops.release_sync")

PRODUCT = "homeos"
# 一份 GitHub Release 同时供给两个发行渠道；客户机按自己的 channel 取对应行。
SYNC_CHANNELS = ("docker", "addon")

GITHUB_API_BASE = "https://api.github.com"
GITHUB_API_VERSION = "2022-11-28"
REQUEST_TIMEOUT_SECONDS = 10.0
MAX_RESPONSE_BYTES = 65536
# 下发正文上限：主应用 updates.py 对 /store/v1/updates/latest 的响应有 32KB 硬上限
# （超了直接判定本轮失败）。这里按字节截断，JSON 转义后仍留足余量。
MAX_NOTES_BYTES = 8192
_NOTES_TRUNCATED_SUFFIX = "\n…（发布说明过长，已截断）"

# 版本号解析：可选 v/V 前缀，1~4 段纯数字（1.0.0 与 2026.10.4.10 都接受）。
_VERSION_PATTERN = re.compile(r"[vV]?(0|[1-9][0-9]{0,8})(?:\.(0|[1-9][0-9]{0,8})){0,3}")


def parse_release_version(value: object) -> tuple[int, ...] | None:
    """把版本号解析成可比较的整数元组；非法或不支持的格式返回 ``None``。

    段数允许 1~4 段，所以语义化 ``1.0.0`` 与日期式 ``2026.10.4.10`` 都能比较。
    不同段数按元组逐位比较（``1.0.0 < 2026.10.4.10``、``2026.10.4 < 2026.10.4.1``）。
    """
    if not isinstance(value, str):
        return None
    text = value.strip()
    if not _VERSION_PATTERN.fullmatch(text):
        return None
    return tuple(int(part) for part in text.lstrip("vV").split("."))


@dataclass(frozen=True)
class GithubRelease:
    """从 GitHub API 归一化后的最小发布信息。"""

    tag: str
    published_on: str
    notes: str
    html_url: str


def _normalized_date(value: object) -> str:
    """把 ISO 时间戳收敛成 ``YYYY-MM-DD``；解析不了就原样截断。"""
    text = value.strip() if isinstance(value, str) else ""
    if not text:
        return ""
    try:
        # Python 3.11+ 的 fromisoformat 已能直接解析 "Z" 后缀，无需手工替换。
        return datetime.fromisoformat(text).date().isoformat()
    except ValueError:
        return text[:32]


def _truncate_notes(value: str) -> str:
    """按 UTF-8 字节数截断发布说明，避免撑爆客户端响应上限。"""
    if not value:
        return ""
    encoded = value.encode("utf-8")
    if len(encoded) <= MAX_NOTES_BYTES:
        return value
    trimmed = encoded[:MAX_NOTES_BYTES].decode("utf-8", errors="ignore")
    return trimmed + _NOTES_TRUNCATED_SUFFIX


def _release_headers(token: str) -> dict[str, str]:
    headers = {
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": GITHUB_API_VERSION,
    }
    if token:
        headers["Authorization"] = f"Bearer {token}"
    return headers


def fetch_latest_release(
    repo: str,
    *,
    token: str = "",
    transport: httpx.BaseTransport | None = None,
    timeout: float = REQUEST_TIMEOUT_SECONDS,
) -> GithubRelease | None:
    """取仓库最新的正式 Release；没有 / 未发布 / tag 不可解析时返回 ``None``。

    只走 ``releases/latest``（GitHub 已排除 draft 与 prerelease），响应体积封顶，
    避免仓库被人塞进超大 release body 时把商店拖住。
    """
    url = f"{GITHUB_API_BASE}/repos/{repo}/releases/latest"
    with httpx.Client(timeout=timeout, transport=transport, follow_redirects=False) as client, client.stream("GET", url, headers=_release_headers(token)) as response:
        if response.status_code == 404:
            logger.info("GitHub 仓库 %s 还没有已发布的 Release。", repo)
            return None
        response.raise_for_status()
        body = bytearray()
        for chunk in response.iter_bytes():
            body.extend(chunk)
            if len(body) > MAX_RESPONSE_BYTES:
                raise ValueError("GitHub Release 响应过大")
    payload = json.loads(body)
    if not isinstance(payload, dict):
        raise ValueError("GitHub Release 响应不是对象")
    tag = payload.get("tag_name")
    if parse_release_version(tag) is None:
        logger.warning("GitHub Release tag %r 不是可比较的版本号，忽略本轮。", tag)
        return None
    notes = payload.get("body")
    html_url = payload.get("html_url")
    return GithubRelease(
        tag=str(tag).strip(),
        published_on=_normalized_date(payload.get("published_at")),
        notes=_truncate_notes(notes if isinstance(notes, str) else ""),
        html_url=html_url if isinstance(html_url, str) else "",
    )


def sync_release(session: Session, release: GithubRelease) -> bool:
    """把一条 GitHub Release 落库（按 product+channel+version 幂等）；返回是否有改动。"""
    changed = False
    for channel in SYNC_CHANNELS:
        existing = session.scalars(
            select(Release).where(
                Release.product == PRODUCT,
                Release.channel == channel,
                Release.version == release.tag,
            )
        ).first()
        if existing is None:
            session.add(
                Release(
                    product=PRODUCT,
                    channel=channel,
                    version=release.tag,
                    release_date=release.published_on,
                    upgrade_notes=release.notes,
                )
            )
            changed = True
            continue
        if existing.release_date != release.published_on:
            existing.release_date = release.published_on
            changed = True
        if release.notes and existing.upgrade_notes != release.notes:
            existing.upgrade_notes = release.notes
            changed = True
    if changed:
        session.flush()
    return changed


def sync_release_once(database: Database, settings: StoreSettings) -> bool:
    """拉一次 GitHub Releases 并落库。返回是否成功取得可用的发布信息。

    ``database`` / ``settings`` 由调用方（后台线程）传入，避免本模块反向依赖应用装配。
    """
    release = fetch_latest_release(settings.github_repo, token=settings.github_token)
    if release is None:
        return False
    with database.session() as session:
        changed = sync_release(session, release)
    if changed:
        logger.info(
            "已同步 GitHub Release %s（%s）。", release.tag, release.published_on or "日期未知"
        )
    return True


def select_latest_release(session: Session, channel: str) -> Release | None:
    """按**版本号**（而非写入时间）取该渠道最新一条发布记录。

    本地常量补写的记录与会话同步的记录写入顺序不定，用 ``created_at`` 排序会取错，
    所以这里逐条解析版本号取最大；解析不了的按写入时间兜底。
    """
    rows = session.scalars(
        select(Release)
        .where(Release.product == PRODUCT, Release.channel == channel)
        .order_by(Release.created_at.desc())
    ).all()
    best: Release | None = None
    best_key: tuple[int, ...] | None = None
    for row in rows:
        key = parse_release_version(row.version)
        if key is None:
            continue
        if best_key is None or key > best_key:
            best, best_key = row, key
    if best is not None:
        return best
    return rows[0] if rows else None
