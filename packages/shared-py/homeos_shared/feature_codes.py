"""功能码目录加载（两端共用）。

真源是仓库根 ``ops/contracts/feature_codes.json``。开发态优先读磁盘；发行镜像没有 ``ops/``，
回退到本模块内嵌的 ``EMBEDDED_CATALOG``（须与 JSON 逐字段一致）。

判定语义（``granted`` / 租约展开）与商店运营展示（``feature_catalog_payload``）仍留在
各自后端 —— 这里只消灭「同份目录、两处粘贴」的漂移。
"""

from __future__ import annotations

import json
import os
from pathlib import Path

#: 内嵌副本（与 ``ops/contracts/feature_codes.json`` 逐字段一致）。
_CATALOG_JSON = """
{
  "version": 1,
  "wildcard": "all",
  "groups": [
    {
      "key": "base",
      "label": "基础能力"
    },
    {
      "key": "module",
      "label": "增量模块"
    }
  ],
  "features": [
    {
      "code": "api",
      "label": "接口访问",
      "group": "base",
      "base": true,
      "grantedByAll": true,
      "impliedBy": [],
      "description": "客户端登录后读写业务数据的通用接口，其余能力码的前置条件。"
    },
    {
      "code": "assets",
      "label": "素材资源",
      "group": "base",
      "base": true,
      "grantedByAll": true,
      "impliedBy": [],
      "description": "读取内置素材库与用户上传的图片等资源。"
    },
    {
      "code": "editor",
      "label": "仪表盘编辑器",
      "group": "base",
      "base": true,
      "grantedByAll": true,
      "impliedBy": [],
      "description": "打开编辑器，创建与修改仪表盘布局。"
    },
    {
      "code": "display",
      "label": "中控展示",
      "group": "base",
      "base": true,
      "grantedByAll": true,
      "impliedBy": [],
      "description": "打开正式展示页（墙屏只读总览）并读取其数据接口。"
    },
    {
      "code": "ha.sync",
      "label": "Home Assistant 同步",
      "group": "base",
      "base": true,
      "grantedByAll": true,
      "impliedBy": [],
      "description": "同步 Home Assistant 的实体与实时状态。"
    },
    {
      "code": "ha.configure",
      "label": "Home Assistant 配置",
      "group": "base",
      "base": true,
      "grantedByAll": true,
      "impliedBy": [],
      "description": "配置 Home Assistant 连接地址与集成参数。"
    },
    {
      "code": "ha.control",
      "label": "Home Assistant 控制",
      "group": "base",
      "base": true,
      "grantedByAll": true,
      "impliedBy": [],
      "description": "下发灯光、开关、空调、窗帘等设备控制指令。"
    },
    {
      "code": "projects.write",
      "label": "项目写入",
      "group": "base",
      "base": true,
      "grantedByAll": true,
      "impliedBy": [],
      "description": "新增或修改仪表盘项目数据。"
    },
    {
      "code": "runtime.websocket",
      "label": "实时通道",
      "group": "base",
      "base": true,
      "grantedByAll": true,
      "impliedBy": [],
      "description": "建立运行时 WebSocket，推送实时状态与事件。"
    },
    {
      "code": "module.3d_interaction",
      "label": "3D 交互",
      "group": "module",
      "base": false,
      "grantedByAll": true,
      "impliedBy": [
        "editor"
      ],
      "description": "3D 交互舞台与控件增量包：灯、窗帘、空调、电视、扫地机等运行时面板。"
    },
    {
      "code": "module.security",
      "label": "安防监控",
      "group": "module",
      "base": false,
      "grantedByAll": true,
      "impliedBy": [],
      "description": "安防监控：摄像头实时画面、报警与门铃事件面板。"
    },
    {
      "code": "module.notifications",
      "label": "通知中心",
      "group": "module",
      "base": false,
      "grantedByAll": true,
      "impliedBy": [],
      "description": "通知中心：站内通知、推送渠道与规则管理。"
    },
    {
      "code": "module.earthquake",
      "label": "地震预警",
      "group": "module",
      "base": false,
      "grantedByAll": true,
      "impliedBy": [],
      "description": "地震预警：接入预警数据源并推送预警事件。"
    },
    {
      "code": "module.energy",
      "label": "能耗管理",
      "group": "module",
      "base": false,
      "grantedByAll": true,
      "impliedBy": [],
      "description": "能耗管理：电表与能源统计、费用视图。"
    },
    {
      "code": "module.home_mode",
      "label": "场景模式",
      "group": "module",
      "base": false,
      "grantedByAll": true,
      "impliedBy": [],
      "description": "回家 / 离家等场景模式的编排与一键切换。"
    },
    {
      "code": "module.voice",
      "label": "语音助手",
      "group": "module",
      "base": false,
      "grantedByAll": true,
      "impliedBy": [],
      "description": "语音助手：语音唤醒、识别与语音控制。"
    },
    {
      "code": "module.agent",
      "label": "AI 助手",
      "group": "module",
      "base": false,
      "grantedByAll": true,
      "impliedBy": [],
      "description": "AI 助手：智能体对话与自动化指令编排。"
    },
    {
      "code": "module.media",
      "label": "影视媒体",
      "group": "module",
      "base": false,
      "grantedByAll": true,
      "impliedBy": [],
      "description": "影视媒体：媒体库浏览与播放控制。"
    }
  ]
}
"""

EMBEDDED_CATALOG: dict = json.loads(_CATALOG_JSON)


def find_catalog_file(*, start: Path | None = None) -> Path | None:
    """定位 ``ops/contracts/feature_codes.json``。

    优先 ``HOMEOS_FEATURE_CODES_PATH``；否则从 ``start``（默认本文件）逐级上溯。
    """
    override = os.getenv("HOMEOS_FEATURE_CODES_PATH", "").strip()
    if override:
        candidate = Path(override)
        if candidate.is_file():
            return candidate
    anchor = (start or Path(__file__)).resolve()
    for parent in [anchor, *anchor.parents]:
        candidate = parent / "ops" / "contracts" / "feature_codes.json"
        if candidate.is_file():
            return candidate
    return None


def load_catalog(*, start: Path | None = None) -> dict:
    """读取能力码目录：优先磁盘真源，缺失/损坏时回退内嵌副本。"""
    path = find_catalog_file(start=start)
    if path is not None:
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            data = None
        if isinstance(data, dict) and data.get("features"):
            return data
    return EMBEDDED_CATALOG


__all__ = [
    "EMBEDDED_CATALOG",
    "find_catalog_file",
    "load_catalog",
]
