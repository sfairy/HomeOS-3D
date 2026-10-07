"""功能码（能力码）的唯一登记处。

功能码是授权租约里的「能做什么」清单：商店按商品/权益签进租约，主应用按码放行路由。
以前这些字符串散在十个模块里（``api/assets.py``、``api/ha.py``、``app.py``、
``modules/interaction3d/access.py`` …），后果是**同一件事有两种写法**且没人能回答
「现在一共几个码」—— 最典型的是 ``all`` 的展开表漏了 ``module.3d_interaction``，
于是拿 ``all`` 的客户在 UI 上看到 3D 交互是关的、后端却按 ``editor`` 放行。

现在码目录的**唯一真源是仓库根的 ``ops/feature_codes.json``**（商店项目也从同一份
派生），本模块只负责把它加载进来并派生判定需要的数据结构：

1. ``FEATURE_*`` 各码的字面量（调用方一律引用常量，不再写字面串）；
2. :data:`GRANTED_BY_ALL`（``all`` 覆盖哪些码）与 :data:`IMPLIED_BY`（码之间的蕴含关系）；
3. :func:`granted`：唯一的判定实现 —— 租约 ``features`` + 未过期 ``entitlements`` →
   某个码是否可用。``LicenseService`` 与路由门禁都走它，避免再出现「两处判定、结果不同」。

运行期加载：优先读磁盘 ``ops/feature_codes.json``（开发/测试），读不到则回退内嵌副本
``EMBEDDED_CATALOG``（发行的加密镜像里没有 ``ops/`` 目录，见根 Dockerfile）。
``ops/check_feature_codes.py`` 会校验内嵌副本与 JSON 逐字段一致。
"""

from __future__ import annotations

import json
import os
from collections.abc import Collection, Iterable, Mapping
from datetime import UTC, datetime
from pathlib import Path

# --------------------------------------------------------------------------- #
# 功能码字面量
# --------------------------------------------------------------------------- #
#: 控制类 API（HA 代理的写操作）。
FEATURE_API = "api"
#: 素材（图片）读取与上传。
FEATURE_ASSETS = "assets"
#: 仪表盘 / 3D 编辑器整体能力。
FEATURE_EDITOR = "editor"
#: 展示页（墙屏）只读查看。
FEATURE_DISPLAY = "display"
#: HA 实体目录同步。
FEATURE_HA_SYNC = "ha.sync"
#: HA 设备控制。
FEATURE_HA_CONTROL = "ha.control"
#: HA 连接与集成配置。
FEATURE_HA_CONFIGURE = "ha.configure"
#: 仪表盘写操作。
FEATURE_PROJECTS_WRITE = "projects.write"
#: 运行时实时状态 WebSocket。
FEATURE_RUNTIME_WEBSOCKET = "runtime.websocket"
#: 3D 交互增量包（可随整包售卖，也可单独授权）。
FEATURE_INTERACTION_3D = "module.3d_interaction"
#: 安防监控增量包。
FEATURE_SECURITY = "module.security"
#: 通知中心增量包。
FEATURE_NOTIFICATIONS = "module.notifications"
#: 地震预警增量包。
FEATURE_EARTHQUAKE = "module.earthquake"
#: 能耗管理增量包。
FEATURE_ENERGY = "module.energy"
#: 场景模式增量包。
FEATURE_HOME_MODE = "module.home_mode"
#: 语音助手增量包。
FEATURE_VOICE = "module.voice"
#: AI 助手增量包。
FEATURE_AGENT = "module.agent"
#: 影视媒体增量包。
FEATURE_MEDIA = "module.media"

# --------------------------------------------------------------------------- #
# 目录加载（真源 ops/feature_codes.json，回退内嵌副本）
# --------------------------------------------------------------------------- #
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

#: 全部可被签发的功能码（基础能力 + 单独售卖的增量包）。
GRANTABLE_FEATURES: frozenset[str] = frozenset(
    feature["code"] for feature in CATALOG["features"]
)

#: 基础能力码：编辑器整包包含的全部能力（``base: true``）。
BASE_FEATURES: frozenset[str] = frozenset(
    feature["code"] for feature in CATALOG["features"] if feature.get("base")
)

#: 全部增量模块码（``base: false``）：可单独售卖，前端导航/视图据此按标志显隐。
MODULE_FEATURES: frozenset[str] = frozenset(
    feature["code"] for feature in CATALOG["features"] if not feature.get("base")
)

#: 租约里代表「全开」的通配码。
WILDCARD = str(CATALOG.get("wildcard") or "all")

#: ``all`` 覆盖的码。**必须包含** ``module.3d_interaction``：编辑器整包本就放行 3D 交互
#: （见 ``modules/interaction3d/access.py`` 的「``editor`` 或增量包，任一有效即放行」），
#: 所以 ``all``（含 ``editor``）若不含它，就会出现「后端放行、前端显示未开通」的矛盾。
GRANTED_BY_ALL: frozenset[str] = frozenset(
    feature["code"] for feature in CATALOG["features"] if feature.get("grantedByAll")
)


