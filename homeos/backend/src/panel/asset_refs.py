"""素材引用的统一解析面（对齐 0.8.1 的 ``panel/asset_refs.py``）。

仪表盘文档、独立户型图草稿、全局组合弹窗三处都会引用同一批图片，删除 / 覆盖图片之前
必须**问全所有引用方**。这里把「文档里怎么算引用」「哪些引用是可变的」「读不出来的引用方
算不算安全」三件事收进一处：

- :func:`document_asset_ids` —— 递归扫 ``*assetId`` 字段，识别 ``builtin:`` / ``user:`` /
  ``studio3d:`` 三种前缀。``studio3d:`` 是 0.8.1 新增的引用面（自动导图），漏掉它会让
  正在使用的导图图片被当成孤儿删掉。
- :func:`validate_assets` —— 保存前校验引用仍然存在，并返回**可变**素材（``user:`` /
  ``studio3d:``）；``builtin:`` 由发行包提供，不参与回收。
- :func:`saved_project_documents` / :func:`referenced_asset_ids` —— 删除侧枚举所有已提交
  的引用方。读不出来的文档一律 409（「先恢复草稿再删除」）：证明不了安全就不能删。
"""

from __future__ import annotations

import json
from collections.abc import Iterator
from typing import Any

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..platform.core.db.models import ProjectDraft

#: 文档里允许出现在 ``*assetId`` 字段上的前缀。
ASSET_PREFIXES = ('builtin:', 'user:', 'studio3d:')

#: 可被回收（删除 / 覆盖）的前缀：内置素材只随发行包变化。
MUTABLE_ASSET_PREFIXES = ('user:', 'studio3d:')


def document_asset_ids(value: Any) -> set[str]:
    """递归收集文档里引用的素材 id（含嵌套在数组 / 对象深处的）。"""
    result: set[str] = set()
    if isinstance(value, dict):
        for key, item in value.items():
            if (
                isinstance(item, str)
                and key.lower().endswith('assetid')
                and item.startswith(ASSET_PREFIXES)
            ):
                result.add(item)
                continue
            result.update(document_asset_ids(item))
    elif isinstance(value, list):
        for item in value:
            result.update(document_asset_ids(item))
    return result


def studio_asset_ids(value: Any) -> set[str]:
    """户型图场景引用的可回收素材（``user:`` / ``studio3d:``）。

    3D 场景与仪表盘文档共用同一套素材目录：删除图片前除了扫仪表盘草稿，
    还要把当前户型图场景算进来，否则「场景里正在用的图」会被当成孤儿删掉。
    """
    return {
        asset_id
        for asset_id in document_asset_ids(value)
        if asset_id.startswith(MUTABLE_ASSET_PREFIXES)
    }


def validate_assets(catalog: Any, document: Any) -> set[str]:
    """校验 ``document`` 引用的图片都存在；返回其中的可变素材 id。

    调用方必须持有 catalog 的 mutation lock 直到引用更新已提交 —— 否则「校验通过」与
    「真的写进去」之间会插进一次删除。
    """
    mutable_ids: set[str] = set()
    for asset_id in document_asset_ids(document):
        if not catalog.asset_exists(asset_id):
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail={
                    'code': 'ASSET_MISSING',
                    'message': f'引用的图片已不存在：{asset_id}',
                },
            )
        if not asset_id.startswith(MUTABLE_ASSET_PREFIXES):
            continue
        mutable_ids.add(asset_id)
    return mutable_ids


def saved_project_documents(database: Session) -> Iterator[tuple[str, dict]]:
    """逐条产出 ``(project_id, document)``；读不出来的草稿直接 409。

    生成器在迭代时才可能抛错，调用方（删除素材 / 覆盖导图）必须让它先跑完再动手。
    """
    for draft in database.scalars(select(ProjectDraft)):
        try:
            document = json.loads(draft.document_json)
            if not isinstance(document, dict):
                raise ValueError('dashboard document must be an object')
        except (TypeError, ValueError) as error:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail='无法核对仪表盘的图片引用，请先恢复草稿后再删除或覆盖。',
            ) from error
        yield draft.project_id, document


def referenced_asset_ids(
    database: Session,
    *,
    scene_documents: Iterator[Any] | list[Any] | tuple[Any, ...] = (),
) -> set[str]:
    """所有已提交引用方（仪表盘草稿 + 全局组合弹窗 + 调用方给的户型图场景）的素材 id。"""
    # 延迟导入：``panel`` 是叶子工具包，不在模块加载期把 UI 配置域拉起来。
    from ..domains.ui_config.global_popups import global_popups

    result = document_asset_ids(
        {'customPopups': global_popups(database, require_readable=True)}
    )
    for _project_id, document in saved_project_documents(database):
        result.update(document_asset_ids(document))
    for scene in scene_documents:
        result.update(document_asset_ids(scene))
    return result
