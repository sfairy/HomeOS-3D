"""应用配置默认值（对齐 ``backend/src/shared/app-config/defaults.ts``）。

各分区默认值的权威来源；``DEFAULT_APP_CONFIG`` 为深拷贝基准，服务侧合并
DB 持久化数据时只补缺失键，不覆盖用户已设置的值。
"""

from __future__ import annotations

from typing import Any

from .rooms import DEFAULT_ROOM_CATALOG
from ...platform.core.db.retention import DEFAULT_RETENTION
from ...platform.security.entity_access import WS_PUSH_CRITICAL_DOMAINS

#: 认证安全默认值（对齐 ``@homeos/shared`` DEFAULT_AUTH_SECURITY）。
DEFAULT_AUTH_SECURITY: dict[str, int] = {
    "lockoutMaxAttempts": 5,
    "lockoutMinutes": 15,
    "sessionExpireDays": 30,
}

#: 语音告警默认开关矩阵（对齐 packages/shared/src/notification/voice-alert.ts）。
DEFAULT_VOICE_ALERT_RULES: dict[str, bool] = {
    "enabled": True,
    "securityZone": True,
    "securityAnomaly": True,
    "safetySmoke": True,
    "safetyGas": True,
    "safetyWater": True,
    "securityEmergency": True,
    "presenceLeft": True,
    "energyAnomaly": True,
    "energyBudget": False,
    "waterAnomaly": True,
    "envMoldRisk": False,
    "notificationDanger": True,
    "notificationWarn": False,
}

#: 客户端智能充放电全局默认（不含客户端列表）。
DEFAULT_CLIENT_POWER_SETTINGS: dict[str, Any] = {
    "enabled": False,
    "reportIntervalSec": 10,
    "staleTimeoutSec": 300,
    "cooldownMin": 5,
    "linkageRetryCount": 2,
    "linkageRetryDelayMs": 5000,
}

#: EventLog 写入降噪默认域级黑名单。
DEFAULT_EVENT_LOG_RECORD_BLOCK_DOMAINS: tuple[str, ...] = (
    "camera",
    "image",
    "update",
    "device_tracker",
    "event",
    "sun",
    "weather",
    "zone",
)

#: HA 入口合并默认域（高频读数 / 位置 / 更新推送）。
DEFAULT_INGRESS_COALESCE_DOMAINS: tuple[str, ...] = (
    "sensor",
    "binary_sensor",
    "device_tracker",
    "update",
)


def build_default_env_sensor_map() -> dict[str, dict[str, str]]:
    """构建默认环境传感器映射（每个房间仅写入 ``label=defaultLabel``）。"""
    return {room.id: {"label": room.default_label} for room in DEFAULT_ROOM_CATALOG}


def _default_auth_and_notify_sections() -> dict[str, Any]:
    """认证（登录风控 / 会话）+ 通知（开关 / 名额 / 去重冷却）。"""
    return {
        # 认证配置
        "auth": {
            "lockoutMaxAttempts": DEFAULT_AUTH_SECURITY["lockoutMaxAttempts"],
            "lockoutMinutes": DEFAULT_AUTH_SECURITY["lockoutMinutes"],
            "sessionExpireDays": DEFAULT_AUTH_SECURITY["sessionExpireDays"],
            "loginAlertEnabled": True,
            "newDeviceAlertEnabled": True,
            "newDeviceAlertCooldownMin": 1440,
            "bruteForceAlertEnabled": True,
        },
        # 通知配置
        "notification": {
            "dndStart": 22,
            "dndEnd": 8,
            "maxNotifications": 500,
            "globalNotifyEnabled": True,
            "importantNotifyEnabled": True,
            "offlineNotifyEnabled": True,
            "lowBatteryNotifyEnabled": True,
            "offlineCooldownMin": 30,
            "lowBatteryCooldownMin": 120,
        },
    }


