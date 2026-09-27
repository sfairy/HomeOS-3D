"""HA 连接器的共享常量：事件类型白名单、增量落库间隔、注册表防抖与探活超时、logger。
"""
from __future__ import annotations
import logging


LOGGER = logging.getLogger(__name__)
# 需要订阅的实时事件；三个 *_registry_updated 用于增量维护元数据（改名、换区、禁用）。
LIVE_EVENT_TYPES = ('state_changed', 'entity_registry_updated', 'device_registry_updated', 'area_registry_updated')
# 端点探测的单独超时（秒）。比常规 REST 超时短得多：探测要回答的是「这一路现在能不能用」，
HA_ENDPOINT_PROBE_TIMEOUT_SECONDS = 2.5
# 已知实体的状态事件在这段时间内不写库：功率/温度类实体可能每秒多条，逐条落库会打爆数据库。
INCREMENTAL_FLUSH_SECONDS = 10
# 注册表变更事件的防抖窗口：一次改名/换区往往连发多条事件，合并成一次全量注册表刷新。
REGISTRY_REFRESH_DEBOUNCE_SECONDS = 1.5
