"""功能码（能力码）的主应用判定面。

码目录的**唯一真源是仓库根的 ``ops/contracts/feature_codes.json``**；加载与内嵌副本在
``homeos_shared.feature_codes``（商店同一份）。本模块只负责主应用侧派生：

1. ``FEATURE_*`` 各码的字面量（调用方一律引用常量，不再写字面串）；
2. :data:`GRANTED_BY_ALL`（``all`` 覆盖哪些码）与 :data:`IMPLIED_BY`（码之间的蕴含关系）；
3. :func:`granted`：唯一的判定实现 —— 租约 ``features`` + 未过期 ``entitlements`` →
   某个码是否可用。``LicenseService`` 与路由门禁都走它，避免再出现「两处判定、结果不同」。
"""

from __future__ import annotations

from collections.abc import Collection, Iterable, Mapping
from datetime import UTC, datetime

from homeos_shared.feature_codes import EMBEDDED_CATALOG, load_catalog

# 功能码字面量
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
        parsed = datetime.fromisoformat(value)
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


def declared_entitlement_codes(entitlements: object) -> set[str]:
    """租约 ``entitlements`` 里**声明过**的码（不看是否落在有效窗口内）。

    用来区分「快照永久授予」与「随权益到期失效」：同一个码同时出现在 ``features`` 与
    ``entitlements`` 时以后者声明的有效期为准。否则商店把限时增量包同时写进两者后，
    客户端只会在下一次续租（可能几小时后）才丢掉它 —— 租约有效期内会一直放行。
    """
    if not isinstance(entitlements, list):
        return set()
    codes: set[str] = set()
    for item in entitlements:
        if not isinstance(item, Mapping):
            continue
        code = item.get("code")
        if isinstance(code, str) and code:
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

    例外：某个码一旦在 ``entitlements`` 里声明过（说明商店是按**限时权益**卖它的），
    就不再由 ``features`` 永久放行 —— 否则限时增量包会因快照而「越权」，直到下次续租。
    """
    if feature in expand(features) and feature not in declared_entitlement_codes(entitlements):
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
    "declared_entitlement_codes",
    "expand",
    "granted",
    "load_catalog",
]
