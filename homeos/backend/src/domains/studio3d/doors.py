"""门默认开度的保存边界校验。

``defaultOpening`` 是「未绑定设备时门画成多开」的作者意图值（0–100%），与实时的门磁
状态、开合动画无关 —— 后者不写进户型文档。越界值会让前端布局按 ``percent / 100``
插值出负角度或超过 90° 的摆动，因此必须在写入前拦住。

``bool`` 要单独拒绝：它是 ``int`` 的子类，``isinstance(True, int)`` 为真，只写区间
判断会把 ``true`` 当成 1% 放过去。
"""

from typing import Any

from fastapi import HTTPException

#: 默认开度的合法区间（百分比）。
DOOR_OPENING_RANGE = (0, 100)


def validate_door_openings(document: Any) -> None:
    """遍历草稿里的所有场景，校验门的 ``defaultOpening``。

    场景既可能挂在 ``document['floors'][*]['scene']`` 下（多楼层户型），也可能就是
    ``document`` 本身（单层 / 老版本草稿），与 :func:`validate_window_designs` 同口径。
    """
    if not isinstance(document, dict):
        return
    floors = document.get("floors")
    if isinstance(floors, list):
        scenes = [floor.get("scene") for floor in floors if isinstance(floor, dict)]
    else:
        scenes = [document]
    for scene in scenes:
        if not isinstance(scene, dict) or not isinstance(scene.get("doors"), list):
            continue
        for door in scene["doors"]:
            if not isinstance(door, dict) or "defaultOpening" not in door:
                continue
            opening = door["defaultOpening"]
            # ``type(...) in (int, float)`` 而不是 ``isinstance``：bool 必须被拒绝。
            if type(opening) not in (int, float) or not DOOR_OPENING_RANGE[0] <= opening <= DOOR_OPENING_RANGE[1]:
                raise HTTPException(422, "门的默认开度需在 0–100% 之间。")