def _default_safety_and_iaq_sections() -> dict[str, Any]:
    """用水监测 / 安防（含 Frigate 与离家模拟）/ 昼夜节律 / 空气质量。"""
    return {
        # 用水监测配置
        "water": {
            "anomalyCooldownMin": 30,
            "mainValveEntityId": "",
        },
        # 安防配置
        "security": {
            "sensorAlertCooldownSec": 60,
            "awayConfirmMin": 5,
            "homeConfirmMin": 2,
            "requireConfiguredPersons": True,
            "presencePersons": [],
            "mmWaveFusePresence": True,
            "autoArmOnEveryoneLeft": False,
            "autoUpgradeToAwayOnEveryoneLeft": False,
            "calendarArmOnAway": False,
            "autoDisarmOnFirstHome": False,
            "linkAwaySimOnArmAway": False,
            "linkHomeModeOnSecurityChange": True,
            "frigatePersonAlarmModes": "armed_away,armed_night",
            "emergencyCooldownSec": 60,
            "frigateMaxEvents": 50,
            "frigateDedupMs": 30_000,
            "awaySimBrightnessMin": 40,
            "awaySimBrightnessRange": 50,
            "awaySimIntervalMinMax": {"min": 8, "max": 25},
            "configCacheTtlMs": 60_000,
            "alertChannels": ["in_app"],
            "alertBypassDnd": True,
            "armExitGraceSeconds": 30,
        },
        # 昼夜节律照明配置
        "circadian": {
            "weatherEntityId": "",
        },
        "iaq": {
            "moldAlertCooldownMin": 10,
        },
    }


def _default_security_sections() -> dict[str, Any]:
    """认证 / 通知 / 用水 / 安防 / 昼夜节律 / 空气质量默认分区。

    拆成两个子块只为可读性与函数长度；`**` 合并顺序即 `DEFAULT_APP_CONFIG` 的键序，
    因此子块顺序不能调换（配置导出与前端快照都按该顺序比对）。
    """
    return {
        **_default_auth_and_notify_sections(),
        **_default_safety_and_iaq_sections(),
    }


def _default_energy_sections() -> dict[str, Any]:
    """能源监测（总表 / 回路 / 学习期）+ 电价计费（分时与阶梯）。"""
    return {
        # 能源监测配置
        "energy": {
            "meterEntityId": "",
            "circuitEntityIds": [],
            "learningPeriodDays": 7,
            "learningStartedAt": "",
            "anomalyCooldownMin": 60,
            "budgetAlertCooldownMin": 720,
        },
        # 电价计费配置
        "pricing": {
            "pricingMode": "tiered",
            "fixedPrice": 0.4883,
            "regionLabel": "",
            "timeOfUseEnabled": True,
            "peakStart1": "8:00",
            "peakEnd1": "11:00",
            "peakStart2": "18:00",
            "peakEnd2": "23:00",
            "valleyStart": "23:00",
            "valleyEnd": "7:00",
            "peakPrice": 0,
            "valleyPrice": 0,
            "flatPrice": 0,
            "tier1Kwh": 2880,
            "tier1Price": 0.4883,
            "tier2Price": 0.5383,
            "tier3Price": 0.7883,
        },
    }


def _default_misc_and_frontend_sections() -> dict[str, Any]:
    """其他杂项（日志保留 / 冷却）+ 前端运行时（超时 / 重试 / 实体缓存 / 监听上限）。"""
    return {
        # 其他杂项配置
        "other": {
            "eventlogRetentionDays": 7,
            "haHistoryCacheMin": 5,
            "speakCooldownMin": 10,
            "tipCooldownHours": 2,
            "advisorTipActions": {},
            "setupChecklistDismissedAt": None,
        },
        # 前端配置
        "frontend": {
            "apiTimeoutMs": 15000,
            "apiRetryMax": 2,
            "haDisconnectDebounceMs": 5000,
            "initialStatesWaitMs": 8000,
            "entityCacheEnabled": True,
            "entityCacheMaxAgeMs": 24 * 60 * 60 * 1000,
            "entityCacheSaveDebounceMs": 10_000,
            "rebuildChunkSize": 500,
            "rebuildDebounceMs": 50,
            "maxListeners": 200,
            "callDedupWindowMs": 500,
            "maxRemoteNotifications": 100,
            "sessionRefreshHours": 6,
            "widgetPollIntervals": {},
            "optimisticTtlMs": 6000,
            "largeEntityThreshold": 2000,
            "workerDerivedThreshold": 2000,
            "initStatesBatchSize": 400,
            "apiRetryDelayMs": 1000,
        },
    }


