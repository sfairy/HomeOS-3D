"""客户端能力码目录（中文名 + 说明）。

**唯一真源是仓库根的 ``ops/feature_codes.json``**：主应用（``homeos``）与本商店项目都从
它派生同一份能力码目录，因此商店签进租约的码与主应用门禁用的码永远一一对应。

运行期加载策略（两段，缺一不可）：

1. 优先读取磁盘上的 ``ops/feature_codes.json``（开发 / 测试 / 源码部署）。路径从本文件
   逐级上溯查找，也可用环境变量 ``HOMEOS_FEATURE_CODES_PATH`` 显式指定。
2. 读不到时回退到下方 ``_CATALOG_JSON`` —— **发行的加密镜像里没有 ``ops/`` 目录**
   （见根 Dockerfile：产物只允许 ``.so``），所以这份内嵌副本必须与 JSON 一致。
   ``ops/check_feature_codes.py`` 会强制校验两者逐字段相等，防止它悄悄漂移。
"""

from __future__ import annotations

import json
import os
from pathlib import Path

#: 内嵌的能力码目录（与 ``ops/feature_codes.json`` 逐字段一致；见模块注释）。
_CATALOG_JSON = """
{
  "version": 1,
  "wildcard": "all",
  "groups": [
    { "key": "base", "label": "基础能力" },
    { "key": "module", "label": "增量模块" }
  ],
  "features": [
    { "code": "api", "label": "接口访问", "group": "base", "base": true, "grantedByAll": true, "impliedBy": [], "description": "客户端登录后读写业务数据的通用接口，其余能力码的前置条件。" },
    { "code": "assets", "label": "素材资源", "group": "base", "base": true, "grantedByAll": true, "impliedBy": [], "description": "读取内置素材库与用户上传的图片等资源。" },
    { "code": "editor", "label": "仪表盘编辑器", "group": "base", "base": true, "grantedByAll": true, "impliedBy": [], "description": "打开编辑器，创建与修改仪表盘布局。" },
    { "code": "display", "label": "中控展示", "group": "base", "base": true, "grantedByAll": true, "impliedBy": [], "description": "打开正式展示页（墙屏只读总览）并读取其数据接口。" },
    { "code": "ha.sync", "label": "Home Assistant 同步", "group": "base", "base": true, "grantedByAll": true, "impliedBy": [], "description": "同步 Home Assistant 的实体与实时状态。" },
    { "code": "ha.configure", "label": "Home Assistant 配置", "group": "base", "base": true, "grantedByAll": true, "impliedBy": [], "description": "配置 Home Assistant 连接地址与集成参数。" },
    { "code": "ha.control", "label": "Home Assistant 控制", "group": "base", "base": true, "grantedByAll": true, "impliedBy": [], "description": "下发灯光、开关、空调、窗帘等设备控制指令。" },
    { "code": "projects.write", "label": "项目写入", "group": "base", "base": true, "grantedByAll": true, "impliedBy": [], "description": "新增或修改仪表盘项目数据。" },
    { "code": "runtime.websocket", "label": "实时通道", "group": "base", "base": true, "grantedByAll": true, "impliedBy": [], "description": "建立运行时 WebSocket，推送实时状态与事件。" },
    { "code": "module.3d_interaction", "label": "3D 交互", "group": "module", "base": false, "grantedByAll": true, "impliedBy": ["editor"], "description": "3D 交互舞台与控件增量包：灯、窗帘、空调、电视、扫地机等运行时面板。" },
    { "code": "module.security", "label": "安防监控", "group": "module", "base": false, "grantedByAll": true, "impliedBy": [], "description": "安防监控：摄像头实时画面、报警与门铃事件面板。" },
    { "code": "module.notifications", "label": "通知中心", "group": "module", "base": false, "grantedByAll": true, "impliedBy": [], "description": "通知中心：站内通知、推送渠道与规则管理。" },
    { "code": "module.earthquake", "label": "地震预警", "group": "module", "base": false, "grantedByAll": true, "impliedBy": [], "description": "地震预警：接入预警数据源并推送预警事件。" },
    { "code": "module.energy", "label": "能耗管理", "group": "module", "base": false, "grantedByAll": true, "impliedBy": [], "description": "能耗管理：电表与能源统计、费用视图。" },
    { "code": "module.home_mode", "label": "场景模式", "group": "module", "base": false, "grantedByAll": true, "impliedBy": [], "description": "回家 / 离家等场景模式的编排与一键切换。" },
    { "code": "module.voice", "label": "语音助手", "group": "module", "base": false, "grantedByAll": true, "impliedBy": [], "description": "语音助手：语音唤醒、识别与语音控制。" },
    { "code": "module.agent", "label": "AI 助手", "group": "module", "base": false, "grantedByAll": true, "impliedBy": [], "description": "AI 助手：智能体对话与自动化指令编排。" },
    { "code": "module.media", "label": "影视媒体", "group": "module", "base": false, "grantedByAll": true, "impliedBy": [], "description": "影视媒体：媒体库浏览与播放控制。" }
  ]
}
"""

