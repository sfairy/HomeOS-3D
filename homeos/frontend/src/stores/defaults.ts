/**
 * UI 布局默认配置数据模块
 *
 * 职责：提供 UILayoutConfig 类型的完整默认对象工厂，从历史 ui facade 提取为纯数据模块，
 *      不依赖 Pinia/Vue 响应式 API；包含楼层/部件/收藏实体/事件日志/页脚/导航/HA 配置/统计传感器/
 *      性能模式/楼层切换器/安防模式/地震预警/AI 助手/消息通道等全部默认字段。
 * 导出：
 *   - getDefaultLayout()：惰性缓存的默认布局实例（首次调用求值，后续同引用返回）
 * 依赖：constants 下的 energy-fields / dashboard-footer / whole-home-off / ha，
 *      types/earthquake（默认地震配置），types/layout（UILayoutConfig 类型）。
 */
import { createDefaultEnergySources } from '@/constants/energy-fields'
import { createDefaultDashboardFooter } from '@/constants/dashboard-footer'
import { createDefaultWholeHomeOff } from '@/constants/whole-home-off'
import { createDefaultEarthquakeConfig } from '@/types/earthquake'
import type { UILayoutConfig } from '@/types/layout'

/**
 * 构建默认布局
 *
 * 返回一份完整的 UILayoutConfig 默认对象，包含：
 * - 部件（floatingWidgets / rightPanelWidgets）
 * - 收藏实体分类（favoriteEntities）
 * - 事件日志与页脚配置（eventLogConfig / dashboardFooter）
 * - 导航标签可见性（navTabVisibility）
 * - HA 实体绑定配置（haConfig；连接地址/令牌单源在 stores/ha-connection.store.ts）
 * - 统计传感器映射（statsSensors）
 * - 性能与渲染模式（performanceMode / glassEffect）
 * - 安防模式定义与联动（securityModes / securityModeLinks / securityEmergency）
 * - 地震预警配置（earthquakeConfig）
 * - AI 助手与通知渠道配置（agentConfig / channelConfig）
 *
 * @returns 全新的 UILayoutConfig 默认对象（每次调用返回新实例）
 */