def _default_profile_and_ui_sections() -> dict[str, Any]:
    """用户配置文件（激活档案 / 终端绑定）+ 界面缩放与主题色。"""
    return {
        # 用户配置文件配置
        "profiles": {
            "activeProfileId": "default",
            "newTerminalDefault": "activeProfile",
            "terminalBindings": [],
        },
        # 用户界面配置
        # accentColor 默认系统蓝：暖铜（#ffc46a）只属于 597637a3 的收敛配色，
        # 新装实例直接落到彩色模块主题，不再需要前端运行时兜底迁移。
        "ui": {
            "scaleBaseWidth": 1366,
            "scaleBaseHeight": 1024,
            "accentColor": "#3b82f6",
        },
    }


def _default_energy_and_frontend_sections() -> dict[str, Any]:
    """能源 / 电价 / 杂项 / 前端 / 用户配置文件 / 界面默认分区。

    三个子块的 `**` 顺序即键序，调换会让配置导出的 diff 变成全量抖动。
    """
    return {
        **_default_energy_sections(),
        **_default_misc_and_frontend_sections(),
        **_default_profile_and_ui_sections(),
    }


def _screensaver_defaults() -> dict[str, Any]:
    """屏保：启用开关、空闲超时与各元素字号（按视口宽度 vw 缩放，屏越小字越小）。"""
    return {
        "screensaverEnabled": True,
        "screensaverIdleMs": 120000,
        "scale": 1.35,
        "defaultMode": "random",
        "enableWeatherMode": False,
        "instantEnter": True,
        "instantLeave": True,
        "brightness": 1,
        "showBrand": True,
        "showSeconds": True,
        "showGregorianDate": True,
        "showLunar": True,
        "showWeatherIcon": True,
        "showWeatherDesc": True,
        "showWeatherStats": True,
        "showWeatherMeta": True,
        "timeSizeVw": 24,
        "sepSizeVw": 17,
        "secSizeVw": 7,
        "metaSizeVw": 3,
        "subMetaSizeVw": 2,
        "brandSizePx": 22,
        "weatherTempSizeVw": 22,
        "weatherIconSizeVw": 10,
        "weatherStatsSizePx": 15,
        "brandTopVh": 5,
        "contentShiftVh": 0,
    }


def _external_service_defaults() -> dict[str, Any]:
    """外部服务：天气、TTS、日历、动态电价与天气告警。"""
    return {
        "openWeatherApiKey": "",
        "weatherLat": 39.9,
        "weatherLon": 116.4,
        "ttsMediaPlayerId": "",
        "ttsMediaPlayerIds": [],
        "calendarUrl": "",
        "calendarSyncMin": 60,
        "calendarSyncShortMin": 5,
        "calendarIncrementalEnabled": True,
        "weatherFallbackEntityId": "",
        "dynamicPricingEnabled": False,
        "dynamicPricingUrl": "",
        "dynamicPricingApiKey": "",
        "dynamicPricingRefreshHours": 24,
        "weatherAlertRefreshMs": 30 * 60_000,
        "weatherAlertEnabled": True,
        "weatherAlertNotifyLevel": "orange",
        "weatherAlertSceneId": "",
        "weatherAlertModeId": "",
        "weatherAlertCooldownMin": 120,
    }