EMBEDDED_CATALOG: dict = json.loads(_CATALOG_JSON)


def _find_catalog_file() -> Path | None:
    """从环境变量或逐级上溯定位 ``ops/feature_codes.json``；找不到返回 ``None``。"""
    override = os.getenv("HOMEOS_FEATURE_CODES_PATH", "").strip()
    if override:
        candidate = Path(override)
        if candidate.is_file():
            return candidate
    for parent in Path(__file__).resolve().parents:
        candidate = parent / "ops" / "feature_codes.json"
        if candidate.is_file():
            return candidate
    return None


def load_catalog() -> dict:
    """读取能力码目录：优先磁盘真源，缺失/损坏时回退内嵌副本。"""
    path = _find_catalog_file()
    if path is not None:
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            data = None
        if isinstance(data, dict) and data.get("features"):
            return data
    return EMBEDDED_CATALOG


CATALOG: dict = load_catalog()

FEATURE_GROUPS: tuple[tuple[str, str], ...] = tuple(
    (group["key"], group["label"]) for group in CATALOG["groups"]
)

FEATURE_CATALOG: tuple[dict[str, str], ...] = tuple(
    {
        "code": feature["code"],
        "label": feature["label"],
        "group": feature["group"],
        "description": feature.get("description", ""),
    }
    for feature in CATALOG["features"]
)

FEATURE_CODES: frozenset[str] = frozenset(item["code"] for item in FEATURE_CATALOG)

#: 基础能力码（编辑器整包包含的能力）：``base: true`` 的项。
BASE_PRODUCT_FEATURES: tuple[str, ...] = tuple(
    feature["code"] for feature in CATALOG["features"] if feature.get("base")
)

#: 全部增量模块码（``base: false``）：可单独售卖，也被 ``all`` 覆盖。
MODULE_FEATURES: tuple[str, ...] = tuple(
    feature["code"] for feature in CATALOG["features"] if not feature.get("base")
)

#: 3D 交互增量包（保持既有名字，供商城内置商品种子使用）。
MODULE_3D_FEATURES: tuple[str, ...] = tuple(
    code for code in MODULE_FEATURES if code == "module.3d_interaction"
)


def feature_catalog_payload() -> dict:
    """后台下拉多选直接渲染这个结构。"""
    label_by_key = dict(FEATURE_GROUPS)
    return {
        "groups": [{"key": key, "label": label} for key, label in FEATURE_GROUPS],
        "items": [
            {**item, "groupLabel": label_by_key.get(item["group"], item["group"])}
            for item in FEATURE_CATALOG
        ],
    }


__all__ = [
    "BASE_PRODUCT_FEATURES",
    "CATALOG",
    "EMBEDDED_CATALOG",
    "FEATURE_CATALOG",
    "FEATURE_CODES",
    "FEATURE_GROUPS",
    "MODULE_3D_FEATURES",
    "MODULE_FEATURES",
    "feature_catalog_payload",
    "load_catalog",
]
