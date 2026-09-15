"""客户端能力码目录（中文名 + 说明）。

商品编辑里的「功能码」最终会写进租约的 ``features``，由主程序
``LicenseService.allows`` 逐项判定客户端能用哪些能力。代码本身是英文标识，
运营既记不住也抄不准；抄错一个字母不会报错——履约照发，客户端只是静默拦截。
所以后台不再手写代码，改用这里的中文目录渲染下拉多选。

代码清单必须与主项目保持一致：

* ``backend/app/license/service.py`` 的 ``BASE_FEATURES``（9 项基础能力）
* ``backend/app/modules/interaction3d/access.py`` 的 ``FEATURE``（3D 交互增量包）

新增能力码时先改主项目，再补到这里；两边对不上等于运营勾了发不出去的能力。
"""

from __future__ import annotations

#: 分组顺序即后台下拉里的展示顺序
FEATURE_GROUPS: tuple[tuple[str, str], ...] = (
    ("base", "基础能力"),
    ("module", "增量模块"),
)

#: 与主项目 ``BASE_FEATURES`` + ``module.3d_interaction`` 一一对应
FEATURE_CATALOG: tuple[dict[str, str], ...] = (
    {
        "code": "api",
        "label": "接口访问",
        "group": "base",
        "description": "客户端登录后读写业务数据的通用接口，其余能力码的前置条件。",
    },
    {
        "code": "assets",
        "label": "素材资源",
        "group": "base",
        "description": "读取内置素材库与用户上传的图片等资源。",
    },
    {
        "code": "editor",
        "label": "仪表盘编辑器",
        "group": "base",
        "description": "打开编辑器，创建与修改仪表盘布局。",
    },
    {
        "code": "display",
        "label": "中控展示",
        "group": "base",
        "description": "配对中控设备并打开正式展示页面。",
    },
    {
        "code": "ha.sync",
        "label": "Home Assistant 同步",
        "group": "base",
        "description": "同步 Home Assistant 的实体与实时状态。",
    },
    {
        "code": "ha.configure",
        "label": "Home Assistant 配置",
        "group": "base",
        "description": "配置 Home Assistant 连接地址与集成参数。",
    },
    {
        "code": "ha.control",
        "label": "Home Assistant 控制",
        "group": "base",
        "description": "下发灯光、开关、空调、窗帘等设备控制指令。",
    },
    {
        "code": "projects.write",
        "label": "项目写入",
        "group": "base",
        "description": "新增或修改仪表盘项目数据。",
    },
    {
        "code": "runtime.websocket",
        "label": "实时通道",
        "group": "base",
        "description": "建立运行时 WebSocket，推送实时状态与事件。",
    },
    {
        "code": "module.3d_interaction",
        "label": "3D 交互",
        "group": "module",
        "description": "3D 交互舞台与控件增量包：灯、窗帘、空调、电视、扫地机等运行时面板。",
    },
)

#: 全部已知代码，供校验/判重使用
FEATURE_CODES: frozenset[str] = frozenset(item["code"] for item in FEATURE_CATALOG)

#: code → 中文名
FEATURE_LABELS: dict[str, str] = {item["code"]: item["label"] for item in FEATURE_CATALOG}


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