def _ha_connector_defaults() -> dict[str, Any]:
    """HA 连接器：重连、入站合流、心跳与压缩状态流。"""
    return {
        "reconnectBaseMs": 1000,
        "maxReconnectDelayMs": 10_000,
        "historyCacheMaxSize": 300,
        "ingressCoalesceEnabled": True,
        "ingressCoalesceWindowMs": 8,
        "ingressCoalesceDomains": list(DEFAULT_INGRESS_COALESCE_DOMAINS),
        "syncOnlyEnabledEntities": True,
        # 应用层心跳：15s 一次 ping、单次等待 10s、连续 2 次未响应即判死。
        # 判死窗口 ≈ 25s（ping 间隔 + 超时），是「拔网线/Wi-Fi 漫游后墙屏多久变离线」
        # 的实际上限。此前 45s/25s×3 ≈ 120s：家庭网络抖动常被拖成两分钟「假死」，
        # 期间面板仍在展示冻结的旧值。WS 事件帧极少（一帧最多几百字节），
        # 15s 一次 ping 的额外流量可忽略。
        "wsPingIntervalMs": 15_000,
        "wsPongTimeoutMs": 10_000,
        "wsHeartbeatMaxMisses": 2,
        # 压缩状态流（HA ``subscribe_entities``）：把入站事件从「全量 old/new state」
        # 换成「增量 diff」，大户型的入站流量通常能降一个数量级。
        # 默认关闭，用影子对比验证后再切默认；关闭时行为与旧版完全一致。
        "useSubscribeEntities": False,
        # 诊断期影子对比：同时订阅 state_changed 校验解码结果（流量翻倍，别长期开）。
        "subscribeEntitiesShadow": False,
        # 重连时若距上次全量成功不足该窗口（且在用压缩状态流），跳过全量同步，
        # 由 subscribe_entities 首帧补齐差异 —— 一次 1 秒抖动不再等于数秒全量重建。
        "fastReconnectEnabled": True,
        "fastReconnectWindowMs": 120_000,
    }


def _ops_defaults() -> dict[str, Any]:
    """运维：保留策略、事件日志缓冲与分层采样、审计与自动备份。"""
    return {
        "retentionCleanupIntervalHours": 1,
        "retentionDeleteBatchSize": 800,
        "retentionFirstDelaySec": 15,
        "eventLogFlushIntervalMs": 5000,
        "eventLogMaxBuffer": 200,
        "eventLogMaxRequeueBuffer": 500,
        "eventLogTimelineMax": 500,
        "eventLogTimelineHours": 12,
        "eventLogOverlayHours": 2,
        "eventLogTierEnabled": True,
        "eventLogTierCSampleRate": 0,
        "eventLogSkipSensorTimeline": True,
        "eventLogRecordFilterEnabled": True,
        "eventLogRecordFilterMode": "block",
        "eventLogRecordBlockDomains": list(DEFAULT_EVENT_LOG_RECORD_BLOCK_DOMAINS),
        "eventLogRecordAllowDomains": [],
        "eventLogRecordBlockEntityIds": [],
        "configAuditMaxEntries": 100,
        "configAuditPersistEnabled": False,
        "sceneExecHistoryMax": 100,
        "scriptExecHistoryMax": 80,
        "autoBackupEnabled": True,
        "autoBackupRetainDays": 7,
        "homeTimezone": "Asia/Shanghai",
    }


def _default_device_sections() -> dict[str, Any]:
    """屏保 / 外部服务 / HA 连接器 / 运维默认分区。

    四个子块各自独立成函数（每块一类配置，改一处不必在 100 行字面量里找位置）；
    这里只负责按固定顺序拼接 —— **顺序即 `/api/v1/config` 的键序**，前端按序渲染
    设置页分区，调整顺序会改变界面分组顺序，属行为变更。
    """
    return {
        "screensaver": _screensaver_defaults(),
        "external": _external_service_defaults(),
        "haConnector": _ha_connector_defaults(),
        "ops": _ops_defaults(),
    }


def _default_data_pipeline_sections() -> dict[str, Any]:
    """历史保留 / 状态存储 / WS 推送 / 命令代理 / WebRTC 默认分区。"""
    return {
        # 各业务表历史数据保留天数
        "retention": dict(DEFAULT_RETENTION),
        # 状态存储配置
        "stateStore": {
            "maxRecentChanges": 3000,
            "staleThresholdMs": 12_000,
            "initialStatesPriorityEnabled": True,
        },
        # WebSocket 推送配置
        "wsPush": {
            "sensorFlushIntervalMs": 120,
            "criticalDomains": list(WS_PUSH_CRITICAL_DOMAINS),
            "stateBatchMax": 300,
            "haSyncWaitMs": 90_000,
            "replayChunkSize": 400,
            "roomBatchEmit": True,
            "coldEntityOnDemand": True,
            "latencyProfile": "realtime",
        },
        # 命令代理配置
        "commandProxy": {
            "idempotencyTtlMs": 3000,
            "idempotencyCleanupIntervalMs": 60_000,
        },
        # WebRTC 配置
        "webrtc": {
            "iceUrls": "",
            "iceUsername": "",
            "iceCredential": "",
        },
    }


