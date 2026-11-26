/** Settings 面板 lazy import（按 NAV_STRUCTURE 六组组织） */
import { defineComponent, h, shallowRef, type Component } from 'vue'
import { lazyComponent } from '@/kernel/utils/core/lazy-component'
import ErrorBoundary from '@/kernel/ui/ErrorBoundary.vue'
import { isPinnedSettingsTab, settingsKeepAliveName } from '@/features/settings/utils/keep-alive.util'

/**
 * 创建懒加载面板组件。
 * - pinned：使用 keep-alive 命名组件，自管理 resolved 状态与加载占位
 * - 非 pinned：复用 lazyComponent，由其统一处理异步与错误态
 */
function lazyPanel(tabId: string, loader: () => Promise<{ default?: Component }>) {
  const pinned = isPinnedSettingsTab(tabId)
  // 已解析的面板组件；pinned 模式下缓存以常驻 keep-alive
  let resolved: Component | null = null
  // 进行中的加载 Promise，避免重复触发
  let pending: Promise<Component> | null = null

  // 解析面板组件：已解析直接返回，否则触发 loader 并缓存结果
  function resolvePanel(): Promise<Component> {
    if (resolved) return Promise.resolve(resolved)
    if (!pending) {
      pending = loader().then((mod) => {
        const panel = mod.default ?? (mod as unknown as Component)
        resolved = panel
        return panel
      })
    }
    return pending
  }

  // 渲染面板主体：未解析时返回加载占位，解析后用 ErrorBoundary 包裹实际面板
  function renderPanelBody(props: { activeTab: string }) {
    if (!resolved) {
      return h(
        'div',
        {
          class: 'settings-panel-loading',
          role: 'status',
          'aria-live': 'polite',
        },
        '加载中…',
      )
    }
    return h(ErrorBoundary, { title: tabId, fill: true }, () => h(resolved!, { activeTab: props.activeTab }))
  }

  // 非 pinned 路径：复用 lazyComponent，由其处理 Suspense/错误
  if (!pinned) {
    const AsyncPanel = lazyComponent(loader as () => Promise<Component>)
    return defineComponent({
      props: {
        activeTab: { type: String, default: '' },
      },
      setup(props) {
        return () => h(ErrorBoundary, { title: tabId, fill: true }, () => h(AsyncPanel, { activeTab: props.activeTab }))
      },
    })
  }

  // pinned 路径：keep-alive 命名组件，自管理加载 tick 触发重渲染
  return defineComponent({
    name: settingsKeepAliveName(tabId),
    props: {
      activeTab: { type: String, default: '' },
    },
    setup(props) {
      // 用 shallowRef 触发首次加载完成后的重渲染
      const loadTick = shallowRef(resolved ? 1 : 0)
      if (!resolved) {
        void resolvePanel().then(() => {
          loadTick.value++
        })
      }
      return () => {
        void loadTick.value
        return h('div', { class: 'settings-tab-panel-root' }, [renderPanelBody(props)])
      }
    },
  })
}

/** 入门与连接 */
const connectPanels = {
  'setup-wizard': lazyPanel('setup-wizard', () => import('@/features/settings/groups/onboarding/SetupWizardPanel.vue')),
  connection: lazyPanel('connection', () => import('@/features/settings/groups/onboarding/SettingsConnectionPanel.vue')),
  bindings: lazyPanel('bindings', () => import('@/features/settings/groups/onboarding/SettingsBindingsPanel.vue')),
  devices: lazyPanel('devices', () => import('@/features/settings/groups/onboarding/SettingsDeviceManagementPanel.vue')),
}

/** 家居配置（空间 + 能源 + 快捷设备） */
const homePanels = {
  rooms: lazyPanel('rooms', () => import('@/features/settings/groups/household/SettingsRoomsPanel.vue')),
  'device-profiles': lazyPanel(
    'device-profiles',
    () => import('@/features/settings/groups/household/SettingsDeviceProfilesPanel.vue'),
  ),
  'life-accounts': lazyPanel('life-accounts', () => import('@/features/settings/groups/household/SettingsLifeAccountsPanel.vue')),
  'smart-charge': lazyPanel('smart-charge', () => import('@/features/settings/groups/household/SettingsClientPowerPanel.vue')),
  favorites: lazyPanel('favorites', () => import('@/features/settings/groups/household/SettingsFavorites.vue')),
}

/** 界面与体验 */
const displayPanels = {
  general: lazyPanel('general', () => import('@/features/settings/groups/appearance/SettingsGeneralPanel.vue')),
  layout: lazyPanel('layout', () => import('@/features/settings/groups/appearance/SettingsLayoutPanel.vue')),
  widgets: lazyPanel('widgets', () => import('@/features/settings/groups/appearance/SettingsWidgetsPanel.vue')),
  floating: lazyPanel('floating', () => import('@/features/settings/groups/appearance/SettingsFloatingPanel.vue')),
  embeds: lazyPanel('embeds', () => import('@/features/settings/groups/appearance/SettingsEmbeds.vue')),
}

/** 自动化与安防 */
const automatePanels = {
  'home-mode': lazyPanel('home-mode', () => import('@/features/settings/groups/automation/SettingsHomeModePanel.vue')),
  'security-modes': lazyPanel(
    'security-modes',
    () => import('@/features/settings/groups/automation/SettingsSecurityModesPanel.vue'),
  ),
  'automation-drafts': lazyPanel(
    'automation-drafts',
    () => import('@/features/settings/groups/automation/SettingsAutomationDraftsPanel.vue'),
  ),
}

/** 感知交互 */
const interactPanels = {
  alerts: lazyPanel('alerts', () => import('@/features/settings/groups/perception/AlertRulesPanel.vue')),
  voice: lazyPanel('voice', () => import('@/features/settings/groups/perception/SettingsVoicePanel.vue')),
  agent: lazyPanel('agent', () => import('@/features/settings/groups/perception/SettingsAgentPanel.vue')),
  media: lazyPanel('media', () => import('@/features/settings/groups/perception/SettingsMediaPanel.vue')),
}

/** 系统与账户 */
const systemPanels = {
  profiles: lazyPanel('profiles', () => import('@/features/settings/groups/system/SettingsProfilesPanel.vue')),
  family: lazyPanel('family', () => import('@/features/settings/groups/system/SettingsFamilyPanel.vue')),
  access: lazyPanel('access', () => import('@/features/settings/groups/system/SettingsAccessPanel.vue')),
  diagnostics: lazyPanel('diagnostics', () => import('@/features/settings/groups/system/SettingsDiagnosticsPanel.vue')),
  network: lazyPanel('network', () => import('@/features/settings/groups/system/SettingsNetworkPanel.vue')),
  params: lazyPanel('params', () => import('@/features/settings/groups/system/ConfigPanel.vue')),
  retention: lazyPanel('retention', () => import('@/features/settings/groups/system/SettingsRetentionPanel.vue')),
  license: lazyPanel('license', () => import('@/features/settings/groups/system/SettingsLicensePanel.vue')),
}

/** PANEL_MAP：对象常量，字段 / 方法语义见定义处。 */
export const PANEL_MAP = {
  ...connectPanels,
  ...homePanels,
  ...displayPanels,
  ...automatePanels,
  ...interactPanels,
  ...systemPanels,
}
