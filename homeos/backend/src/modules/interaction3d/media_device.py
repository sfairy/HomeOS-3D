"""媒体设备身份：电视与投影仪共用一套绑定 / 控制 / 清理口径。

配置文件（``config_sections_devices``）、控制接口（``api.control_light``）与楼层清理
（``domains/studio3d/cleanup``）都从这里取分类名与模型类型，避免三处各写一份映射后漂移。

``screen`` 表示该种类是否有屏幕图层：电视有，投影仪没有 —— 投影仪带 ``screenImage``
必须 422，否则前端会渲染一块不该存在的画面。
"""

from typing import Any

MEDIA_DEVICE_PROFILES: dict[str, dict[str, Any]] = {
    "television": {
        "collection": "televisions",
        "model_type": "tv",
        "label": "电视",
        "screen": True,
    },
    "projector": {
        "collection": "projectors",
        "model_type": "projector",
        "label": "投影仪",
        "screen": False,
    },
}

#: 媒体设备在 ``devices`` 下的全部分类名（供白名单与清理集合展开使用）。
MEDIA_DEVICE_COLLECTIONS: tuple[str, ...] = tuple(profile["collection"] for profile in MEDIA_DEVICE_PROFILES.values())