def _default_home_mode_and_media_sections() -> dict[str, Any]:
    """家庭模式 / 环境传感器映射 / 媒体播放列表 / 语音 / 语音命令默认分区。"""
    return {
        # 家庭模式配置
        "homeMode": {
            "triggerCooldownMs": 60_000,
            "applyMaxRetries": 2,
            "maxTriggerLogs": 50,
            "maxExecHistory": 100,
            "showAwayButton": True,
            "showHomeMode": True,
            "manualLockTtlMin": 30,
            "linkageClaimTtlMin": 15,
        },
        # 环境传感器映射（由房间目录构建）
        "envSensorMap": build_default_env_sensor_map(),
        # 媒体播放列表配置
        "mediaPlaylists": {},
        # 语音配置
        "voice": {
            "sttMode": "browser",
            "language": "zh-CN",
            "sttEntityId": "",
            "useHaConversation": False,
            "agentFallback": False,
            "dailyAdvisorSpeak": False,
            "dailyAdvisorSpeakHour": 20,
            "dailyAdvisorTtsDaytime": "",
            "dailyAdvisorTtsEvening": "",
            "interactionMode": "push",
            "wakeWordEnabled": False,
            "wakeWords": ["小智"],
            "continuousConversation": False,
            "ttsEnabled": True,
            "ttsOutputMode": "ha",
            "ttsAlerts": dict(DEFAULT_VOICE_ALERT_RULES),
            "ttsAlertTemplates": {},
            "customTtsAlerts": [],
            "entityTtsAlerts": [],
        },
        # 语音命令列表
        "voiceCommands": [],
    }


def _default_client_power_section() -> dict[str, Any]:
    """客户端功耗上报（间隔 / 超时 / 冷却 / 联动重试）。"""
    return {
        # 客户端功耗配置
        "clientPower": {
            "enabled": DEFAULT_CLIENT_POWER_SETTINGS["enabled"],
            "reportIntervalSec": DEFAULT_CLIENT_POWER_SETTINGS["reportIntervalSec"],
            "staleTimeoutSec": DEFAULT_CLIENT_POWER_SETTINGS["staleTimeoutSec"],
            "cooldownMin": DEFAULT_CLIENT_POWER_SETTINGS["cooldownMin"],
            "linkageRetryCount": DEFAULT_CLIENT_POWER_SETTINGS["linkageRetryCount"],
            "linkageRetryDelayMs": DEFAULT_CLIENT_POWER_SETTINGS["linkageRetryDelayMs"],
            "clients": [],
        },
    }


def _default_runtime_sections() -> dict[str, Any]:
    """保留天数 / 状态存储 / WS 推送 / 命令代理 / WebRTC / 家庭模式 / 语音 / 客户端功耗默认分区。

    三个子块的 `**` 顺序即键序，调换会让配置导出的 diff 变成全量抖动。
    """
    return {
        **_default_data_pipeline_sections(),
        **_default_home_mode_and_media_sections(),
        **_default_client_power_section(),
    }


def build_default_app_config() -> dict[str, Any]:
    """返回一份全新的应用配置默认值（每次调用构造新对象，避免跨调用共享引用）。"""
    return {
        **_default_security_sections(),
        **_default_energy_and_frontend_sections(),
        **_default_device_sections(),
        **_default_runtime_sections(),
    }


#: 各配置分区默认值（模块级单例，只读使用；需要修改时先深拷贝）。
DEFAULT_APP_CONFIG: dict[str, Any] = build_default_app_config()

__all__ = [
    "DEFAULT_APP_CONFIG",
    "DEFAULT_AUTH_SECURITY",
    "DEFAULT_CLIENT_POWER_SETTINGS",
    "DEFAULT_EVENT_LOG_RECORD_BLOCK_DOMAINS",
    "DEFAULT_INGRESS_COALESCE_DOMAINS",
    "DEFAULT_VOICE_ALERT_RULES",
    "build_default_app_config",
    "build_default_env_sensor_map",
]
