"""应用配置默认值（对齐 ``backend/src/shared/app-config/defaults.ts``）。

各分区默认值的权威来源；``DEFAULT_APP_CONFIG`` 为深拷贝基准，服务侧合并
DB 持久化数据时只补缺失键，不覆盖用户已设置的值。
"""

from __future__ import annotations

from typing import Any

from ..rooms import DEFAULT_ROOM_CATALOG
from ...core.retention import DEFAULT_RETENTION
from ...realtime.access import WS_PUSH_CRITICAL_DOMAINS

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

_WEATHER_SCENE_KEYS: tuple[str, ...] = (
    "clearDay",
    "clearNight",
    "partlyCloudy",
    "cloudy",
    "drizzle",
    "rain",
    "heavyRain",
    "thunderstorm",
    "snow",
    "sleet",
    "windy",
    "hail",
    "sandstorm",
)


def build_default_env_sensor_map() -> dict[str, dict[str, str]]:
    """构建默认环境传感器映射（每个房间仅写入 ``label=defaultLabel``）。"""
    return {room.id: {"label": room.default_label} for room in DEFAULT_ROOM_CATALOG}


def build_default_app_config() -> dict[str, Any]:
    """返回一份全新的应用配置默认值（每次调用构造新对象，避免跨调用共享引用）。"""
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
        # 用户配置文件配置
        "profiles": {
            "activeProfileId": "default",
            "newTerminalDefault": "activeProfile",
            "terminalBindings": [],
        },
        # 用户界面配置
        "ui": {
            "scaleBaseWidth": 1366,
            "scaleBaseHeight": 1024,
            "accentColor": "#3b82f6",
        },
        # 屏保配置（含启用开关与空闲超时）
        "screensaver": {
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
        },
        # 天气特效配置
        "weatherEffects": {
            "enabled": True,
            "preset": "realistic",
            "displayRoutes": ["dashboard"],
            "useEntityAttributes": True,
            "densityMultiplier": 0.78,
            "windMultiplier": 1,
            "attributeBlend": 0.92,
            "starCount": 110,
            "cloudLayers": 5,
            "shootingStarRate": 0.00035,
            "scenes": {key: {} for key in _WEATHER_SCENE_KEYS},
        },
        # 外部服务配置
        "external": {
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
            "weatherAlertsTtlMin": 30,
            "weatherAlertRefreshMs": 30 * 60_000,
            "weatherAlertEnabled": True,
            "weatherAlertNotifyLevel": "orange",
            "weatherAlertSceneId": "",
            "weatherAlertModeId": "",
            "weatherAlertCooldownMin": 120,
        },
        # HA 连接器配置
        "haConnector": {
            "reconnectBaseMs": 1000,
            "maxReconnectDelayMs": 10_000,
            "entityRegistryCacheMs": 300_000,
            "entityRegistryTimeoutMs": 45_000,
            "commandQueueMax": 20,
            "commandQueueTtlMs": 60_000,
            "historyCacheMaxSize": 300,
            "ingressCoalesceEnabled": True,
            "ingressCoalesceWindowMs": 8,
            "ingressCoalesceDomains": list(DEFAULT_INGRESS_COALESCE_DOMAINS),
            "disconnectRestPollEnabled": True,
            "disconnectRestPollInitialDelayMs": 1_000,
            "disconnectRestPollIntervalMs": 2_000,
            "disconnectRestPollTimeoutMs": 60_000,
            "syncOnlyEnabledEntities": True,
            "wsPingIntervalMs": 45_000,
            "wsPongTimeoutMs": 25_000,
            "wsHeartbeatMaxMisses": 3,
            "coldBatchWindowMs": 15,
            "coldBatchMax": 256,
            "leaderTtlMs": 8_000,
            "leaderRenewMs": 2_500,
        },
        # 运维配置
        "ops": {
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
        },
        # 各业务表历史数据保留天数
        "retention": dict(DEFAULT_RETENTION),
        # 状态存储配置
        "stateStore": {
            "redisWriteBatch": 200,
            "redisIncrementalFlushMs": 100,
            "maxRecentChanges": 3000,
            "staleThresholdMs": 12_000,
            "initialStatesPriorityEnabled": True,
        },
        # WebSocket 推送配置
        "wsPush": {
            "stateFlushIntervalMs": 80,
            "sensorFlushIntervalMs": 120,
            "criticalDomains": list(WS_PUSH_CRITICAL_DOMAINS),
            "stateBatchMax": 300,
            "haSyncWaitMs": 90_000,
            "replayChunkSize": 400,
            "roomBatchEmit": True,
            "coldEntityOnDemand": True,
            "latencyProfile": "realtime",
            "criticalFlushIntervalMs": 4,
            "pinnedSensorFlushIntervalMs": 16,
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