function createDefaultLayout(): UILayoutConfig {
  return {
    lightOnBackgroundUrl: '/backgrounds/light_on.png',
    lightOffBackgroundUrl: '/backgrounds/light_off.png',
    // 悬浮组件（顶层；原 per-floor floatingWidgets 已移除）
    floatingWidgets: [],
    pageMaxWidth: 1366,
    siteTitle: 'HomeOS',
    rightPanelWidth: 300,
    rightPanelWidgets: [],
    // 收藏实体按 domain 分类，初始均为空数组
    favoriteEntities: {
      light: [],
      climate: [],
      sensor: [],
      switch: [],
      offline: [],
      battery: [],
      media_player: [],
      cover: [],
      fan: [],
      lock: [],
    },
    // 事件日志浮层：默认开启，自定义位置
    eventLogConfig: {
      enabled: true,
      position: 'custom',
      xPct: 70,
      yPct: 78,
      width: 360,
      maxHeight: 200,
      displayDuration: 4,
    },
    dashboardFooter: createDefaultDashboardFooter(),
    panelPosition: 'right',
    navTabOrder: [],
    // 导航标签默认可见性：设备/安防默认显示
    navTabVisibility: {
      devices: true,
      rooms: false,
      security: true,
      events: false,
      notifications: false,
      'earthquake-history': false,
      'template-entities': false,
      reports: false,
    },
    navTabPlacement: {},
    wholeHomeOff: createDefaultWholeHomeOff(),
    // HA 实体绑定：门铃、安防摄像头、天气、扫地机、隐患传感器等
    // 连接地址/令牌不在这里 —— 见 stores/ha-connection.store.ts（单源 ha_connections 表）
    haConfig: {
      eventsPath: '',
      securityCamera: '',
      securityCameras: [],
      weatherEntityId: '',
      doorbells: [],
      motionSensorEntityId: '',
      hazardSmokeEntityIds: [],
      hazardGasEntityIds: [],
      hazardLeakEntityIds: [],
      hazardEmergencySceneId: '',
      hazardGasValveEntityId: '',
      hazardWaterValveEntityId: '',
      hazardExhaustFanEntityIds: '',
      hazardDrillMode: false,
    },
    // 统计传感器：灯/空调/电量/离线计数实体 ID
    statsSensors: {
      lights: '',
      climates: '',
      battery: '',
      offline: '',
      energySources: createDefaultEnergySources(),
    },
    performanceMode: 'high',
    smartPerformanceMode: true,
    glassEffect: 'auto',
    moviePilotUrl: '',
    awaySimulationLightPool: [],
    customEmbeds: [],
    embeddedPages: [],
    // 设置锁：默认关闭，PIN 为空
    settingsLock: { enabled: false, pin: '' },
    isAfhLocked: true,
    // 安防模式：离家 / 居家 / 夜间 / 撤防，对应 HA alarm_control_panel 的四种状态
    securityModes: [
      { key: 'armed_away', name: '离家', icon: 'Shield', actions: [] },
      { key: 'armed_home', name: '居家', icon: 'Home', actions: [] },
      { key: 'armed_night', name: '夜间', icon: 'Moon', actions: [] },
      { key: 'disarmed', name: '撤防', icon: 'ShieldOff', actions: [] },
    ],
    securityModeLinks: {
      armed_away: '',
      armed_home: '',
      armed_night: '',
      disarmed: '',
    },
    profileHomeMode: {
      autoActivate: false,
      onSwitch: '',
    },
    // 安防紧急模式：全屋联动，灯光全亮，可选自动离家布防
    securityEmergency: {
      mode: 'full_home',
      appendBuiltin: false,
      appendMode: 'full_home',
      lightBrightnessPct: 100,
      lightPool: [],
      autoArmAway: false,
      actions: [],
      useBuiltinFallback: true,
    },
    earthquakeConfig: createDefaultEarthquakeConfig(),
    // AI 助手配置：默认使用 DeepSeek
    agentConfig: {
      provider: 'deepseek',
      apiKey: '',
      apiBase: 'https://api.deepseek.com',
      model: 'deepseek-v4-flash',
      language: 'zh',
      systemPrompt: '',
      mcpGatewaySecret: '',
      mcpActorUserId: '',
      // 场景语音控制默认全禁（fail-closed）：需在设置中显式启用并勾选场景
      sceneVoiceControl: { enabled: false, allow: [] },
    },
    // 消息通道：Email / WebPush 默认关闭
    channelConfig: {
      email: {
        enabled: false,
        smtpHost: '',
        smtpPort: 587,
        smtpUser: '',
        smtpPassword: '',
        fromAddress: '',
        toAddresses: '',
        tlsEnabled: true,
      },
      webpush: {
        enabled: false,
        vapidPublicKey: '',
        vapidPrivateKey: '',
        subject: '',
      },
      wecom: {
        enabled: false,
        corpId: '',
        corpSecret: '',
        agentId: '',
        callbackToken: '',
        callbackAesKey: '',
        apiProxy: '',
        allowedUsers: '',
        boundHomeOsUserId: '',
      },
    },
    mobileRoomStats: {},
    // 远程访问地址：默认空，保存布局时下发给原生端，并随登录响应分发给已配对终端
    externalUrl: '',
  }
}

// 默认布局缓存：首次调用 getDefaultLayout 时求值并缓存，避免重复构建
let defaultLayoutCache: UILayoutConfig | null = null

/**
 * 获取惰性缓存的默认布局
 *
 * 首次访问时调用 createDefaultLayout() 求值并缓存，后续直接返回缓存对象。
 * 适用于只读场景；如需修改请自行深拷贝后再编辑。
 *
 * @returns 缓存的 UILayoutConfig 实例（同一引用）
 */
export function getDefaultLayout(): UILayoutConfig {
  if (!defaultLayoutCache) {
    defaultLayoutCache = createDefaultLayout()
  }
  return defaultLayoutCache
}

