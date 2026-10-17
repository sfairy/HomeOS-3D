"""``HAConnectorService`` 的模块常量与纯函数（各族 mixin 共用）。"""

from __future__ import annotations

import logging

import httpx
import websockets.exceptions

from .client import HAClientError

#: 各族写同一路日志。名字必须落在 ``homeos`` 树里：主应用只给 ``homeos.*`` 与 uvicorn
#: 挂 handler（见 ``platform/core/log.py:configure_app_logging``），root 上没有 handler，
#: 树外日志会落到 ``logging.lastResort`` —— 无时间戳 / 无 pid 的裸消息写 stderr，且只放行
#: WARNING 以上。``homeos.ha_connector`` 在 ``log.py`` 的中文映射表里显示为「HA连接器」。
LOGGER = logging.getLogger("homeos.ha_connector")
HA_ENDPOINT_RECHECK_SECONDS = 60
LIVE_EVENT_TYPES = ('state_changed', 'entity_registry_updated', 'device_registry_updated', 'area_registry_updated')
INCREMENTAL_FLUSH_SECONDS = 10
REGISTRY_REFRESH_DEBOUNCE_SECONDS = 1.5
STATE_FETCH_RETRY_DELAYS = (0.2, 0.6)
HISTORY_FETCH_CONCURRENCY = 2
HISTORY_CACHE_SECONDS = 30
#: haConnector / other 高级参数（重连退避、心跳、历史缓存上限）的读取缓存窗口（秒）。
_HA_TUNING_TTL_SECONDS = 5.0
# 实体翻译表只随 HA 版本变化，编辑器/墙屏每次加载都重拉一遍纯属浪费（实测 12 个集成 ~3s）。
TRANSLATION_CACHE_SECONDS = 600
# 并发探测端点时，先用一个的成功结果之后，再给更高优先级端点留的追赶窗口。
ENDPOINT_PRIORITY_GRACE_SECONDS = 0.25
STATE_FETCH_REQUIRED_ATTRIBUTES = {
    'climate': {
        'fan_modes',
        'hvac_modes',
        'swing_modes',
        'temperature',
        'preset_modes',
        'supported_features',
        'current_temperature'} }

#: 一轮失败的归类：决定控制台用哪一档日志、要不要打堆栈（见 :func:`classify_connector_failure`）。
FAILURE_DISCONNECTED = 'disconnected'
FAILURE_OFFLINE = 'offline'
FAILURE_UNEXPECTED = 'unexpected'

#: 同类故障在控制台的重复提示间隔（秒）。
#:
#: HA 停机时重连退避封顶 10s ≈ 每分钟 6 轮，逐轮打一行会把控制台变成心跳；而原因没变时
#: 第 6 行不比第 1 行多任何信息。这里压到一分钟一行，其余降到 DEBUG（默认 info 级别看不到）。
OFFLINE_LOG_INTERVAL_SECONDS = 60.0


def classify_connector_failure(error: BaseException) -> str:
    """把一轮连接失败归成三类，决定日志应当多详细。

    HA 停机、Wi-Fi 切换、反向代理重启之后连接器会持续重试，这些失败对用户只有一句话的
    价值，堆栈也没有新增信息（每一轮的调用点是同一个），却会把控制台刷满：

    - ``FAILURE_DISCONNECTED``：实时连接被对端正常关闭（1000 / 1001），不是故障；
    - ``FAILURE_OFFLINE``：地址连不上、令牌失效、证书不受信任等**已知原因**的不可用
      （``HAClientError`` 已经把原因翻成了中文短句），只需要一行摘要；
    - ``FAILURE_UNEXPECTED``：其他异常，才值得保留完整堆栈。
    """
    if isinstance(error, websockets.exceptions.ConnectionClosedOK):
        return FAILURE_DISCONNECTED
    if isinstance(error, (
        websockets.exceptions.ConnectionClosed,
        HAClientError,
        httpx.HTTPError,
        OSError,
        TimeoutError,
    )):
        return FAILURE_OFFLINE
    return FAILURE_UNEXPECTED


def state_requires_fetch_retry(entity_id: str, state: dict | None) -> bool:
    """判断某个实体的状态是否缺失或残缺、需要重新拉取。

    不在 ``STATE_FETCH_REQUIRED_ATTRIBUTES`` 白名单里的域只要有状态就算完整；sensor 例外：
    unknown / unavailable 是「还没读到值」的占位状态，必须重拉，否则图表永远停在未知。
    """
    domain = entity_id.partition('.')[0]
    required_attributes = STATE_FETCH_REQUIRED_ATTRIBUTES.get(domain)
    if required_attributes is None:
        if state is None:
            return True
        return domain == 'sensor' and str(state.get('state') or '').strip().casefold() in {'unknown', 'unavailable'}
    attributes = state.get('attributes') if isinstance(state, dict) else None
    return not isinstance(attributes, dict) or not required_attributes.intersection(attributes)