def _build_implied_by() -> Mapping[str, frozenset[str]]:
    """把 ``impliedBy``（每个码声明自己被哪些码蕴含）翻成 ``source -> {被蕴含码}``。"""
    table: dict[str, set[str]] = {}
    for feature in CATALOG["features"]:
        for source in feature.get("impliedBy") or []:
            if isinstance(source, str) and source:
                table.setdefault(source, set()).add(feature["code"])
    return {source: frozenset(codes) for source, codes in table.items()}


#: 码之间的蕴含关系：签发 ``key`` 等于同时签发 ``value`` 里的码。
#: 与 ``access.py`` 的判定口径对齐 —— 那里就是「``editor`` 或增量包，任一有效即放行」。
IMPLIED_BY: Mapping[str, frozenset[str]] = _build_implied_by()


def expand(features: Iterable[str]) -> set[str]:
    """把租约里的 ``features`` 展开成实际可用的码集合（处理 ``all`` 与蕴含关系）。"""
    granted_codes: set[str] = set()
    for item in features:
        if not isinstance(item, str) or not item:
            continue
        if item == WILDCARD:
            granted_codes |= GRANTED_BY_ALL
            continue
        granted_codes.add(item)
        implied = IMPLIED_BY.get(item)
        if implied:
            granted_codes |= implied
    return granted_codes


def _timestamp(value: object) -> datetime | None:
    """把租约里的时间戳解析成 UTC；给不出可判定值（缺失/非法）时返回 ``None``。"""
    if not isinstance(value, str) or not value:
        return None
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=UTC)
    return parsed.astimezone(UTC)


def active_entitlement_codes(entitlements: object, *, now: datetime) -> set[str]:
    """当前生效的权益码集合；形状不符（旧租约/畸形载荷）时忽略该项。

    时间戳解析失败按「不生效」处理，而不是「永久生效」：解析不了就无法证明它还没过期，
    这里必须 fail-closed。缺 ``startsAt``/``expiresAt`` 的权益视为长期有效（与商店侧
    ``features_for`` 的口径一致：没写有效期就是不过期）。
    """
    if not isinstance(entitlements, list):
        return set()
    codes: set[str] = set()
    for item in entitlements:
        if not isinstance(item, Mapping):
            continue
        code = item.get("code")
        if not isinstance(code, str) or not code:
            continue
        raw_starts = item.get("startsAt")
        if raw_starts:
            starts_at = _timestamp(raw_starts)
            if starts_at is None or starts_at > now:
                continue
        raw_expires = item.get("expiresAt")
        if raw_expires:
            expires_at = _timestamp(raw_expires)
            if expires_at is None or expires_at <= now:
                continue
        codes.add(code)
    return codes


def granted(
    features: Collection[str],
    entitlements: object,
    feature: str,
    *,
    now: datetime,
) -> bool:
    """某个功能码当前是否可用（唯一判定实现）。

    判定口径：租约 ``features`` 的展开式（``all`` + 蕴含关系）**或**未过期 ``entitlements``
    的展开式。两边都过 :func:`expand`，这样「有 ``editor`` 就等于有 3D 交互」在权益路径上
    同样成立，不必让每个调用点再补一次 ``or``。

    ``LicenseService`` 与路由门禁都必须走这里，否则「租约说开了、路由器说没开」这类
    矛盾又会从别处长出来。
    """
    if feature in expand(features):
        return True
    return feature in expand(active_entitlement_codes(entitlements, now=now))


#: ``code -> 中文名``（状态页/门禁文案可直接用）。
FEATURE_LABELS: Mapping[str, str] = {
    feature["code"]: feature["label"] for feature in CATALOG["features"]
}


__all__ = [
    "BASE_FEATURES",
    "CATALOG",
    "EMBEDDED_CATALOG",
    "FEATURE_AGENT",
    "FEATURE_API",
    "FEATURE_ASSETS",
    "FEATURE_DISPLAY",
    "FEATURE_EARTHQUAKE",
    "FEATURE_EDITOR",
    "FEATURE_ENERGY",
    "FEATURE_HA_CONFIGURE",
    "FEATURE_HA_CONTROL",
    "FEATURE_HA_SYNC",
    "FEATURE_HOME_MODE",
    "FEATURE_INTERACTION_3D",
    "FEATURE_LABELS",
    "FEATURE_MEDIA",
    "FEATURE_NOTIFICATIONS",
    "FEATURE_PROJECTS_WRITE",
    "FEATURE_RUNTIME_WEBSOCKET",
    "FEATURE_SECURITY",
    "FEATURE_VOICE",
    "GRANTABLE_FEATURES",
    "GRANTED_BY_ALL",
    "IMPLIED_BY",
    "MODULE_FEATURES",
    "WILDCARD",
    "active_entitlement_codes",
    "expand",
    "granted",
    "load_catalog",
]
